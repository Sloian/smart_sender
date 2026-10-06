import { describe, expect, test } from 'vitest'
import {
  errorEnvelopeSchema,
  errorTypeByStatus,
  errorTypes,
  loginResponseSchema,
  meSchema,
  webhookListSchema,
  webhookSchema,
} from './contract'

const webhook = {
  id: 1,
  name: 'Lead hook 1',
  url: 'https://example.com/hooks/1',
  active: true,
  created_at: '2026-01-01T00:00:00.000Z',
}

describe('webhookSchema', () => {
  test('parses a contract webhook', () => {
    expect(webhookSchema.parse(webhook)).toEqual(webhook)
  })

  test('rejects a webhook without active', () => {
    const withoutActive = Object.fromEntries(Object.entries(webhook).filter(([key]) => key !== 'active'))
    expect(webhookSchema.safeParse(withoutActive).success).toBe(false)
  })

  test('rejects a string id', () => {
    expect(webhookSchema.safeParse({ ...webhook, id: '1' }).success).toBe(false)
  })
})

describe('webhookListSchema', () => {
  const list = {
    data: [webhook],
    paging: { pages: { current: 1, last: 3 }, results: { total: 28, limitation: 10 } },
  }

  test('parses a contract webhook list', () => {
    expect(webhookListSchema.parse(list)).toEqual(list)
  })

  test('rejects paging without results', () => {
    expect(webhookListSchema.safeParse({ data: [webhook], paging: { pages: list.paging.pages } }).success).toBe(false)
  })
})

describe('meSchema', () => {
  test('parses the current user', () => {
    const me = { id: 1, email: 'demo@smartsender.test', first_name: 'Demo', last_name: 'User', name: 'Demo User' }
    expect(meSchema.parse(me)).toEqual(me)
  })
})

describe('loginResponseSchema', () => {
  test('rejects an empty device session token', () => {
    expect(loginResponseSchema.safeParse({ device_session_token: '' }).success).toBe(false)
  })
})

describe('errorEnvelopeSchema', () => {
  test('parses the TASK.md validation sample', () => {
    const sample = {
      error: {
        type: 'ValidationException',
        message: 'The given data was invalid.',
        payload: { url: ['The url must be a valid URL.'] },
      },
    }
    expect(errorEnvelopeSchema.parse(sample)).toEqual(sample)
  })

  test('parses an envelope without payload', () => {
    const envelope = { error: { type: 'AuthenticationException', message: 'Unauthenticated.' } }
    expect(errorEnvelopeSchema.parse(envelope)).toEqual(envelope)
  })

  test('rejects a body without the error object', () => {
    expect(errorEnvelopeSchema.safeParse({ message: 'x' }).success).toBe(false)
  })
})

describe('error types', () => {
  test('lists exactly the TASK.md error types', () => {
    expect(errorTypes).toEqual([
      'BadRequestException',
      'AuthenticationException',
      'NotFoundException',
      'TokenMismatchException',
      'ValidationException',
    ])
  })

  test('maps statuses to the TASK.md error types', () => {
    expect(errorTypeByStatus).toEqual({
      400: 'BadRequestException',
      401: 'AuthenticationException',
      404: 'NotFoundException',
      419: 'TokenMismatchException',
      422: 'ValidationException',
    })
  })
})
