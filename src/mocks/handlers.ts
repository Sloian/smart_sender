import { http, HttpResponse } from 'msw'
import {
  CAPTCHA_HEADER,
  CSRF_HEADER,
  errorTypeByStatus,
  type ErrorEnvelope,
  type FieldErrors,
  type LoginResponse,
  type Me,
  type Webhook,
  type WebhookList,
} from '../api/contract'
import { isRecord } from '../lib/is-record'
import { CSRF_TOKEN, MOCK_USER, now, state } from './state'

type ErrorStatus = 400 | 401 | 404 | 419

const errorMessages = {
  400: 'Bad request.',
  401: 'Unauthenticated.',
  404: 'Not found.',
  419: 'CSRF token mismatch.',
} as const satisfies Record<ErrorStatus, string>

const FINGERPRINT_PATTERN = /^[0-9a-f]{32}$/

function errorResponse(status: ErrorStatus) {
  const body: ErrorEnvelope = { error: { type: errorTypeByStatus[status], message: errorMessages[status] } }
  return HttpResponse.json(body, { status })
}

function validationError(payload: FieldErrors) {
  const body: ErrorEnvelope = {
    error: { type: errorTypeByStatus[422], message: 'The given data was invalid.', payload },
  }
  return HttpResponse.json(body, { status: 422 })
}

function hasValidCsrf(request: Request): boolean {
  return request.headers.get(CSRF_HEADER) === CSRF_TOKEN
}

function hasActiveSession(): boolean {
  if (!state.session) return false
  return state.session.expiresAt > now()
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await request.json()
    if (!isRecord(body)) return {}
    return body
  } catch {
    return {}
  }
}

function asString(value: unknown): string {
  if (typeof value === 'string') return value
  return ''
}

const emptyResponse = (status: 200 | 204) => new HttpResponse(null, { status })

const PAGE_SIZE = 10

function parsePage(value: string | null): number {
  if (value === null) return 1
  const parsed = Number.parseInt(value, 10)
  if (Number.isNaN(parsed)) return 1
  if (parsed < 1) return 1
  return parsed
}

function dropDeviceTokens(fingerprint: string) {
  for (const [token, owner] of state.deviceTokens) {
    if (owner === fingerprint) state.deviceTokens.delete(token)
  }
}

function isHttpUrl(value: string): boolean {
  if (!URL.canParse(value)) return false
  const { protocol, hostname } = new URL(value)
  if (protocol !== 'http:' && protocol !== 'https:') return false
  return hostname !== ''
}

export const handlers = [
  http.get('*/csrf', () => new HttpResponse(null, { status: 204, headers: { [CSRF_HEADER]: CSRF_TOKEN } })),

  http.post('*/auth/login', async ({ request }) => {
    if (!hasValidCsrf(request)) return errorResponse(419)
    if (!request.headers.get(CAPTCHA_HEADER)) {
      return validationError({ captcha: ['The captcha token is required.'] })
    }
    const body = await readJson(request)
    const email = asString(body.email)
    const password = asString(body.password)
    const fingerprint = asString(body.fingerprint)
    if (email !== MOCK_USER.email || password !== MOCK_USER.password) {
      return validationError({ password: ['These credentials do not match our records.'] })
    }
    if (!FINGERPRINT_PATTERN.test(fingerprint)) {
      return validationError({ fingerprint: ['The fingerprint is invalid.'] })
    }
    dropDeviceTokens(fingerprint)
    const deviceSessionToken = crypto.randomUUID()
    state.deviceTokens.set(deviceSessionToken, fingerprint)
    const response: LoginResponse = { device_session_token: deviceSessionToken }
    return HttpResponse.json(response)
  }),

  http.post('*/auth/token/issue', async ({ request }) => {
    if (!hasValidCsrf(request)) return errorResponse(419)
    const body = await readJson(request)
    const token = asString(body.device_session_token)
    const fingerprint = asString(body.fingerprint)
    if (!fingerprint || state.deviceTokens.get(token) !== fingerprint) {
      return validationError({ device_session_token: ['The device session token is invalid.'] })
    }
    state.deviceTokens.delete(token)
    state.session = { fingerprint, expiresAt: now() + state.sessionTtlMs }
    return emptyResponse(200)
  }),

  http.post('*/auth/token/rotate', async ({ request }) => {
    if (!hasValidCsrf(request)) return errorResponse(419)
    const body = await readJson(request)
    const fingerprint = asString(body.fingerprint)
    if (!state.session || state.session.fingerprint !== fingerprint) {
      return errorResponse(400)
    }
    state.session.expiresAt = now() + state.sessionTtlMs
    return emptyResponse(200)
  }),

  http.post('*/auth/token/revoke', async ({ request }) => {
    if (!hasValidCsrf(request)) return errorResponse(419)
    const body = await readJson(request)
    const fingerprint = asString(body.fingerprint)
    dropDeviceTokens(fingerprint)
    if (state.session?.fingerprint === fingerprint) state.session = null
    return emptyResponse(204)
  }),

  http.get('*/v1/me', () => {
    if (!hasActiveSession()) return errorResponse(401)
    const { id, email, first_name, last_name } = MOCK_USER
    const user: Me = { id, email, first_name, last_name, name: `${first_name} ${last_name}` }
    return HttpResponse.json(user)
  }),

  http.get('*/v1/webhooks', ({ request }) => {
    if (!hasActiveSession()) return errorResponse(401)
    const requestUrl = new URL(request.url)
    const params = requestUrl.searchParams
    const page = parsePage(params.get('page'))
    const rawSearch = params.get('search') ?? ''
    const search = rawSearch.toLowerCase()
    const filtered = state.webhooks.filter((webhook) => webhook.name.toLowerCase().includes(search))
    const start = (page - 1) * PAGE_SIZE
    const lastPage = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
    const body: WebhookList = {
      data: filtered.slice(start, page * PAGE_SIZE),
      paging: {
        pages: { current: page, last: lastPage },
        results: { total: filtered.length, limitation: PAGE_SIZE },
      },
    }
    return HttpResponse.json(body)
  }),

  http.get<{ id: string }>('*/v1/webhooks/:id', ({ params }) => {
    if (!hasActiveSession()) return errorResponse(401)
    const webhook = state.webhooks.find((item) => String(item.id) === params.id)
    if (!webhook) return errorResponse(404)
    return HttpResponse.json(webhook)
  }),

  http.put<{ id: string }>('*/v1/webhooks/:id', async ({ request, params }) => {
    if (!hasValidCsrf(request)) return errorResponse(419)
    if (!hasActiveSession()) return errorResponse(401)
    const index = state.webhooks.findIndex((item) => String(item.id) === params.id)
    const current = state.webhooks[index]
    if (!current) return errorResponse(404)
    const body = await readJson(request)
    const name = asString(body.name).trim()
    const url = asString(body.url).trim()
    const errors: FieldErrors = {}
    if (!name) errors.name = ['The name field is required.']
    if (!isHttpUrl(url)) errors.url = ['The url must be a valid URL.']
    if (Object.keys(errors).length > 0) return validationError(errors)
    const updated: Webhook = { ...current, name, url }
    state.webhooks[index] = updated
    return HttpResponse.json(updated)
  }),
]
