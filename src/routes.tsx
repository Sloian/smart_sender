import { Title } from '@mantine/core'
import { redirect, type RouteObject } from 'react-router'
import { DEFAULT_REDIRECT, LOGIN_PATH } from './auth/redirect'
import { redirectIfSignedIn, requireUser } from './auth/route-guards'
import { AppLayout } from './components/AppLayout'
import { FullPageLoader } from './components/FullPageLoader'
import { RouteError } from './components/RouteError'
import { LoginPage } from './pages/LoginPage'
import { canonicalListUrl } from './webhooks/list-params'

export const routes: RouteObject[] = [
  {
    HydrateFallback: FullPageLoader,
    ErrorBoundary: RouteError,
    children: [
      { path: LOGIN_PATH, loader: redirectIfSignedIn, Component: LoginPage },
      {
        id: 'protected',
        loader: requireUser,
        Component: AppLayout,
        children: [
          { index: true, loader: () => redirect(DEFAULT_REDIRECT) },
          { path: 'webhooks', loader: canonicalListUrl, element: <Title order={2}>Webhooks</Title> },
          { path: 'webhooks/:id', element: <Title order={2}>Webhook</Title> },
        ],
      },
      { path: '*', loader: () => redirect(DEFAULT_REDIRECT) },
    ],
  },
]
