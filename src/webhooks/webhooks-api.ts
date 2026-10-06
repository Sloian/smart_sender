import { httpClient } from '../api/client'
import { webhookListSchema, type WebhookList } from '../api/contract'
import type { ListParams } from './list-params'

export const PAGE_SIZE = 10

export function fetchWebhooks({ page, search }: ListParams, signal?: AbortSignal): Promise<WebhookList> {
  return httpClient.request('/v1/webhooks', {
    query: { page, limit: PAGE_SIZE, search },
    schema: webhookListSchema,
    signal,
  })
}
