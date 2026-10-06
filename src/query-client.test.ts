import { describe, expect, test } from 'vitest'
import { ApiError } from './api/api-error'
import { queryClient } from './query-client'

describe('query client retry policy', () => {
  const { queries, mutations } = queryClient.getDefaultOptions()
  const retry = queries?.retry

  test.each([401, 404, 419, 422, 500])('a query failing with an ApiError %i is not retried', (status) => {
    expect(typeof retry).toBe('function')
    if (typeof retry !== 'function') return
    expect(retry(0, new ApiError(status, 'UnknownError', 'failed'))).toBe(false)
  })

  test('a query failing outside the http client is retried once', () => {
    expect(typeof retry).toBe('function')
    if (typeof retry !== 'function') return
    expect(retry(0, new TypeError('Failed to fetch'))).toBe(true)
    expect(retry(1, new TypeError('Failed to fetch'))).toBe(false)
  })

  test('mutations are never retried', () => {
    expect(mutations?.retry).toBe(false)
  })
})
