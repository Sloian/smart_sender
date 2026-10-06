import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, test, vi, type Mock } from 'vitest'
import { ZodError } from 'zod'
import { BASE_URL, count, server, setupMockServer, wire } from '../test/mock-server'
import { CSRF_TOKEN, MOCK_USER, mockControl } from '../mocks/state'
import { ApiError, isApiError } from './api-error'
import { loginResponseSchema, meSchema, webhookListSchema, webhookSchema } from './contract'
import { createHttpClient, type HttpClient } from './http-client'

setupMockServer()

const FINGERPRINT = 'a'.repeat(32)

let client: HttpClient
let sessionEnd: Mock<() => void>

const envelope = (status: number, type: string, message = 'Rejected by test override.') =>
  HttpResponse.json({ error: { type, message } }, { status })

const statusesOf = (method: string, path: string) =>
  wire.filter((entry) => entry.method === method && entry.path === path).map((entry) => entry.status)

async function login() {
  const { device_session_token } = await client.request('/auth/login', {
    method: 'POST',
    headers: { 'X-Captcha-Token': 'test' },
    body: { email: MOCK_USER.email, password: MOCK_USER.password, fingerprint: FINGERPRINT },
    schema: loginResponseSchema,
  })
  await client.request('/auth/token/issue', {
    method: 'POST',
    body: { device_session_token, fingerprint: FINGERPRINT },
  })
}

async function signIn() {
  await login()
  wire.length = 0
}

const validUpdate = { name: 'Renamed hook', url: 'https://example.com/renamed' }

beforeEach(() => {
  client = createHttpClient({ baseUrl: BASE_URL })
  client.setFingerprintProvider(() => FINGERPRINT)
  sessionEnd = vi.fn<() => void>()
  client.onSessionEnd(sessionEnd)
})

describe('transport and csrf', () => {
  test('parallel first requests share one csrf bootstrap that goes first on the wire', async () => {
    await Promise.allSettled([
      client.request('/v1/me'),
      client.request('/v1/webhooks'),
      client.request('/v1/webhooks/1'),
    ])

    expect(count('GET', '/csrf')).toBe(1)
    expect(wire[0]?.path).toBe('/csrf')
  })

  test('every request carries X-Requested-With and only POST and PUT carry the csrf token', async () => {
    await login()
    await client.request('/v1/me')
    await client.request('/v1/webhooks/2', { method: 'PUT', body: validUpdate })

    expect(wire.length).toBeGreaterThanOrEqual(5)
    expect(wire.every((entry) => entry.requestedWith === 'XMLHttpRequest')).toBe(true)
    const writes = wire.filter((entry) => entry.method === 'POST' || entry.method === 'PUT')
    expect(writes.map((entry) => entry.path)).toEqual(['/auth/login', '/auth/token/issue', '/v1/webhooks/2'])
    expect(writes.every((entry) => entry.csrfToken === CSRF_TOKEN)).toBe(true)
    const reads = wire.filter((entry) => entry.method === 'GET' && entry.path.startsWith('/v1/'))
    expect(reads).toHaveLength(1)
    expect(reads.every((entry) => entry.csrfToken === null)).toBe(true)
  })

  test('caller headers cannot drop or forge the mandatory headers', async () => {
    await signIn()

    await client.request('/v1/webhooks/2', {
      method: 'PUT',
      body: validUpdate,
      headers: { 'X-Requested-With': 'fetch', 'X-CSRF-TOKEN': 'forged' },
    })
    await client.request('/v1/webhooks/3', {
      method: 'PUT',
      body: validUpdate,
      headers: { 'x-requested-with': 'fetch', 'x-csrf-token': 'forged' },
    })

    expect(statusesOf('PUT', '/v1/webhooks/2')).toEqual([200])
    expect(statusesOf('PUT', '/v1/webhooks/3')).toEqual([200])
    expect(wire.every((entry) => entry.requestedWith === 'XMLHttpRequest')).toBe(true)
    expect(wire.filter((entry) => entry.method === 'PUT').every((entry) => entry.csrfToken === CSRF_TOKEN)).toBe(true)
  })

  test('a 419 refetches the csrf token once and retries the request', async () => {
    await signIn()
    server.use(http.put('*/v1/webhooks/:id', () => envelope(419, 'TokenMismatchException'), { once: true }))

    const updated = await client.request('/v1/webhooks/1', { method: 'PUT', body: validUpdate, schema: webhookSchema })

    expect(updated.name).toBe(validUpdate.name)
    expect(count('GET', '/csrf')).toBe(1)
    expect(statusesOf('PUT', '/v1/webhooks/1')).toEqual([419, 200])
  })

  test('a second 419 rejects with TokenMismatchException after one retry', async () => {
    await signIn()
    server.use(http.put('*/v1/webhooks/:id', () => envelope(419, 'TokenMismatchException')))

    await expect(client.request('/v1/webhooks/1', { method: 'PUT', body: validUpdate })).rejects.toMatchObject({
      status: 419,
      type: 'TokenMismatchException',
    })
    expect(count('PUT', '/v1/webhooks/1')).toBe(2)
    expect(count('GET', '/csrf')).toBe(1)
  })

  test('parallel 419s share one csrf refetch', async () => {
    await signIn()
    server.use(
      http.put('*/v1/webhooks/1', () => envelope(419, 'TokenMismatchException'), { once: true }),
      http.put('*/v1/webhooks/2', () => envelope(419, 'TokenMismatchException'), { once: true }),
    )

    const [first, second] = await Promise.all([
      client.request('/v1/webhooks/1', { method: 'PUT', body: validUpdate, schema: webhookSchema }),
      client.request('/v1/webhooks/2', { method: 'PUT', body: validUpdate, schema: webhookSchema }),
    ])

    expect([first.id, second.id]).toEqual([1, 2])
    expect(count('GET', '/csrf')).toBe(1)
    expect(statusesOf('PUT', '/v1/webhooks/1')).toEqual([419, 200])
    expect(statusesOf('PUT', '/v1/webhooks/2')).toEqual([419, 200])
  })

  test('a failed csrf bootstrap rejects with ApiError and the next request bootstraps again', async () => {
    server.use(http.get('*/csrf', () => new HttpResponse(null, { status: 500 }), { once: true }))

    const error: unknown = await client.request('/v1/me').catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 500, type: 'UnknownError' })

    await login()

    expect(count('GET', '/csrf')).toBe(2)
    expect(count('GET', '/v1/me')).toBe(0)
    expect(statusesOf('POST', '/auth/token/issue')).toEqual([200])
  })

  test('a csrf response without the token header rejects with ApiError', async () => {
    server.use(http.get('*/csrf', () => new HttpResponse(null, { status: 204 }), { once: true }))

    await expect(client.request('/v1/me')).rejects.toMatchObject({ status: 204, type: 'UnknownError' })
    expect(count('GET', '/v1/me')).toBe(0)
  })

  test('a 422 maps the payload to field errors', async () => {
    await signIn()

    const error: unknown = await client
      .request('/v1/webhooks/1', { method: 'PUT', body: { name: '', url: 'ftp://x' } })
      .catch((caught: unknown) => caught)

    expect(isApiError(error)).toBe(true)
    expect(error).toMatchObject({
      status: 422,
      type: 'ValidationException',
      message: 'The given data was invalid.',
      fieldErrors: { name: ['The name field is required.'], url: ['The url must be a valid URL.'] },
    })
  })

  test('a 404 rejects with NotFoundException', async () => {
    await signIn()

    await expect(client.request('/v1/webhooks/999')).rejects.toMatchObject({ status: 404, type: 'NotFoundException' })
  })

  test('a non-json error body becomes an UnknownError ApiError', async () => {
    server.use(
      http.get(
        '*/v1/me',
        () => new HttpResponse('<html>bad gateway</html>', { status: 502, headers: { 'Content-Type': 'text/html' } }),
      ),
    )

    const error: unknown = await client.request('/v1/me').catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(ApiError)
    expect(error).not.toBeInstanceOf(SyntaxError)
    expect(error).toMatchObject({ status: 502, type: 'UnknownError', fieldErrors: {} })
  })

  test('an unknown error type becomes UnknownError and keeps the message', async () => {
    server.use(http.get('*/v1/me', () => envelope(400, 'WeirdException', 'Something odd happened.')))

    await expect(client.request('/v1/me')).rejects.toMatchObject({
      status: 400,
      type: 'UnknownError',
      message: 'Something odd happened.',
      fieldErrors: {},
    })
  })

  test('a schema validates the success body', async () => {
    await signIn()

    const webhook = await client.request('/v1/webhooks/1', { schema: webhookSchema })
    expect(webhook.id).toBe(1)

    server.use(http.get('*/v1/webhooks/1', () => HttpResponse.json({ id: 'x' })))
    await expect(client.request('/v1/webhooks/1', { schema: webhookSchema })).rejects.toBeInstanceOf(ZodError)
  })

  test('a cross-origin path is rejected before anything is sent', async () => {
    await signIn()

    await expect(
      client.request('//evil.example/v1/webhooks/1', { method: 'PUT', body: validUpdate }),
    ).rejects.toThrow('Cross-origin request blocked')
    expect(wire).toEqual([])
  })

  test('an unparsable json success body rejects instead of resolving to undefined', async () => {
    await signIn()
    server.use(
      http.get(
        '*/v1/me',
        () => new HttpResponse('{"id":', { status: 200, headers: { 'Content-Type': 'application/json' } }),
        { once: true },
      ),
      http.get('*/v1/webhooks/1', () => new HttpResponse('ok', { headers: { 'Content-Type': 'text/plain' } }), {
        once: true,
      }),
    )

    await expect(client.request('/v1/me')).rejects.toBeInstanceOf(SyntaxError)
    await expect(client.request('/v1/webhooks/1')).resolves.toBeUndefined()
  })

  test('query values are sent as search params and empty ones are omitted', async () => {
    await signIn()
    const searches: string[] = []
    server.use(
      http.get('*/v1/webhooks', ({ request }) => {
        searches.push(new URL(request.url).search)
      }),
    )

    const page = await client.request('/v1/webhooks', {
      query: { page: 2, limit: 10, search: '' },
      schema: webhookListSchema,
    })
    const filtered = await client.request('/v1/webhooks', { query: { search: 'hook 1' }, schema: webhookListSchema })

    expect(page.paging.pages.current).toBe(2)
    expect(page.data).toHaveLength(10)
    expect(filtered.paging.results.total).toBe(11)
    expect(searches).toEqual(['?page=2&limit=10', '?search=hook+1'])
  })
})

describe('session rotation', () => {
  const unauthenticated = () => envelope(401, 'AuthenticationException', 'Unauthenticated.')
  const sessionExpiredError = { name: 'ApiError', status: 401, type: 'AuthenticationException' }

  async function until(condition: () => boolean) {
    for (let attempt = 0; attempt < 400 && !condition(); attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5))
    }
  }

  test('two parallel requests with 401 share one rotate and both retries succeed', async () => {
    await signIn()
    mockControl.expireSession()

    const [me, list] = await Promise.all([
      client.request('/v1/me', { schema: meSchema }),
      client.request('/v1/webhooks', { query: { page: 1, limit: 10 }, schema: webhookListSchema }),
    ])

    expect(me.email).toBe(MOCK_USER.email)
    expect(list.data).toHaveLength(10)
    expect(count('POST', '/auth/token/rotate')).toBe(1)
    expect(statusesOf('GET', '/v1/me')).toEqual([401, 200])
    expect(statusesOf('GET', '/v1/webhooks')).toEqual([401, 200])
    expect(wire.every((entry) => entry.requestedWith === 'XMLHttpRequest')).toBe(true)
    expect(wire.find((entry) => entry.path === '/auth/token/rotate')?.csrfToken).toBe(CSRF_TOKEN)
    expect(sessionEnd).not.toHaveBeenCalled()
  })

  test('a naturally lapsed session is rotated and the request retried', async () => {
    await signIn()
    mockControl.advanceTime(30_000)

    const me = await client.request('/v1/me', { schema: meSchema })

    expect(me.email).toBe(MOCK_USER.email)
    expect(count('POST', '/auth/token/rotate')).toBe(1)
    expect(statusesOf('GET', '/v1/me')).toEqual([401, 200])
  })

  test('a rotate failure ends the session once and rejects every caller with the original 401', async () => {
    await signIn()
    mockControl.revokeSession()

    const results = await Promise.allSettled([client.request('/v1/me'), client.request('/v1/webhooks')])

    expect(results).toMatchObject([
      { status: 'rejected', reason: sessionExpiredError },
      { status: 'rejected', reason: sessionExpiredError },
    ])
    expect(statusesOf('POST', '/auth/token/rotate')).toEqual([400])
    expect(count('GET', '/v1/me')).toBe(1)
    expect(count('GET', '/v1/webhooks')).toBe(1)
    expect(sessionEnd).toHaveBeenCalledTimes(1)
  })

  test('a 401 on the retried request ends the session', async () => {
    await signIn()
    server.use(http.get('*/v1/me', unauthenticated))

    await expect(client.request('/v1/me')).rejects.toMatchObject(sessionExpiredError)
    expect(count('GET', '/v1/me')).toBe(2)
    expect(count('POST', '/auth/token/rotate')).toBe(1)
    expect(sessionEnd).toHaveBeenCalledTimes(1)
  })

  test('parallel repeated 401s rotate once and end the session once', async () => {
    await signIn()
    server.use(http.get('*/v1/me', unauthenticated), http.get('*/v1/webhooks', unauthenticated))

    const results = await Promise.allSettled([client.request('/v1/me'), client.request('/v1/webhooks')])

    expect(results).toMatchObject([
      { status: 'rejected', reason: sessionExpiredError },
      { status: 'rejected', reason: sessionExpiredError },
    ])
    expect(count('POST', '/auth/token/rotate')).toBe(1)
    expect(count('GET', '/v1/me')).toBe(2)
    expect(count('GET', '/v1/webhooks')).toBe(2)
    expect(sessionEnd).toHaveBeenCalledTimes(1)
  })

  test('a 401 from rotate never triggers another rotate', async () => {
    server.use(http.post('*/auth/token/rotate', unauthenticated))
    await signIn()
    mockControl.expireSession()

    await expect(client.request('/v1/me')).rejects.toMatchObject(sessionExpiredError)
    expect(count('POST', '/auth/token/rotate')).toBe(1)
    expect(count('GET', '/v1/me')).toBe(1)
    expect(sessionEnd).toHaveBeenCalledTimes(1)
  })

  test('a 401 from another auth endpoint is thrown without a rotate', async () => {
    server.use(http.post('*/auth/token/revoke', unauthenticated))

    await expect(client.request('/auth/token/revoke', { method: 'POST' })).rejects.toBeInstanceOf(ApiError)
    expect(count('POST', '/auth/token/revoke')).toBe(1)
    expect(count('POST', '/auth/token/rotate')).toBe(0)
    expect(sessionEnd).not.toHaveBeenCalled()
  })

  test('a dot-segment path that resolves to an auth endpoint never rotates', async () => {
    await signIn()
    server.use(http.post('*/auth/token/revoke', unauthenticated))

    await expect(
      client.request('/v1/../auth/token/revoke', { method: 'POST', body: { fingerprint: FINGERPRINT } }),
    ).rejects.toMatchObject(sessionExpiredError)
    expect(count('POST', '/auth/token/revoke')).toBe(1)
    expect(count('POST', '/auth/token/rotate')).toBe(0)
    expect(sessionEnd).not.toHaveBeenCalled()
  })

  test.each(['/auth/token/rotate', '/v1/../auth/token/rotate'])(
    'a direct request to %s is rejected so rotate stays single-flight',
    async (path) => {
      await signIn()

      await expect(client.request(path, { method: 'POST', body: { fingerprint: FINGERPRINT } })).rejects.toThrow(
        'Session rotation is managed by the http client.',
      )
      expect(wire).toEqual([])
    },
  )

  test('rotate uses its own 419 retry', async () => {
    server.use(http.post('*/auth/token/rotate', () => envelope(419, 'TokenMismatchException'), { once: true }))
    await signIn()
    mockControl.expireSession()

    const me = await client.request('/v1/me', { schema: meSchema })

    expect(me.email).toBe(MOCK_USER.email)
    expect(statusesOf('POST', '/auth/token/rotate')).toEqual([419, 200])
    expect(count('GET', '/csrf')).toBe(1)
    expect(statusesOf('GET', '/v1/me')).toEqual([401, 200])
    expect(sessionEnd).not.toHaveBeenCalled()
  })

  test('independent 419 and 401 budgets cap a request at three attempts', async () => {
    await signIn()
    server.use(http.put('*/v1/webhooks/:id', () => envelope(419, 'TokenMismatchException'), { once: true }))
    mockControl.expireSession()

    const updated = await client.request('/v1/webhooks/3', { method: 'PUT', body: validUpdate, schema: webhookSchema })

    expect(updated).toMatchObject({ id: 3, ...validUpdate })
    expect(statusesOf('PUT', '/v1/webhooks/3')).toEqual([419, 401, 200])
    expect(count('POST', '/auth/token/rotate')).toBe(1)
    expect(count('GET', '/csrf')).toBe(1)
    expect(sessionEnd).not.toHaveBeenCalled()
  })

  test('a late 401 after the rotate settled retries without a second rotate', async () => {
    await signIn()
    mockControl.expireSession()
    server.use(
      http.get(
        '*/v1/webhooks',
        async () => {
          await until(() => statusesOf('GET', '/v1/me').includes(200))
          await new Promise((resolve) => setTimeout(resolve, 30))
          return unauthenticated()
        },
        { once: true },
      ),
    )

    const [me, list] = await Promise.all([
      client.request('/v1/me', { schema: meSchema }),
      client.request('/v1/webhooks', { schema: webhookListSchema }),
    ])

    expect(me.email).toBe(MOCK_USER.email)
    expect(list.data).toHaveLength(10)
    expect(wire.map((entry) => `${entry.method} ${entry.path} ${entry.status}`)).toEqual([
      'GET /v1/me 401',
      'POST /auth/token/rotate 200',
      'GET /v1/me 200',
      'GET /v1/webhooks 401',
      'GET /v1/webhooks 200',
    ])
    expect(count('POST', '/auth/token/rotate')).toBe(1)
    expect(count('GET', '/v1/webhooks')).toBe(2)
    expect(sessionEnd).not.toHaveBeenCalled()
  })

  test('a late 401 after the session ended neither rotates again nor ends the session twice', async () => {
    await signIn()
    mockControl.revokeSession()
    server.use(
      http.get(
        '*/v1/webhooks',
        async () => {
          await until(() => sessionEnd.mock.calls.length > 0)
          await new Promise((resolve) => setTimeout(resolve, 30))
          return unauthenticated()
        },
        { once: true },
      ),
    )

    const results = await Promise.allSettled([client.request('/v1/me'), client.request('/v1/webhooks')])

    expect(results).toMatchObject([
      { status: 'rejected', reason: sessionExpiredError },
      { status: 'rejected', reason: sessionExpiredError },
    ])
    expect(count('POST', '/auth/token/rotate')).toBe(1)
    expect(count('GET', '/v1/webhooks')).toBe(1)
    expect(sessionEnd).toHaveBeenCalledTimes(1)
  })

  test('a request sent before the session ended is not replayed after a new sign-in and rotate', async () => {
    await signIn()
    let arrived = false
    let released = false
    server.use(
      http.put(
        '*/v1/webhooks/:id',
        async () => {
          arrived = true
          await until(() => released)
          return unauthenticated()
        },
        { once: true },
      ),
    )

    const stale = client
      .request('/v1/webhooks/1', { method: 'PUT', body: validUpdate })
      .catch((caught: unknown) => caught)
    await until(() => arrived)
    mockControl.revokeSession()
    await expect(client.request('/v1/me')).rejects.toMatchObject(sessionExpiredError)
    expect(sessionEnd).toHaveBeenCalledTimes(1)
    await login()
    mockControl.expireSession()
    await client.request('/v1/me', { schema: meSchema })
    released = true

    expect(await stale).toMatchObject(sessionExpiredError)
    expect(wire.map((entry) => `${entry.method} ${entry.path} ${entry.status}`)).toEqual([
      'GET /v1/me 401',
      'POST /auth/token/rotate 400',
      'POST /auth/login 200',
      'POST /auth/token/issue 200',
      'GET /v1/me 401',
      'POST /auth/token/rotate 200',
      'GET /v1/me 200',
      'PUT /v1/webhooks/1 401',
    ])
    expect(sessionEnd).toHaveBeenCalledTimes(1)
  })

  test('a rotate that settles after the session ended does not revive the session', async () => {
    await signIn()
    mockControl.expireSession()
    let meCalls = 0
    let rotateCalls = 0
    let staleRotateArrived = false
    server.use(
      http.get('*/v1/me', async () => {
        meCalls += 1
        if (meCalls === 2) await until(() => staleRotateArrived)
        return unauthenticated()
      }),
      http.post('*/auth/token/rotate', async () => {
        rotateCalls += 1
        if (rotateCalls === 2) {
          staleRotateArrived = true
          await until(() => sessionEnd.mock.calls.length > 0)
        }
        return undefined
      }),
      http.get('*/v1/webhooks', unauthenticated, { once: true }),
    )

    const me = client.request('/v1/me').catch((caught: unknown) => caught)
    await until(() => meCalls === 2)
    const list = client.request('/v1/webhooks').catch((caught: unknown) => caught)

    expect(await me).toMatchObject(sessionExpiredError)
    expect(await list).toMatchObject(sessionExpiredError)
    expect(statusesOf('POST', '/auth/token/rotate')).toEqual([200, 200])
    expect(statusesOf('GET', '/v1/webhooks')).toEqual([401])
    expect(sessionEnd).toHaveBeenCalledTimes(1)
  })

  test('a 401 that arrives after a local logout neither rotates nor notifies listeners', async () => {
    await signIn()
    let arrived = false
    let released = false
    server.use(
      http.get(
        '*/v1/webhooks',
        async () => {
          arrived = true
          await until(() => released)
          return unauthenticated()
        },
        { once: true },
      ),
    )

    const pending = client.request('/v1/webhooks').catch((caught: unknown) => caught)
    await until(() => arrived)
    client.invalidateSession()
    await client.request('/auth/token/revoke', { method: 'POST', body: { fingerprint: FINGERPRINT } })
    released = true

    expect(await pending).toMatchObject(sessionExpiredError)
    expect(count('POST', '/auth/token/rotate')).toBe(0)
    expect(sessionEnd).not.toHaveBeenCalled()

    await login()
    mockControl.expireSession()
    const me = await client.request('/v1/me', { schema: meSchema })

    expect(me.email).toBe(MOCK_USER.email)
    expect(statusesOf('POST', '/auth/token/rotate')).toEqual([200])
    expect(sessionEnd).not.toHaveBeenCalled()
  })

  test.each([
    {
      label: 'a repeated 401',
      end: () => {
        server.use(http.get('*/v1/me', unauthenticated))
      },
    },
    {
      label: 'a rotate failure',
      end: () => {
        mockControl.revokeSession()
      },
    },
  ])('a throwing listener on $label neither replaces the 401 nor silences other listeners', async ({ end }) => {
    const failure = new Error('listener failed')
    const reportError = vi.fn<(error: unknown) => void>()
    client = createHttpClient({ baseUrl: BASE_URL, reportError })
    client.setFingerprintProvider(() => FINGERPRINT)
    client.onSessionEnd(() => {
      throw failure
    })
    client.onSessionEnd(sessionEnd)
    await signIn()
    end()

    await expect(client.request('/v1/me')).rejects.toMatchObject(sessionExpiredError)
    expect(sessionEnd).toHaveBeenCalledTimes(1)
    expect(reportError).toHaveBeenCalledExactlyOnceWith(failure)
  })

  test('a rotate without a fingerprint provider fails loudly instead of ending the session', async () => {
    client = createHttpClient({ baseUrl: BASE_URL })
    client.onSessionEnd(sessionEnd)
    await signIn()
    mockControl.expireSession()

    await expect(client.request('/v1/me')).rejects.toThrow('Fingerprint provider is not configured.')
    expect(count('POST', '/auth/token/rotate')).toBe(0)
    expect(sessionEnd).not.toHaveBeenCalled()

    client.setFingerprintProvider(() => FINGERPRINT)
    const me = await client.request('/v1/me', { schema: meSchema })

    expect(me.email).toBe(MOCK_USER.email)
    expect(statusesOf('POST', '/auth/token/rotate')).toEqual([200])
  })

  test('an unsubscribed listener is not notified', async () => {
    const removed = vi.fn<() => void>()
    const unsubscribe = client.onSessionEnd(removed)
    unsubscribe()
    await signIn()
    mockControl.revokeSession()

    await expect(client.request('/v1/me')).rejects.toMatchObject(sessionExpiredError)
    expect(removed).not.toHaveBeenCalled()
    expect(sessionEnd).toHaveBeenCalledTimes(1)
  })
})
