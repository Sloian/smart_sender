import { createMemoryRouter, redirect, type RouteObject } from 'react-router'
import { beforeEach, describe, expect, test } from 'vitest'
import type { Me } from '../api/contract'
import { MOCK_USER } from '../mocks/state'
import { DEFAULT_REDIRECT, LOGIN_PATH } from './redirect'
import { redirectIfSignedIn, requireUser } from './route-guards'
import { session } from './session'

const user: Me = {
  id: MOCK_USER.id,
  email: MOCK_USER.email,
  first_name: MOCK_USER.first_name,
  last_name: MOCK_USER.last_name,
  name: 'Demo User',
}

const routes: RouteObject[] = [
  {
    children: [
      { path: LOGIN_PATH, loader: redirectIfSignedIn },
      {
        id: 'protected',
        loader: requireUser,
        children: [
          { index: true, loader: () => redirect(DEFAULT_REDIRECT) },
          { path: 'webhooks' },
          { path: 'webhooks/:id' },
        ],
      },
      { path: '*', loader: () => redirect(DEFAULT_REDIRECT) },
    ],
  },
]

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
