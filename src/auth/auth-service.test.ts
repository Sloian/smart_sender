import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { ApiError } from '../api/api-error'
import { MOCK_USER, mockControl } from '../mocks/state'
import { queryClient } from '../query-client'
import { count, server, setupMockServer, wire } from '../test/mock-server'
import { fetchMe } from './auth-api'
import { signIn, signOut, subscribeToSessionEnd, type NavigateTo } from './auth-service'
import { getFingerprint } from './fingerprint'
import { session } from './session'

vi.mock('../api/client', async () => {
  const { createHttpClient } = await import('../api/http-client')
  const { getFingerprint: fingerprint } = await import('./fingerprint')
  const client = createHttpClient({ baseUrl: 'http://localhost' })
  client.setFingerprintProvider(fingerprint)
  return { httpClient: client }
})

setupMockServer()

const credentials = { email: MOCK_USER.email, password: MOCK_USER.password }

const expectedUser = {
  id: 1,
  email: 'demo@smartsender.test',
  first_name: 'Demo',
  last_name: 'User',
  name: 'Demo User',
}

const webhooksLocation = { pathname: '/webhooks', search: '?page=2&search=hook', hash: '' }

const wireLines = () => wire.map((entry) => `${entry.method} ${entry.path} ${entry.status}`)

function navigateSpy(records: string[] = []) {
  return vi.fn<NavigateTo>((to) => {
    records.push(`navigate ${to} cache=${queryClient.getQueryCache().getAll().length} user=${session.user()?.name ?? 'null'}`)
    return Promise.resolve()
  })
}

let unsubscribe: (() => void) | undefined

beforeEach(() => {
  session.clear()
  queryClient.clear()
})

afterEach(() => {
  unsubscribe?.()
  unsubscribe = undefined
})

describe('auth service', () => {
  test('signs in with login, issue and me in order and keeps only the user', async () => {
    const user = await signIn(credentials)

    expect(user).toEqual(expectedUser)
    expect(session.user()).toEqual(expectedUser)
    const lines = wireLines()
    expect(lines.filter((line) => !line.startsWith('GET /csrf '))).toEqual([
      'POST /auth/login 200',
      'POST /auth/token/issue 200',
      'GET /v1/me 200',
    ])
    const csrfIndex = lines.findIndex((line) => line.startsWith('GET /csrf '))
    if (csrfIndex !== -1) expect(csrfIndex).toBeLessThan(lines.indexOf('POST /auth/login 200'))
    expect(JSON.stringify(user)).not.toContain('device_session_token')
    expect(getFingerprint()).toMatch(/^[0-9a-f]{32}$/)
  })

  test('a wrong password rejects with the field error and starts no session', async () => {
    const error: unknown = await signIn({ email: MOCK_USER.email, password: 'wrong-password' }).catch(
      (reason: unknown) => reason,
    )

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({
      status: 422,
      type: 'ValidationException',
      fieldErrors: { password: ['These credentials do not match our records.'] },
    })
    expect(count('POST', '/auth/token/issue')).toBe(0)
    expect(session.user()).toBeNull()
  })

  test('sign out revokes the session, navigates to login and then clears the cache', async () => {
    await signIn(credentials)
    queryClient.setQueryData(['probe'], 1)
    const records: string[] = []
    const navigate = navigateSpy(records)

    await signOut(navigate)

    expect(records).toEqual(['navigate /login cache=1 user=null'])
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0)
    expect(session.user()).toBeNull()
    expect(wireLines()).toContain('POST /auth/token/revoke 204')

    await expect(fetchMe()).rejects.toMatchObject({ status: 401 })
    expect(wireLines()).toContain('POST /auth/token/rotate 400')
  })

  test('sign out still ends the local session when revoke fails', async () => {
    await signIn(credentials)
    queryClient.setQueryData(['probe'], 1)
    server.use(http.post('*/auth/token/revoke', () => HttpResponse.error(), { once: true }))
    const navigate = navigateSpy()

    await expect(signOut(navigate)).resolves.toBeUndefined()

    expect(navigate).toHaveBeenCalledWith('/login')
    expect(session.user()).toBeNull()
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0)
  })

  test('an expired session is renewed without leaving the page', async () => {
    const navigate = navigateSpy()
    unsubscribe = subscribeToSessionEnd(navigate, () => webhooksLocation)
    await signIn(credentials)
    wire.length = 0
    mockControl.expireSession()

    await expect(fetchMe()).resolves.toEqual(expectedUser)

    expect(wireLines()).toEqual(['GET /v1/me 401', 'POST /auth/token/rotate 200', 'GET /v1/me 200'])
    expect(navigate).not.toHaveBeenCalled()
    expect(session.user()).toEqual(expectedUser)
  })

  test('a failed renewal ends the local session and returns to login with the expired reason', async () => {
    const navigate = navigateSpy()
    unsubscribe = subscribeToSessionEnd(navigate, () => webhooksLocation)
    await signIn(credentials)
    queryClient.setQueryData(['probe'], 1)
    mockControl.revokeSession()

    const error: unknown = await fetchMe().catch((reason: unknown) => reason)

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 401 })
    expect(wireLines()).toContain('POST /auth/token/rotate 400')
    expect(navigate).toHaveBeenCalledTimes(1)
    expect(navigate).toHaveBeenCalledWith('/login?redirectTo=%2Fwebhooks%3Fpage%3D2%26search%3Dhook&reason=expired')
    expect(session.user()).toBeNull()
    await vi.waitFor(() => {
      expect(queryClient.getQueryCache().getAll()).toHaveLength(0)
    })
  })

  test('the session end subscription stops after unsubscribe', async () => {
    const navigate = navigateSpy()
    subscribeToSessionEnd(navigate, () => webhooksLocation)()
    await signIn(credentials)
    mockControl.revokeSession()

    await expect(fetchMe()).rejects.toMatchObject({ status: 401 })

    expect(navigate).not.toHaveBeenCalled()
  })
})
