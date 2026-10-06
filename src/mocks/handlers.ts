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

const csrfFailure = (request: Request) =>
  request.headers.get(CSRF_HEADER) === CSRF_TOKEN ? null : errorResponse(419)

const authFailure = () => (state.session && state.session.expiresAt > now() ? null : errorResponse(401))

async function readJson(request: Request): Promise<Record<string, unknown>> {
  const body: unknown = await request.json().catch(() => null)
  return typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {}
}

const asString = (value: unknown) => (typeof value === 'string' ? value : '')

const emptyResponse = (status: 200 | 204) => new HttpResponse(null, { status })

const DEFAULT_LIMIT = 10
const MAX_LIMIT = 100

const parseIntParam = (value: string | null) => Number.parseInt(value ?? '', 10)

function isHttpUrl(value: string): boolean {
  if (!URL.canParse(value)) return false
  const { protocol, hostname } = new URL(value)
  return (protocol === 'http:' || protocol === 'https:') && hostname !== ''
}

export const handlers = [
  http.get('*/csrf', () => new HttpResponse(null, { status: 204, headers: { [CSRF_HEADER]: CSRF_TOKEN } })),

  http.post('*/auth/login', async ({ request }) => {
    const csrf = csrfFailure(request)
    if (csrf) return csrf
    if (!request.headers.get(CAPTCHA_HEADER)) {
      return validationError({ captcha: ['The captcha token is required.'] })
    }
    const body = await readJson(request)
    if (asString(body.email) !== MOCK_USER.email || asString(body.password) !== MOCK_USER.password) {
      return validationError({ password: ['These credentials do not match our records.'] })
    }
    const fingerprint = asString(body.fingerprint)
    if (!FINGERPRINT_PATTERN.test(fingerprint)) {
      return validationError({ fingerprint: ['The fingerprint is invalid.'] })
    }
    const deviceSessionToken = crypto.randomUUID()
    state.deviceTokens.set(deviceSessionToken, fingerprint)
    const response: LoginResponse = { device_session_token: deviceSessionToken }
    return HttpResponse.json(response)
  }),

  http.post('*/auth/token/issue', async ({ request }) => {
    const csrf = csrfFailure(request)
    if (csrf) return csrf
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
    const csrf = csrfFailure(request)
    if (csrf) return csrf
    const body = await readJson(request)
    if (!state.session || state.session.fingerprint !== asString(body.fingerprint)) {
      return errorResponse(400)
    }
    state.session.expiresAt = now() + state.sessionTtlMs
    return emptyResponse(200)
  }),

  http.post('*/auth/token/revoke', ({ request }) => {
    const csrf = csrfFailure(request)
    if (csrf) return csrf
    state.session = null
    return emptyResponse(204)
  }),

  http.get('*/v1/me', () => {
    const auth = authFailure()
    if (auth) return auth
    const { id, email, first_name, last_name } = MOCK_USER
    const user: Me = { id, email, first_name, last_name, name: `${first_name} ${last_name}` }
    return HttpResponse.json(user)
  }),

  http.get('*/v1/webhooks', ({ request }) => {
    const auth = authFailure()
    if (auth) return auth
    const params = new URL(request.url).searchParams
    const page = Math.max(1, parseIntParam(params.get('page')) || 1)
    const limit = Math.min(MAX_LIMIT, Math.max(1, parseIntParam(params.get('limit')) || DEFAULT_LIMIT))
    const search = (params.get('search') ?? '').trim().toLowerCase()
    const filtered = state.webhooks.filter((webhook) => webhook.name.toLowerCase().includes(search))
    const body: WebhookList = {
      data: filtered.slice((page - 1) * limit, page * limit),
      paging: {
        pages: { current: page, last: Math.max(1, Math.ceil(filtered.length / limit)) },
        results: { total: filtered.length, limitation: limit },
      },
    }
    return HttpResponse.json(body)
  }),

  http.get<{ id: string }>('*/v1/webhooks/:id', ({ params }) => {
    const auth = authFailure()
    if (auth) return auth
    const webhook = state.webhooks.find((item) => String(item.id) === params.id)
    return webhook ? HttpResponse.json(webhook) : errorResponse(404)
  }),

  http.put<{ id: string }>('*/v1/webhooks/:id', async ({ request, params }) => {
    const csrf = csrfFailure(request)
    if (csrf) return csrf
    const auth = authFailure()
    if (auth) return auth
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
