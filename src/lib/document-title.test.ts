import { describe, expect, test } from 'vitest'
import { APP_NAME, documentTitle } from './document-title'

describe('documentTitle', () => {
  test('the app name is Smart Sender', () => {
    expect(APP_NAME).toBe('Smart Sender')
  })

  test('the page text comes first, then a middle dot and the app name', () => {
    expect(documentTitle('Sign in')).toBe('Sign in · Smart Sender')
  })
})
