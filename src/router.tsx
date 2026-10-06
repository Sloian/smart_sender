import { Title } from '@mantine/core'
import { createBrowserRouter, redirect } from 'react-router'
import { DEFAULT_REDIRECT, LOGIN_PATH } from './auth/redirect'
import { redirectIfSignedIn, requireUser } from './auth/route-guards'
import { AppLayout } from './components/AppLayout'
import { FullPageLoader } from './components/FullPageLoader'
import { LoginPage } from './pages/LoginPage'

export const router = createBrowserRouter([
  {
    HydrateFallback: FullPageLoader,
    children: [
      { path: LOGIN_PATH, loader: redirectIfSignedIn, Component: LoginPage },
      {
        id: 'protected',
        loader: requireUser,
        Component: AppLayout,
        children: [
          { index: true, loader: () => redirect(DEFAULT_REDIRECT) },
          { path: 'webhooks', element: <Title order={2}>Webhooks</Title> },
          { path: 'webhooks/:id', element: <Title order={2}>Webhook</Title> },
        ],
      },
      { path: '*', loader: () => redirect(DEFAULT_REDIRECT) },
    ],
  },
])
