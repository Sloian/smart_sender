import { redirect, type RouteObject } from 'react-router'
import { DEFAULT_REDIRECT, LOGIN_PATH } from './auth/redirect'
import { redirectIfSignedIn, requireUser } from './auth/route-guards'
import { AppLayout } from './components/AppLayout'
import { FullPageLoader } from './components/FullPageLoader'
import { RouteError } from './components/RouteError'
import { LoginPage } from './pages/LoginPage'
import { WebhookEditPage } from './pages/WebhookEditPage'
import { WebhooksPage } from './pages/WebhooksPage'
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
          { path: 'webhooks', loader: canonicalListUrl, Component: WebhooksPage },
          { path: 'webhooks/:id', Component: WebhookEditPage },
        ],
      },
      { path: '*', loader: () => redirect(DEFAULT_REDIRECT) },
    ],
  },
]
