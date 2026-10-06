import { keepPreviousData, queryOptions } from '@tanstack/react-query'
import { isApiError } from '../api/api-error'
import type { Webhook, WebhookList } from '../api/contract'
import { GENERIC_ERROR } from '../lib/server-errors'
import type { ListParams } from './list-params'
import { fetchWebhooks } from './webhooks-api'

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
}

function decideView(data: WebhookList | undefined, error: unknown): WebhookListView {
  if (!data) {
    if (error) return { kind: 'error', message: isApiError(error) ? error.message : GENERIC_ERROR }
    return { kind: 'loading' }
  }
  const { pages, results } = data.paging
  if (results.total === 0) return { kind: 'empty' }
  if (data.data.length === 0) return { kind: 'out-of-range', lastPage: pages.last }
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

export function webhookListView({ data, error, isPlaceholderData }: WebhookListState): WebhookListView {
  const view = decideView(data, error)
  return isPlaceholderData && view.kind !== 'rows' ? { kind: 'loading' } : view
}
