import { QueryClient } from '@tanstack/react-query'
import { isApiError } from './api/api-error'

const MAX_QUERY_RETRIES = 1

function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  if (isApiError(error)) return false
  return failureCount < MAX_QUERY_RETRIES
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: shouldRetryQuery,
    },
    mutations: { retry: false },
  },
})
