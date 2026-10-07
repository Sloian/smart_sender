import type { WebhookDetailView } from './webhook-queries'

const GENERIC_EDIT_TEXT = 'Edit webhook'

const createdDateFormat = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeZone: 'UTC' })

export function editPageTitle(view: WebhookDetailView): string {
  switch (view.kind) {
    case 'ready':
      return `Edit ${view.webhook.name}`
    case 'not-found':
      return 'Webhook not found'
    case 'loading':
      return GENERIC_EDIT_TEXT
    case 'error':
      return GENERIC_EDIT_TEXT
  }
}

export function editPageHeading(view: WebhookDetailView): string {
  if (view.kind === 'ready') return `Edit “${view.webhook.name}”`
  return GENERIC_EDIT_TEXT
}

export function formatCreatedDate(iso: string): string {
  const date = new Date(iso)
  return createdDateFormat.format(date)
}
