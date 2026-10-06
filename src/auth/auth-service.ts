import { httpClient } from '../api/client'
import type { Me } from '../api/contract'
import { queryClient } from '../query-client'
import { fetchMe, issueSession, login, revokeSession, type Credentials } from './auth-api'
import { LOGIN_PATH, SESSION_EXPIRED_REASON, loginPath, type PathLike } from './redirect'
import { session } from './session'

export type NavigateTo = (to: string) => Promise<void>

export interface SignOutOptions {
  revokeTimeoutMs?: number
}

const REVOKE_TIMEOUT_MS = 5_000

export async function signIn(credentials: Credentials): Promise<Me> {
  httpClient.invalidateSession()
  const deviceSessionToken = await login(credentials)
  await issueSession(deviceSessionToken)
  const user = await fetchMe()
  session.start(user)
  return user
}

async function endLocalSession(navigate: NavigateTo, to: string): Promise<void> {
  session.clear()
  try {
    await navigate(to)
  } finally {
    queryClient.clear()
  }
}

let pendingSignOut: Promise<void> | null = null

async function revokeQuietly(timeoutMs: number): Promise<void> {
  const signal = AbortSignal.timeout(timeoutMs)
  try {
    await revokeSession(signal)
  } catch {
    return
  }
}

async function runSignOut(navigate: NavigateTo, revokeTimeoutMs: number): Promise<void> {
  httpClient.invalidateSession()
  await revokeQuietly(revokeTimeoutMs)
  await endLocalSession(navigate, LOGIN_PATH)
}

export function signOut(navigate: NavigateTo, { revokeTimeoutMs = REVOKE_TIMEOUT_MS }: SignOutOptions = {}): Promise<void> {
  if (pendingSignOut === null) {
    pendingSignOut = runSignOut(navigate, revokeTimeoutMs).finally(() => {
      pendingSignOut = null
    })
  }
  return pendingSignOut
}

export function subscribeToSessionEnd(navigate: NavigateTo, currentLocation: () => PathLike): () => void {
  return httpClient.onSessionEnd(() => {
    if (pendingSignOut) return
    if (!session.user()) return
    const location = currentLocation()
    const target = loginPath(location, SESSION_EXPIRED_REASON)
    void endLocalSession(navigate, target)
  })
}
