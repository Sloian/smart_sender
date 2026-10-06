import { keepPreviousData, queryOptions, type QueryClient } from '@tanstack/react-query'
import { errorMessage, isApiError } from '../api/api-error'
import type { Webhook, WebhookList } from '../api/contract'
import type { ListParams } from './list-params'
import { fetchWebhook, fetchWebhooks } from './webhooks-api'

const WEBHOOKS_KEY = 'webhooks'

export const webhookKeys = {
  lists: () => [WEBHOOKS_KEY, 'list'] as const,
  list: ({ page, search }: ListParams) => [WEBHOOKS_KEY, 'list', { page, search }] as const,
  detail: (id: number) => [WEBHOOKS_KEY, 'detail', id] as const,
}

export function webhookListQuery(params: ListParams) {
  return queryOptions({
    queryKey: webhookKeys.list(params),
    queryFn: ({ signal }) => fetchWebhooks(params, signal),
    placeholderData: keepPreviousData,
  })
}

export type WebhookListView =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'empty' }
  | { kind: 'out-of-range'; lastPage: number }
  | { kind: 'rows'; rows: Webhook[]; from: number; to: number; total: number; lastPage: number }

interface WebhookListState {
  data: WebhookList | undefined
  error: unknown
  isPlaceholderData: boolean
  page: number
}

function decideView(data: WebhookList | undefined, error: unknown, page: number | null): WebhookListView {
  if (!data) {
    if (error) return { kind: 'error', message: errorMessage(error) }
    return { kind: 'loading' }
  }
  const { pages, results } = data.paging
  if (results.total === 0) return { kind: 'empty' }
  if (data.data.length === 0 || (page !== null && pages.current !== page)) {
    return { kind: 'out-of-range', lastPage: pages.last }
  }
  const from = (pages.current - 1) * results.limitation + 1
  return {
    kind: 'rows',
    rows: data.data,
    from,
    to: from + data.data.length - 1,
    total: results.total,
    lastPage: pages.last,
  }
}

export function webhookListView({ data, error, isPlaceholderData, page }: WebhookListState): WebhookListView {
  const view = decideView(data, error, isPlaceholderData ? null : page)
  return isPlaceholderData && view.kind !== 'rows' ? { kind: 'loading' } : view
}

export function webhookQuery(id: number) {
  return queryOptions({
    queryKey: webhookKeys.detail(id),
    queryFn: ({ signal }) => fetchWebhook(id, signal),
  })
}

export type WebhookDetailView =
  | { kind: 'loading' }
  | { kind: 'not-found' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; webhook: Webhook }

interface WebhookDetailState {
  data: Webhook | undefined
  error: unknown
}

export function webhookDetailView({ data, error }: WebhookDetailState): WebhookDetailView {
  if (data) return { kind: 'ready', webhook: data }
  if (isApiError(error) && error.type === 'NotFoundException') return { kind: 'not-found' }
  if (error) return { kind: 'error', message: errorMessage(error) }
  return { kind: 'loading' }
}

export function replaceWebhookInList(list: WebhookList, updated: Webhook): WebhookList {
  if (!list.data.some((webhook) => webhook.id === updated.id)) return list
  return { ...list, data: list.data.map((webhook) => (webhook.id === updated.id ? updated : webhook)) }
}

export function applyWebhookUpdate(client: QueryClient, updated: Webhook): void {
  client.setQueryData(webhookKeys.detail(updated.id), updated)
  client.setQueriesData<WebhookList>({ queryKey: webhookKeys.lists() }, (list) =>
    list ? replaceWebhookInList(list, updated) : list,
  )
  void client.invalidateQueries({ queryKey: webhookKeys.lists() })
}
