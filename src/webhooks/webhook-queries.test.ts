import { keepPreviousData, QueryClient } from '@tanstack/react-query'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { ApiError } from '../api/api-error'
import type { Webhook, WebhookList } from '../api/contract'
import { issueSession, login } from '../auth/auth-api'
import { GENERIC_ERROR } from '../lib/server-errors'
import { MOCK_USER } from '../mocks/state'
import { setupMockServer } from '../test/mock-server'
import {
  applyWebhookUpdate,
  replaceWebhookInList,
  webhookDetailView,
  webhookKeys,
  webhookListQuery,
  webhookListView,
  webhookQuery,
} from './webhook-queries'

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
  const view = (
    data: WebhookList | undefined,
    error: unknown = null,
    isPlaceholderData = false,
    page = data?.paging.pages.current ?? 1,
  ) => webhookListView({ data, error, isPlaceholderData, page })

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

  test('rows for another page than requested are out of range', () => {
    expect(view(list(rows(21, 8), 3, 3, 28), null, false, 9)).toEqual({ kind: 'out-of-range', lastPage: 3 })
    expect(view(list(rows(1, 10), 1, 3, 28), null, false, 2)).toEqual({ kind: 'out-of-range', lastPage: 3 })
  })

  test('a placeholder from another page keeps its rows while the requested page loads', () => {
    expect(view(list(rows(1, 10), 1, 3, 28), null, true, 2)).toMatchObject({ kind: 'rows', from: 1, to: 10 })
  })
})

describe('webhookQuery', () => {
  beforeEach(async () => {
    const token = await login({ email: MOCK_USER.email, password: MOCK_USER.password })
    await issueSession(token)
  })

  test('uses the detail key', () => {
    expect(webhookQuery(5).queryKey).toEqual(webhookKeys.detail(5))
  })

  test('fetches the webhook', async () => {
    const client = new QueryClient()

    const result = await client.query(webhookQuery(5))

    expect(result).toMatchObject({ id: 5, name: 'Payment hook 5', url: 'https://example.com/hooks/5' })
    client.clear()
  })
})

describe('webhookDetailView', () => {
  const view = (data: Webhook | undefined, error: unknown = null) => webhookDetailView({ data, error })

  test('data is ready', () => {
    const data = webhook(5)
    expect(view(data)).toEqual({ kind: 'ready', webhook: data })
  })

  test('data with an error stays ready', () => {
    const data = webhook(5)
    expect(view(data, new ApiError(500, 'UnknownError', 'x'))).toEqual({ kind: 'ready', webhook: data })
  })

  test('a not found error is not found', () => {
    expect(view(undefined, new ApiError(404, 'NotFoundException', 'Not found.'))).toEqual({ kind: 'not-found' })
  })

  test('another ApiError shows the server message', () => {
    expect(view(undefined, new ApiError(500, 'UnknownError', 'Simulated outage.'))).toEqual({
      kind: 'error',
      message: 'Simulated outage.',
    })
  })

  test('another error shows the generic message', () => {
    expect(view(undefined, new TypeError('Failed to fetch'))).toEqual({ kind: 'error', message: GENERIC_ERROR })
  })

  test('nothing is loading', () => {
    expect(view(undefined)).toEqual({ kind: 'loading' })
  })
})

describe('replaceWebhookInList', () => {
  const updated: Webhook = { ...webhook(5), name: 'Renamed', url: 'https://example.com/renamed' }

  test('replaces the row in place and keeps the other rows and the paging', () => {
    const source = list(rows(1, 10), 1, 3, 28)

    const result = replaceWebhookInList(source, updated)

    expect(result).not.toBe(source)
    expect(result.data).toHaveLength(10)
    expect(result.data[4]).toBe(updated)
    result.data.forEach((row, index) => {
      if (index !== 4) expect(row).toBe(source.data[index])
    })
    expect(result.paging).toBe(source.paging)
  })

  test('a list without the id is returned as is', () => {
    const source = list(rows(11, 10), 2, 3, 28)

    expect(replaceWebhookInList(source, updated)).toBe(source)
  })
})

describe('applyWebhookUpdate', () => {
  const updated: Webhook = { ...webhook(5), name: 'Renamed', url: 'https://example.com/renamed' }
  const firstKey = webhookKeys.list({ page: 1, search: '' })
  const secondKey = webhookKeys.list({ page: 2, search: '' })
  const searchKey = webhookKeys.list({ page: 1, search: 'hook' })

  function seeded() {
    const client = new QueryClient()
    const first = list(rows(1, 10), 1, 3, 28)
    const second = list(rows(11, 10), 2, 3, 28)
    client.setQueryData(firstKey, first)
    client.setQueryData(secondKey, second)
    client.setQueryData(searchKey, list(rows(3, 10), 1, 3, 28))
    return { client, first, second }
  }

  test('patches the cached pages that hold the id in place and leaves the others untouched', () => {
    const { client, first, second } = seeded()

    applyWebhookUpdate(client, updated)

    const patched = client.getQueryData<WebhookList>(firstKey)
    expect(patched?.data[4]).toEqual(updated)
    expect(patched?.data[3]).toBe(first.data[3])
    expect(client.getQueryData<WebhookList>(searchKey)?.data[2]).toEqual(updated)
    expect(client.getQueryData<WebhookList>(secondKey)).toBe(second)
    client.clear()
  })

  test('writes the detail and invalidates only the list queries', () => {
    const { client } = seeded()

    applyWebhookUpdate(client, updated)

    expect(client.getQueryData(webhookKeys.detail(5))).toEqual(updated)
    expect(client.getQueryState(firstKey)?.isInvalidated).toBe(true)
    expect(client.getQueryState(secondKey)?.isInvalidated).toBe(true)
    expect(client.getQueryState(searchKey)?.isInvalidated).toBe(true)
    expect(client.getQueryState(webhookKeys.detail(5))?.isInvalidated).toBe(false)
    client.clear()
  })
})
