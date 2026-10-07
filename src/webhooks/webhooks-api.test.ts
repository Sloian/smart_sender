import { beforeEach, describe, expect, test, vi } from 'vitest'
import { issueSession, login } from '../auth/auth-api'
import { ApiError } from '../api/api-error'
import { CSRF_TOKEN, MOCK_USER, mockControl } from '../mocks/state'
import { server, setupMockServer, wire } from '../test/mock-server'
import { fetchWebhook, fetchWebhooks, PAGE_SIZE, updateWebhook } from './webhooks-api'

vi.mock('../api/client', async () => {
  const { createHttpClient } = await import('../api/http-client')
  const { getFingerprint: fingerprint } = await import('../auth/fingerprint')
  const client = createHttpClient({ baseUrl: 'http://localhost' })
  client.setFingerprintProvider(fingerprint)
  return { httpClient: client }
})

setupMockServer()

const wireLines = () =>
  wire
    .filter((entry) => !(entry.method === 'GET' && entry.path === '/csrf'))
    .map((entry) => `${entry.method} ${entry.path}${entry.search} ${entry.status}`)

describe('fetchWebhooks', () => {
  beforeEach(async () => {
    const token = await login({ email: MOCK_USER.email, password: MOCK_USER.password })
    await issueSession(token)
    wire.length = 0
  })

  test('the page size is the contract limit', () => {
    expect(PAGE_SIZE).toBe(10)
  })

  test('the first page sends page and limit only and returns the server paging', async () => {
    const list = await fetchWebhooks({ page: 1, search: '' })

    expect(list.data).toHaveLength(10)
    expect(list.data[0]?.name).toBe('Lead hook 1')
    expect(list.paging).toEqual({ pages: { current: 1, last: 3 }, results: { total: 28, limitation: 10 } })
    expect(wireLines()).toEqual(['GET /v1/webhooks?page=1&limit=10 200'])
  })

  test('page and search are sent to the server', async () => {
    const list = await fetchWebhooks({ page: 2, search: 'hook' })

    expect(wireLines()).toEqual(['GET /v1/webhooks?page=2&limit=10&search=hook 200'])
    expect(list.data[0]?.name).toBe('Payment hook 11')
  })

  test('the server search is case insensitive', async () => {
    const list = await fetchWebhooks({ page: 1, search: 'LEAD' })

    expect(list.paging.results.total).toBe(10)
    expect(list.data.every((webhook) => webhook.name.includes('Lead'))).toBe(true)
  })

  test('search text is encoded as a query value', async () => {
    const list = await fetchWebhooks({ page: 1, search: 'a&b c' })

    expect(wireLines()).toEqual(['GET /v1/webhooks?page=1&limit=10&search=a%26b+c 200'])
    expect(list.paging.results.total).toBe(0)
  })

  test('a page beyond the last returns no rows with the real paging', async () => {
    const list = await fetchWebhooks({ page: 9, search: '' })

    expect(list.data).toEqual([])
    expect(list.paging.pages).toEqual({ current: 9, last: 3 })
    expect(list.paging.results.total).toBe(28)
  })

  test('an expired session is rotated and the list request retried once', async () => {
    mockControl.expireSession()

    const list = await fetchWebhooks({ page: 1, search: '' })

    expect(list.data).toHaveLength(10)
    expect(wireLines().map((line) => line.replace(/\?\S*/, ''))).toEqual([
      'GET /v1/webhooks 401',
      'POST /auth/token/rotate 200',
      'GET /v1/webhooks 200',
    ])
  })
})

async function signIn() {
  const token = await login({ email: MOCK_USER.email, password: MOCK_USER.password })
  await issueSession(token)
  wire.length = 0
}

async function rejection(promise: Promise<unknown>): Promise<ApiError> {
  const error: unknown = await promise.then(
    () => null,
    (reason: unknown) => reason,
  )
  if (!(error instanceof ApiError)) throw new Error('Expected an ApiError')
  return error
}

describe('fetchWebhook', () => {
  beforeEach(signIn)

  test('returns the webhook by id', async () => {
    const webhook = await fetchWebhook(5)

    expect(webhook).toEqual({
      id: 5,
      name: 'Payment hook 5',
      url: 'https://billing.example.com/webhooks/payments/5',
      active: true,
      created_at: '2026-01-05T00:00:00.000Z',
    })
    expect(wireLines()).toEqual(['GET /v1/webhooks/5 200'])
  })

  test('an unknown id is a not found error', async () => {
    const error = await rejection(fetchWebhook(999))

    expect(error.status).toBe(404)
    expect(error.type).toBe('NotFoundException')
  })
})

describe('updateWebhook', () => {
  beforeEach(signIn)

  const valid = { name: 'Renamed hook', url: 'https://example.com/renamed' }

  test('invalid values are rejected with the server field messages', async () => {
    const error = await rejection(updateWebhook(5, { name: '', url: 'not-a-url' }))

    expect(error.status).toBe(422)
    expect(error.type).toBe('ValidationException')
    expect(error.fieldErrors).toEqual({
      name: ['The name field is required.'],
      url: ['The url must be a valid URL.'],
    })
    expect(wireLines()).toEqual(['PUT /v1/webhooks/5 422'])
    expect(wire.find((entry) => entry.method === 'PUT')?.csrfToken).toBe(CSRF_TOKEN)
  })

  test('a whitespace only name is rejected by the server', async () => {
    const error = await rejection(updateWebhook(5, { name: '   ', url: 'https://example.com/x' }))

    expect(error.fieldErrors).toEqual({ name: ['The name field is required.'] })
  })

  test('valid values are saved and returned', async () => {
    const updated = await updateWebhook(5, valid)

    expect(updated).toEqual({ id: 5, ...valid, active: true, created_at: '2026-01-05T00:00:00.000Z' })
    expect(await fetchWebhook(5)).toEqual(updated)
    expect(wireLines()).toEqual(['PUT /v1/webhooks/5 200', 'GET /v1/webhooks/5 200'])
  })

  test('only name and url are sent', async () => {
    const bodies: Promise<unknown>[] = []
    const capture = ({ request }: { request: Request }) => {
      if (request.method === 'PUT') bodies.push(request.clone().json())
    }
    server.events.on('request:start', capture)
    const values = { ...valid, active: false, id: 7 }

    try {
      await updateWebhook(5, values)
    } finally {
      server.events.removeListener('request:start', capture)
    }

    expect(await Promise.all(bodies)).toEqual([valid])
  })

  test('saving the current values still succeeds', async () => {
    const current = await fetchWebhook(5)

    const updated = await updateWebhook(5, { name: current.name, url: current.url })

    expect(updated).toEqual(current)
    expect(wireLines()).toEqual(['GET /v1/webhooks/5 200', 'PUT /v1/webhooks/5 200'])
  })

  test('an unknown id is a not found error', async () => {
    const error = await rejection(updateWebhook(999, valid))

    expect(error.status).toBe(404)
    expect(error.type).toBe('NotFoundException')
  })

  test('an expired session is rotated and the update retried once', async () => {
    mockControl.expireSession()

    const updated = await updateWebhook(5, valid)

    expect(updated.name).toBe('Renamed hook')
    expect(wireLines()).toEqual(['PUT /v1/webhooks/5 401', 'POST /auth/token/rotate 200', 'PUT /v1/webhooks/5 200'])
  })
})
