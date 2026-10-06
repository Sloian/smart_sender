import { describe, expect, test } from 'vitest'
import {
  CAPTCHA_HEADER,
  CSRF_HEADER,
  REQUESTED_WITH_HEADER,
  REQUESTED_WITH_VALUE,
  errorEnvelopeSchema,
  loginResponseSchema,
  meSchema,
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
