import { MantineProvider } from '@mantine/core'
import { QueryClientProvider } from '@tanstack/react-query'
import { useEffect } from 'react'
import { RouterProvider } from 'react-router/dom'
import { subscribeToSessionEnd, type NavigateTo } from './auth/auth-service'
import { queryClient } from './query-client'
import { router } from './router'

export function App() {
  useEffect(() => {
    const navigateTo: NavigateTo = (to) => router.navigate(to, { replace: true })
    const currentLocation = () => window.location
    return subscribeToSessionEnd(navigateTo, currentLocation)
  }, [])

  return (
    <MantineProvider>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </MantineProvider>
  )
}
