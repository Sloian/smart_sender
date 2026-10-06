import { redirect, type LoaderFunctionArgs } from 'react-router'
import type { Me } from '../api/contract'
import { loginPath, REDIRECT_PARAM, safeRedirectPath } from './redirect'
import { session } from './session'

export function requireUser({ request }: LoaderFunctionArgs): Me | Response {
  const user = session.user()
  if (!user) {
    const requestedUrl = new URL(request.url)
    const target = loginPath(requestedUrl)
    return redirect(target)
  }
  return user
}

export function redirectIfSignedIn({ request }: LoaderFunctionArgs): Response | null {
  if (!session.user()) return null
  const requestedUrl = new URL(request.url)
  const redirectTo = requestedUrl.searchParams.get(REDIRECT_PARAM)
  const target = safeRedirectPath(redirectTo)
  return redirect(target)
}
