import { redirect, type LoaderFunctionArgs } from 'react-router'
import type { Me } from '../api/contract'
import { loginPath, REDIRECT_PARAM, safeRedirectPath } from './redirect'
import { session } from './session'

export function requireUser({ request }: LoaderFunctionArgs): Me | Response {
  const user = session.user()
  return user ?? redirect(loginPath(new URL(request.url)))
}

export function redirectIfSignedIn({ request }: LoaderFunctionArgs): Response | null {
  if (!session.user()) return null
  return redirect(safeRedirectPath(new URL(request.url).searchParams.get(REDIRECT_PARAM)))
}
