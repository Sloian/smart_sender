import { httpClient } from '../api/client'
import type { Me } from '../api/contract'
import { queryClient } from '../query-client'
import { fetchMe, issueSession, login, revokeSession, type Credentials } from './auth-api'
import { LOGIN_PATH, SESSION_EXPIRED_REASON, loginPath, type PathLike } from './redirect'
import { session } from './session'

export type NavigateTo = (to: string) => Promise<void>

export async function signIn(credentials: Credentials): Promise<Me> {
  const deviceSessionToken = await login(credentials)
  await issueSession(deviceSessionToken)
  const user = await fetchMe()
  session.start(user)
  return user
}

export async function endLocalSession(navigate: NavigateTo, to: string): Promise<void> {
  session.clear()
  await navigate(to)
  queryClient.clear()
}

export async function signOut(navigate: NavigateTo): Promise<void> {
  httpClient.invalidateSession()
  await revokeSession().catch(() => undefined)
  await endLocalSession(navigate, LOGIN_PATH)
}

export function subscribeToSessionEnd(navigate: NavigateTo, currentLocation: () => PathLike): () => void {
  return httpClient.onSessionEnd(() => {
    void endLocalSession(navigate, loginPath(currentLocation(), SESSION_EXPIRED_REASON))
  })
}
