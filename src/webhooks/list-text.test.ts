import { describe, expect, test } from 'vitest'
import type { Webhook } from '../api/contract'
import { listAnnouncement, listPageTitle } from './list-text'
import type { WebhookListView } from './webhook-queries'

function webhook(id: number): Webhook {
  return {
    id,
    name: `Lead hook ${id}`,
    url: `https://example.com/hooks/${id}`,
    active: true,
    created_at: '2026-01-01T00:00:00.000Z',
  }
}

function rowsView(from: number, to: number, total: number): WebhookListView {
  const rows: Webhook[] = []
  for (let id = from; id <= to; id += 1) rows.push(webhook(id))
  return { kind: 'rows', rows, from, to, total, lastPage: Math.ceil(total / 10) }
}

describe('listPageTitle', () => {
  test('the first page is just Webhooks', () => {
    expect(listPageTitle(1)).toBe('Webhooks')
  })

  test('later pages name the page number', () => {
    expect(listPageTitle(3)).toBe('Webhooks, page 3')
  })
})

describe('listAnnouncement', () => {
  test('rows announce the shown range and the total', () => {
    const view = rowsView(1, 10, 28)

    expect(listAnnouncement({ view, page: 1, isPlaceholderData: false })).toBe('Showing 1–10 of 28 webhooks')
  })

  test('a single result uses the singular noun', () => {
    const view = rowsView(1, 1, 1)

    expect(listAnnouncement({ view, page: 1, isPlaceholderData: false })).toBe('Showing 1–1 of 1 webhook')
  })

  test('an empty result says no webhooks were found', () => {
    const view: WebhookListView = { kind: 'empty' }

    expect(listAnnouncement({ view, page: 1, isPlaceholderData: false })).toBe('No webhooks found')
  })

  test('an out-of-range page names the missing page', () => {
    const view: WebhookListView = { kind: 'out-of-range', lastPage: 3 }

    expect(listAnnouncement({ view, page: 9, isPlaceholderData: false })).toBe('Page 9 does not exist')
  })

  test('loading announces nothing', () => {
    const view: WebhookListView = { kind: 'loading' }

    expect(listAnnouncement({ view, page: 1, isPlaceholderData: false })).toBe('')
  })

  test('an error announces nothing because the error alert already does', () => {
    const view: WebhookListView = { kind: 'error', message: 'Something went wrong.' }

    expect(listAnnouncement({ view, page: 1, isPlaceholderData: false })).toBe('')
  })

  test('the previous range shown as placeholder data while the next page loads is not announced', () => {
    const view = rowsView(1, 10, 28)

    expect(listAnnouncement({ view, page: 2, isPlaceholderData: true })).toBe('')
  })

  test('a loading view with placeholder data announces nothing', () => {
    const view: WebhookListView = { kind: 'loading' }

    expect(listAnnouncement({ view, page: 2, isPlaceholderData: true })).toBe('')
  })
})
