import { beforeEach, describe, expect, test, vi } from 'vitest'
import { issueSession, login } from '../auth/auth-api'
import { MOCK_USER, mockControl } from '../mocks/state'
import { setupMockServer, wire } from '../test/mock-server'
import { fetchWebhooks, PAGE_SIZE } from './webhooks-api'

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
