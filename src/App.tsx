import { MantineProvider } from '@mantine/core'
import { QueryClientProvider } from '@tanstack/react-query'
import { useEffect } from 'react'
import { RouterProvider } from 'react-router/dom'
import { subscribeToSessionEnd } from './auth/auth-service'
import { queryClient } from './query-client'
import { router } from './router'

export function App() {
  useEffect(
    () =>
      subscribeToSessionEnd(
        (to) => router.navigate(to, { replace: true }),
        () => window.location,
      ),
    [],
  )

  return (
    <MantineProvider>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </MantineProvider>
  )
}
