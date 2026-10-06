import { httpClient } from '../api/client'
import {
  webhookListSchema,
  webhookSchema,
  type Webhook,
  type WebhookList,
  type WebhookUpdateRequest,
} from '../api/contract'
import type { ListParams } from './list-params'

export const PAGE_SIZE = 10

function webhookPath(id: number): string {
  return `/v1/webhooks/${id}`
}

export function fetchWebhooks({ page, search }: ListParams, signal?: AbortSignal): Promise<WebhookList> {
  return httpClient.request('/v1/webhooks', {
    query: { page, limit: PAGE_SIZE, search },
    schema: webhookListSchema,
    signal,
  })
}

export function fetchWebhook(id: number, signal?: AbortSignal): Promise<Webhook> {
  return httpClient.request(webhookPath(id), { schema: webhookSchema, signal })
}

export function updateWebhook(id: number, values: WebhookUpdateRequest): Promise<Webhook> {
  const body: WebhookUpdateRequest = { name: values.name, url: values.url }
  return httpClient.request(webhookPath(id), { method: 'PUT', body, schema: webhookSchema })
}
