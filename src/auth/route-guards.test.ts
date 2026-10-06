import { createMemoryRouter } from 'react-router'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { Me } from '../api/contract'
import { MOCK_USER } from '../mocks/state'
import { routes } from '../routes'
import { session } from './session'

vi.mock('../api/client', async () => {
  const { createHttpClient } = await import('../api/http-client')
  const { getFingerprint: fingerprint } = await import('./fingerprint')
  const client = createHttpClient({ baseUrl: 'http://localhost' })
  client.setFingerprintProvider(fingerprint)
  return { httpClient: client }
})

const user: Me = {
  id: MOCK_USER.id,
  email: MOCK_USER.email,
  first_name: MOCK_USER.first_name,
  last_name: MOCK_USER.last_name,
  name: 'Demo User',
}

async function settle(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  router.initialize()
  await new Promise((resolve) => setTimeout(resolve, 0))
  const { location, loaderData } = router.state
  router.dispose()
  return { url: `${location.pathname}${location.search}`, loaderData }
}

const settledUrl = async (path: string) => (await settle(path)).url

describe('route guards', () => {
  beforeEach(() => {
    session.clear()
  })

  test('a signed out deep link keeps path and query in redirectTo', async () => {
    expect(await settledUrl('/webhooks?page=2&search=hook')).toBe(
      '/login?redirectTo=%2Fwebhooks%3Fpage%3D2%26search%3Dhook',
    )
    expect(await settledUrl('/webhooks/5')).toBe('/login?redirectTo=%2Fwebhooks%2F5')
  })

  test('a signed out root goes to login for the webhooks list', async () => {
    expect(await settledUrl('/')).toBe('/login?redirectTo=%2Fwebhooks')
  })

  test('a signed out login page stays put', async () => {
    expect(await settledUrl('/login?redirectTo=%2Fwebhooks')).toBe('/login?redirectTo=%2Fwebhooks')
  })

  test('a signed in login page forwards to the sanitized target', async () => {
    session.start(user)

    expect(await settledUrl('/login?redirectTo=%2Fwebhooks%3Fpage%3D2')).toBe('/webhooks?page=2')
    expect(await settledUrl('/login?redirectTo=%2F%2Fevil.example')).toBe('/webhooks')
    expect(await settledUrl('/login?redirectTo=%2Flogin')).toBe('/webhooks')
  })

  test('a signed in protected route exposes the user as loader data', async () => {
    session.start(user)

    const { url, loaderData } = await settle('/webhooks/5')

    expect(url).toBe('/webhooks/5')
    expect(loaderData.protected).toEqual(user)
  })

  test('signed in root and unknown paths land on the webhooks list', async () => {
    session.start(user)

    expect(await settledUrl('/')).toBe('/webhooks')
    expect(await settledUrl('/nope')).toBe('/webhooks')
  })
})

describe('webhooks list url', () => {
  beforeEach(() => {
    session.clear()
  })

  test('a signed in non canonical list url is canonicalized before render', async () => {
    session.start(user)

    expect(await settledUrl('/webhooks?page=1')).toBe('/webhooks')
    expect(await settledUrl('/webhooks?page=abc&search=hook')).toBe('/webhooks?search=hook')
    expect(await settledUrl('/webhooks?search=hook&page=2&foo=1')).toBe('/webhooks?page=2&search=hook')
  })

  test('a signed in canonical list url stays put', async () => {
    session.start(user)

    expect(await settledUrl('/webhooks?page=2&search=hook')).toBe('/webhooks?page=2&search=hook')
  })

  test('a signed out non canonical list url goes to login with the canonical target', async () => {
    expect(await settledUrl('/webhooks?page=0&search=hook')).toBe('/login?redirectTo=%2Fwebhooks%3Fsearch%3Dhook')
  })
})
