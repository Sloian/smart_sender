import { QueryClient } from '@tanstack/react-query'
import { isApiError } from './api/api-error'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => !isApiError(error) && failureCount < 1,
    },
    mutations: { retry: false },
  },
})
