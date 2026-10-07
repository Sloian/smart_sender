import { FIRST_PAGE } from './list-params'
import type { WebhookListView } from './webhook-queries'

export function listPageTitle(page: number): string {
  if (page <= FIRST_PAGE) return 'Webhooks'
  return `Webhooks, page ${page}`
}

interface ListAnnouncementInput {
  view: WebhookListView
  page: number
  isPlaceholderData: boolean
}

export function listAnnouncement({ view, page, isPlaceholderData }: ListAnnouncementInput): string {
  if (isPlaceholderData) return ''
  switch (view.kind) {
    case 'loading':
      return ''
    case 'error':
      return ''
    case 'empty':
      return 'No webhooks found'
    case 'out-of-range':
      return `Page ${page} does not exist`
    case 'rows':
      return `Showing ${view.from}–${view.to} of ${view.total} ${webhookNoun(view.total)}`
  }
}

function webhookNoun(total: number): string {
  if (total === 1) return 'webhook'
  return 'webhooks'
}
