import { keepPreviousData, QueryClient } from '@tanstack/react-query'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { ApiError } from '../api/api-error'
import type { Webhook, WebhookList } from '../api/contract'
import { issueSession, login } from '../auth/auth-api'
import { GENERIC_ERROR } from '../lib/server-errors'
import { MOCK_USER } from '../mocks/state'
import { setupMockServer } from '../test/mock-server'
import { webhookKeys, webhookListQuery, webhookListView } from './webhook-queries'

vi.mock('../api/client', async () => {
  const { createHttpClient } = await import('../api/http-client')
  const { getFingerprint: fingerprint } = await import('../auth/fingerprint')
  const client = createHttpClient({ baseUrl: 'http://localhost' })
  client.setFingerprintProvider(fingerprint)
  return { httpClient: client }
})

setupMockServer()

const webhook = (id: number): Webhook => ({
  id,
  name: `Hook ${id}`,
  url: `https://example.com/hooks/${id}`,
  active: true,
  created_at: '2026-01-01T00:00:00Z',
})

const rows = (from: number, count: number) => Array.from({ length: count }, (_, index) => webhook(from + index))

function list(data: Webhook[], current: number, last: number, total: number): WebhookList {
  return { data, paging: { pages: { current, last }, results: { total, limitation: 10 } } }
}

describe('webhookKeys', () => {
  test('list keys hold exactly page and search', () => {
    expect(webhookKeys.lists()).toEqual(['webhooks', 'list'])
    const extra = { page: 2, search: 'hook', other: true }
    expect(webhookKeys.list(extra)).toEqual(['webhooks', 'list', { page: 2, search: 'hook' }])
  })

  test('detail keys hold the id', () => {
    expect(webhookKeys.detail(5)).toEqual(['webhooks', 'detail', 5])
  })
})

describe('webhookListQuery', () => {
  beforeEach(async () => {
    const token = await login({ email: MOCK_USER.email, password: MOCK_USER.password })
    await issueSession(token)
  })

  test('uses the list key and keeps previous data', () => {
    const params = { page: 2, search: 'hook' }
    const options = webhookListQuery(params)

    expect(options.queryKey).toEqual(webhookKeys.list(params))
    expect(options.placeholderData).toBe(keepPreviousData)
  })

  test('fetches the requested page', async () => {
    const client = new QueryClient()

    const result = await client.query(webhookListQuery({ page: 2, search: 'hook' }))

    expect(result.paging.pages.current).toBe(2)
    expect(result.data[0]?.name).toBe('Payment hook 11')
    client.clear()
  })
})

describe('webhookListView', () => {
  const view = (data: WebhookList | undefined, error: unknown = null, isPlaceholderData = false) =>
    webhookListView({ data, error, isPlaceholderData })

  test('no data and no error is loading', () => {
    expect(view(undefined)).toEqual({ kind: 'loading' })
  })

  test('no data and an ApiError shows the server message', () => {
    expect(view(undefined, new ApiError(500, 'UnknownError', 'Simulated outage.'))).toEqual({
      kind: 'error',
      message: 'Simulated outage.',
    })
  })

  test('no data and another error shows the generic message', () => {
    expect(view(undefined, new TypeError('Failed to fetch'))).toEqual({ kind: 'error', message: GENERIC_ERROR })
  })

  test('no results is empty', () => {
    expect(view(list([], 1, 1, 0))).toEqual({ kind: 'empty' })
  })

  test('no rows with results is out of range', () => {
    expect(view(list([], 9, 3, 28))).toEqual({ kind: 'out-of-range', lastPage: 3 })
  })

  test('rows carry the range computed from the server paging', () => {
    const data = rows(11, 10)
    const result = view(list(data, 2, 3, 28))

    expect(result).toEqual({ kind: 'rows', rows: data, from: 11, to: 20, total: 28, lastPage: 3 })
    expect(result.kind === 'rows' && result.rows).toBe(data)
  })

  test('a partial last page ends at the total', () => {
    expect(view(list(rows(21, 8), 3, 3, 28))).toMatchObject({ kind: 'rows', from: 21, to: 28 })
  })

  test('data with an error keeps the rows', () => {
    expect(view(list(rows(1, 10), 1, 3, 28), new ApiError(500, 'UnknownError', 'x'))).toMatchObject({ kind: 'rows' })
  })

  test('an empty or out of range placeholder shows loading', () => {
    expect(view(list([], 1, 1, 0), null, true)).toEqual({ kind: 'loading' })
    expect(view(list([], 9, 3, 28), null, true)).toEqual({ kind: 'loading' })
  })

  test('a placeholder with rows keeps the rows', () => {
    expect(view(list(rows(1, 10), 1, 3, 28), null, true)).toMatchObject({ kind: 'rows', from: 1, to: 10 })
  })
})
