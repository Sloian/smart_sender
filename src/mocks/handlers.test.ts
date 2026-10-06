import { describe, expect, test } from 'vitest'
import {
  CAPTCHA_HEADER,
  CSRF_HEADER,
  REQUESTED_WITH_HEADER,
  REQUESTED_WITH_VALUE,
  errorEnvelopeSchema,
  errorTypeByStatus,
  loginResponseSchema,
  meSchema,
  webhookListSchema,
  webhookSchema,
} from '../api/contract'
import { BASE_URL, setupMockServer } from '../test/mock-server'
import { CSRF_TOKEN, MOCK_USER, mockControl, state } from './state'

setupMockServer()

const FINGERPRINT = 'a'.repeat(32)
const OTHER_FINGERPRINT = 'b'.repeat(32)

interface CallOptions {
  body?: unknown
  headers?: Record<string, string>
  csrf?: string | false
}

interface CallResult {
  status: number
  headers: Headers
  text: string
  json: unknown
}

async function call(method: string, path: string, options: CallOptions = {}): Promise<CallResult> {
  const headers = new Headers(options.headers)
  headers.set(REQUESTED_WITH_HEADER, REQUESTED_WITH_VALUE)
  if ((method === 'POST' || method === 'PUT') && options.csrf !== false) {
    headers.set(CSRF_HEADER, options.csrf ?? CSRF_TOKEN)
  }
  if (options.body !== undefined) headers.set('Content-Type', 'application/json')
  const response = await fetch(new URL(path, BASE_URL), {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  })
  const text = await response.text()
  return {
    status: response.status,
    headers: response.headers,
    text,
    json: text ? (JSON.parse(text) as unknown) : undefined,
  }
}

const credentials = (overrides: Record<string, string> = {}) => ({
  email: MOCK_USER.email,
  password: MOCK_USER.password,
  fingerprint: FINGERPRINT,
  ...overrides,
})

const login = (body: unknown, captcha: string | null = 'test') =>
  call('POST', '/auth/login', {
    body,
    headers: captcha === null ? {} : { [CAPTCHA_HEADER]: captcha },
  })

async function obtainDeviceToken(fingerprint = FINGERPRINT): Promise<string> {
  const response = await login(credentials({ fingerprint }))
  return loginResponseSchema.parse(response.json).device_session_token
}

const issue = (deviceSessionToken: string, fingerprint = FINGERPRINT) =>
  call('POST', '/auth/token/issue', { body: { device_session_token: deviceSessionToken, fingerprint } })

const rotate = (fingerprint = FINGERPRINT) => call('POST', '/auth/token/rotate', { body: { fingerprint } })

const revoke = (fingerprint = FINGERPRINT) => call('POST', '/auth/token/revoke', { body: { fingerprint } })

const me = () => call('GET', '/v1/me')

async function signIn(fingerprint = FINGERPRINT): Promise<void> {
  const issued = await issue(await obtainDeviceToken(fingerprint), fingerprint)
  expect(issued.status).toBe(200)
}

const errorOf = (result: CallResult) => errorEnvelopeSchema.parse(result.json).error

describe('csrf endpoint', () => {
  test('GET /csrf returns 204 with the token header and an empty body', async () => {
    const response = await call('GET', '/csrf')
    expect(response.status).toBe(204)
    expect(response.headers.get(CSRF_HEADER)).toBe(CSRF_TOKEN)
    expect(response.text).toBe('')
  })
})

describe('login', () => {
  test('missing captcha header returns 422 with a captcha field error', async () => {
    const response = await login(credentials(), null)
    expect(response.status).toBe(422)
    expect(errorOf(response).payload?.captcha).toEqual(['The captcha token is required.'])
  })

  test('empty captcha header returns 422 with a captcha field error', async () => {
    const response = await login(credentials(), '')
    expect(response.status).toBe(422)
    expect(errorOf(response).payload?.captcha).toBeDefined()
  })

  test('wrong password returns 422 with a password field error', async () => {
    const response = await login(credentials({ password: 'nope' }))
    expect(response.status).toBe(422)
    expect(errorOf(response)).toEqual({
      type: 'ValidationException',
      message: 'The given data was invalid.',
      payload: { password: ['These credentials do not match our records.'] },
    })
  })

  test('unknown email returns 422 with a password field error', async () => {
    const response = await login(credentials({ email: 'someone@else.test' }))
    expect(response.status).toBe(422)
    expect(errorOf(response).payload?.password).toBeDefined()
  })

  test('malformed fingerprint returns 422 with a fingerprint field error', async () => {
    const response = await login(credentials({ fingerprint: 'xyz' }))
    expect(response.status).toBe(422)
    expect(errorOf(response).payload?.fingerprint).toEqual(['The fingerprint is invalid.'])
  })

  test('valid credentials return 200 with a device session token', async () => {
    const response = await login(credentials())
    expect(response.status).toBe(200)
    expect(loginResponseSchema.safeParse(response.json).success).toBe(true)
  })
})

describe('csrf enforcement', () => {
  const routes = ['/auth/login', '/auth/token/issue', '/auth/token/rotate', '/auth/token/revoke']
  const badTokens: { label: string; csrf: string | false }[] = [
    { label: 'missing', csrf: false },
    { label: 'empty', csrf: '' },
    { label: 'wrong', csrf: 'wrong' },
    { label: 'case-changed', csrf: CSRF_TOKEN.toUpperCase() },
  ]
  const cases = routes.flatMap((route) => badTokens.map((token) => ({ route, ...token })))

  test.each(cases)('POST $route with a $label token returns 419', async ({ route, csrf }) => {
    const response = await call('POST', route, {
      csrf,
      headers: { [CAPTCHA_HEADER]: 'test' },
      body: credentials(),
    })
    expect(response.status).toBe(419)
    expect(errorOf(response).type).toBe('TokenMismatchException')
  })

  test('a login rejected for csrf mints no device token', async () => {
    const response = await call('POST', '/auth/login', {
      csrf: 'wrong',
      headers: { [CAPTCHA_HEADER]: 'test' },
      body: credentials(),
    })
    expect(response.status).toBe(419)
    expect(state.deviceTokens.size).toBe(0)
  })

  test('a revoke rejected for csrf leaves the session active', async () => {
    await signIn()
    const response = await call('POST', '/auth/token/revoke', { csrf: 'wrong', body: { fingerprint: FINGERPRINT } })
    expect(response.status).toBe(419)
    expect((await me()).status).toBe(200)
  })
})

describe('issue', () => {
  test('issue with the login token and fingerprint starts a session', async () => {
    const response = await issue(await obtainDeviceToken())
    expect(response.status).toBe(200)
    expect(response.text).toBe('')
    expect((await me()).status).toBe(200)
  })

  test('issue keeps the session out of cookies', async () => {
    const response = await issue(await obtainDeviceToken())
    expect(response.headers.get('set-cookie')).toBeNull()
  })

  test('a device token is single-use', async () => {
    const token = await obtainDeviceToken()
    expect((await issue(token)).status).toBe(200)
    const reused = await issue(token)
    expect(reused.status).toBe(422)
    expect(errorOf(reused).payload?.device_session_token).toBeDefined()
  })

  test('issue with a different fingerprint returns 422', async () => {
    const response = await issue(await obtainDeviceToken(), OTHER_FINGERPRINT)
    expect(response.status).toBe(422)
    expect((await me()).status).toBe(401)
  })
})

describe('me', () => {
  test('GET /v1/me before issue returns the bare 401 envelope', async () => {
    const response = await me()
    expect(response.status).toBe(401)
    expect(response.json).toEqual({ error: { type: 'AuthenticationException', message: 'Unauthenticated.' } })
  })

  test('GET /v1/me after sign-in returns the user', async () => {
    await signIn()
    const response = await me()
    expect(response.status).toBe(200)
    const user = meSchema.parse(response.json)
    expect(user).toEqual({
      id: MOCK_USER.id,
      email: MOCK_USER.email,
      first_name: 'Demo',
      last_name: 'User',
      name: 'Demo User',
    })
  })
})

describe('session ttl', () => {
  test('the session lasts 30 seconds', async () => {
    await signIn()
    mockControl.advanceTime(29_000)
    expect((await me()).status).toBe(200)
    mockControl.advanceTime(1_000)
    expect((await me()).status).toBe(401)
  })

  test('setSessionTtl shortens the next session', async () => {
    mockControl.setSessionTtl(5_000)
    await signIn()
    mockControl.advanceTime(5_000)
    expect((await me()).status).toBe(401)
  })
})

describe('rotate', () => {
  test('rotate before any issue returns 400', async () => {
    const response = await rotate()
    expect(response.status).toBe(400)
    expect(errorOf(response).type).toBe('BadRequestException')
  })

  test('rotate after revoke returns 400', async () => {
    await signIn()
    expect((await revoke()).status).toBe(204)
    expect((await rotate()).status).toBe(400)
  })

  test('rotate with a different fingerprint returns 400', async () => {
    await signIn()
    expect((await rotate(OTHER_FINGERPRINT)).status).toBe(400)
  })

  test('rotate after expiry renews the session', async () => {
    await signIn()
    mockControl.expireSession()
    expect((await me()).status).toBe(401)
    const response = await rotate()
    expect(response.status).toBe(200)
    expect(response.text).toBe('')
    expect((await me()).status).toBe(200)
  })

  test('rotate extends the session by the full ttl from now', async () => {
    await signIn()
    mockControl.advanceTime(20_000)
    expect((await rotate()).status).toBe(200)
    mockControl.advanceTime(20_000)
    expect((await me()).status).toBe(200)
    mockControl.advanceTime(10_000)
    expect((await me()).status).toBe(401)
  })
})

describe('revoke', () => {
  test('revoke returns 204 and ends the session', async () => {
    await signIn()
    const response = await revoke()
    expect(response.status).toBe(204)
    expect(response.text).toBe('')
    expect((await me()).status).toBe(401)
  })

  test('revoke without a session returns 204', async () => {
    expect((await revoke()).status).toBe(204)
  })
})

describe('mockControl.reset', () => {
  test('reset clears the session, ttl override and clock offset', async () => {
    await signIn()
    mockControl.setSessionTtl(1)
    mockControl.advanceTime(5)
    mockControl.reset()
    expect((await me()).status).toBe(401)
    await signIn()
    mockControl.advanceTime(29_000)
    expect((await me()).status).toBe(200)
  })
})

const listResponse = (params: Record<string, string> = {}) => {
  const query = new URLSearchParams(params).toString()
  return call('GET', query ? `/v1/webhooks?${query}` : '/v1/webhooks')
}

async function list(params: Record<string, string> = {}) {
  const response = await listResponse(params)
  expect(response.status).toBe(200)
  return webhookListSchema.parse(response.json)
}

const idsOf = (page: { data: { id: number }[] }) => page.data.map((webhook) => webhook.id)

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, index) => from + index)

async function allIds() {
  const pages = await Promise.all(['1', '2', '3'].map((page) => list({ page })))
  return pages.flatMap(idsOf)
}

const getWebhook = (id: string) => call('GET', `/v1/webhooks/${id}`)

const updateWebhook = (id: string, body: unknown, csrf?: string | false) =>
  call('PUT', `/v1/webhooks/${id}`, { body, csrf })

const SEED_ONE = {
  id: 1,
  name: 'Lead hook 1',
  url: 'https://example.com/hooks/1',
  active: true,
  created_at: '2026-01-01T00:00:00.000Z',
}

describe('webhook list', () => {
  test('without params returns the first 10 of 28 webhooks', async () => {
    await signIn()
    const response = await listResponse()
    expect(response.status).toBe(200)
    const page = webhookListSchema.parse(response.json)
    expect(idsOf(page)).toEqual(range(1, 10))
    expect(page.paging).toEqual({ pages: { current: 1, last: 3 }, results: { total: 28, limitation: 10 } })
  })

  test('page 2 continues without overlap or gap', async () => {
    await signIn()
    expect(idsOf(await list({ page: '2' }))).toEqual(range(11, 20))
  })

  test('page 3 holds the last 8 webhooks', async () => {
    await signIn()
    expect(idsOf(await list({ page: '3' }))).toEqual(range(21, 28))
  })

  test('a page beyond the last returns empty data', async () => {
    await signIn()
    const page = await list({ page: '4' })
    expect(page.data).toEqual([])
    expect(page.paging.pages).toEqual({ current: 4, last: 3 })
  })

  test.each(['0', '-1', 'abc'])('page %s falls back to page 1', async (value) => {
    await signIn()
    const page = await list({ page: value })
    expect(page.paging.pages.current).toBe(1)
    expect(idsOf(page)).toEqual(range(1, 10))
  })

  test.each(['5', '10', '100', 'abc'])('limit %s keeps the contract page size of 10', async (limit) => {
    await signIn()
    const page = await list({ limit })
    expect(idsOf(page)).toEqual(range(1, 10))
    expect(page.paging).toEqual({ pages: { current: 1, last: 3 }, results: { total: 28, limitation: 10 } })
  })

  test('search is case-insensitive', async () => {
    await signIn()
    const page = await list({ search: 'ORDER' })
    expect(page.paging.results.total).toBe(9)
    expect(page.paging.pages.last).toBe(1)
    expect(page.data.every((webhook) => webhook.name.toLowerCase().includes('order'))).toBe(true)
  })

  test('search with an encoded space matches a substring', async () => {
    await signIn()
    const first = await list({ search: 'hook 1' })
    expect(first.paging.results.total).toBe(11)
    expect(first.paging.pages.last).toBe(2)
    expect((await list({ search: 'hook 1', page: '2' })).data).toHaveLength(1)
  })

  test('search without matches returns an empty first page', async () => {
    await signIn()
    const page = await list({ search: 'zzz' })
    expect(page.data).toEqual([])
    expect(page.paging).toEqual({ pages: { current: 1, last: 1 }, results: { total: 0, limitation: 10 } })
  })

  test('search is a literal substring including whitespace', async () => {
    await signIn()
    expect((await list({ search: 'lead' })).paging.results.total).toBe(10)
    expect((await list({ search: ' hook 1' })).paging.results.total).toBe(11)
    expect((await list({ search: '  lead  ' })).paging.results.total).toBe(0)
    expect((await list({ search: '  ' })).paging.results.total).toBe(0)
  })

  test('an empty search returns every webhook', async () => {
    await signIn()
    expect((await list({ search: '' })).paging.results.total).toBe(28)
  })

  test('order is stable and ascending by id', async () => {
    await signIn()
    const first = await allIds()
    const second = await allIds()
    expect(second).toEqual(first)
    expect(first).toEqual(range(1, 28))
  })

  test('order is unchanged after an update', async () => {
    await signIn()
    expect((await updateWebhook('5', { name: 'Aaa first', url: 'https://ok.dev' })).status).toBe(200)
    expect(await allIds()).toEqual(range(1, 28))
  })

  test('the list requires a session', async () => {
    expect((await listResponse()).status).toBe(401)
  })
})

describe('webhook by id', () => {
  test('GET /v1/webhooks/1 returns the webhook', async () => {
    await signIn()
    const response = await getWebhook('1')
    expect(response.status).toBe(200)
    expect(webhookSchema.parse(response.json)).toEqual(SEED_ONE)
  })

  test.each(['999', 'abc'])('GET /v1/webhooks/%s returns 404', async (id) => {
    await signIn()
    const response = await getWebhook(id)
    expect(response.status).toBe(404)
    expect(errorOf(response).type).toBe('NotFoundException')
  })

  test('the by-id route requires a session', async () => {
    expect((await getWebhook('1')).status).toBe(401)
  })
})

describe('webhook update', () => {
  const invalidBody = { name: '', url: 'ftp://x' }

  test('csrf is checked before the session', async () => {
    expect((await updateWebhook('1', invalidBody, false)).status).toBe(419)
  })

  test('the session is checked before existence', async () => {
    expect((await updateWebhook('999', invalidBody)).status).toBe(401)
  })

  test('existence is checked before validation', async () => {
    await signIn()
    expect((await updateWebhook('999', invalidBody)).status).toBe(404)
  })

  test('an invalid body on an existing webhook returns 422', async () => {
    await signIn()
    expect((await updateWebhook('1', invalidBody)).status).toBe(422)
  })

  test.each(['', '   '])('name %j is rejected', async (name) => {
    await signIn()
    const response = await updateWebhook('1', { name, url: 'https://ok.dev' })
    expect(response.status).toBe(422)
    expect(errorOf(response).payload).toEqual({ name: ['The name field is required.'] })
  })

  test.each(['ftp://x', 'javascript:alert(1)', 'data:text/html,hi', 'http://', ''])(
    'url %j is rejected',
    async (url) => {
      await signIn()
      const response = await updateWebhook('1', { name: 'Valid', url })
      expect(response.status).toBe(422)
      expect(errorOf(response).payload).toEqual({ url: ['The url must be a valid URL.'] })
    },
  )

  test('both invalid fields are reported together', async () => {
    await signIn()
    const response = await updateWebhook('1', { name: ' ', url: 'javascript:alert(1)' })
    expect(response.status).toBe(422)
    expect(errorOf(response)).toEqual({
      type: 'ValidationException',
      message: 'The given data was invalid.',
      payload: { name: ['The name field is required.'], url: ['The url must be a valid URL.'] },
    })
  })

  test('a valid update trims, persists and is searchable', async () => {
    await signIn()
    const response = await updateWebhook('1', { name: '  Renamed  ', url: 'https://ok.dev/hook?x=1' })
    expect(response.status).toBe(200)
    const expected = { ...SEED_ONE, name: 'Renamed', url: 'https://ok.dev/hook?x=1' }
    expect(webhookSchema.parse(response.json)).toEqual(expected)
    expect(webhookSchema.parse((await getWebhook('1')).json)).toEqual(expected)
    expect(idsOf(await list({ search: 'renamed' }))).toEqual([1])
  })

  test('an update rejected for csrf leaves the webhook unchanged', async () => {
    await signIn()
    const response = await updateWebhook('1', { name: 'Hijacked', url: 'https://evil.dev' }, 'wrong')
    expect(response.status).toBe(419)
    expect(webhookSchema.parse((await getWebhook('1')).json)).toEqual(SEED_ONE)
  })
})

describe('error envelope', () => {
  const producers: { status: 400 | 401 | 404 | 419 | 422; produce: () => Promise<CallResult> }[] = [
    { status: 400, produce: () => rotate() },
    { status: 401, produce: () => me() },
    {
      status: 404,
      produce: async () => {
        await signIn()
        return getWebhook('999')
      },
    },
    { status: 419, produce: () => updateWebhook('1', { name: 'x', url: 'https://ok.dev' }, false) },
    {
      status: 422,
      produce: async () => {
        await signIn()
        return updateWebhook('1', { name: '', url: '' })
      },
    },
  ]

  test.each(producers)('status $status carries the spec envelope', async ({ status, produce }) => {
    const response = await produce()
    expect(response.status).toBe(status)
    expect(response.headers.get('content-type')).toContain('application/json')
    const { error } = errorEnvelopeSchema.parse(response.json)
    expect(error.type).toBe(errorTypeByStatus[status])
    expect('payload' in error).toBe(status === 422)
  })
})
