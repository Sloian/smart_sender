import { describe, expect, test } from 'vitest'
import { editPageHeading, editPageTitle, formatCreatedDate } from './edit-text'
import type { WebhookDetailView } from './webhook-queries'

const ready: WebhookDetailView = {
  kind: 'ready',
  webhook: {
    id: 1,
    name: 'Lead hook 1',
    url: 'https://example.com/hooks/1',
    active: true,
    created_at: '2026-01-01T00:00:00.000Z',
  },
}
const loading: WebhookDetailView = { kind: 'loading' }
const failed: WebhookDetailView = { kind: 'error', message: 'Something went wrong.' }
const notFound: WebhookDetailView = { kind: 'not-found' }

describe('editPageTitle', () => {
  test('a loaded webhook is named in the title', () => {
    expect(editPageTitle(ready)).toBe('Edit Lead hook 1')
  })

  test('loading keeps the generic title', () => {
    expect(editPageTitle(loading)).toBe('Edit webhook')
  })

  test('an error keeps the generic title', () => {
    expect(editPageTitle(failed)).toBe('Edit webhook')
  })

  test('a missing webhook says it was not found', () => {
    expect(editPageTitle(notFound)).toBe('Webhook not found')
  })
})

describe('editPageHeading', () => {
  test('a loaded webhook is quoted in the heading', () => {
    expect(editPageHeading(ready)).toBe('Edit “Lead hook 1”')
  })

  test.each([
    ['loading', loading],
    ['error', failed],
    ['not-found', notFound],
  ])('%s keeps the generic heading', (_kind, view) => {
    expect(editPageHeading(view)).toBe('Edit webhook')
  })
})

describe('formatCreatedDate', () => {
  test('the date is formatted in the medium English style', () => {
    expect(formatCreatedDate('2026-01-01T00:00:00.000Z')).toBe('Jan 1, 2026')
  })

  test('the UTC day is used, never the local day', () => {
    expect(formatCreatedDate('2026-01-05T23:59:59.000Z')).toBe('Jan 5, 2026')
  })
})
