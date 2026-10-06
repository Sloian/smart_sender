import { describe, expect, test } from 'vitest'
import { SESSION_EXPIRED_REASON, loginPath, safeRedirectPath } from './redirect'

const webhooksLocation = { pathname: '/webhooks', search: '?page=2&search=hook', hash: '' }

describe('safeRedirectPath', () => {
  test.each(['/webhooks?page=2&search=hook', '/webhooks/5', '/webhooks#top'])('keeps %s', (value) => {
    expect(safeRedirectPath(value)).toBe(value)
  })

  test.each([
    null,
    undefined,
    '',
    'webhooks',
    'https://evil.example',
    '//evil.example/path',
    '/\\evil.example',
    '/\t/evil.example',
    'javascript:alert(1)',
    '/login',
    '/LOGIN/',
    '/login?redirectTo=/x',
  ])('falls back to /webhooks for %j', (value) => {
    expect(safeRedirectPath(value)).toBe('/webhooks')
  })
})

describe('loginPath', () => {
  test('keeps the path and query of a protected location', () => {
    expect(loginPath(webhooksLocation)).toBe('/login?redirectTo=%2Fwebhooks%3Fpage%3D2%26search%3Dhook')
  })

  test('keeps a nested path', () => {
    expect(loginPath({ pathname: '/webhooks/5', search: '', hash: '' })).toBe('/login?redirectTo=%2Fwebhooks%2F5')
  })

  test('keeps the hash of a URL', () => {
    expect(loginPath(new URL('http://localhost/webhooks?page=2#top'))).toBe(
      '/login?redirectTo=%2Fwebhooks%3Fpage%3D2%23top',
    )
  })

  test.each(['/', '/login'])('does not wrap %s', (pathname) => {
    expect(loginPath({ pathname, search: '', hash: '' })).toBe('/login')
  })

  test('adds the expired reason after the return-to path', () => {
    expect(loginPath(webhooksLocation, SESSION_EXPIRED_REASON)).toBe(
      '/login?redirectTo=%2Fwebhooks%3Fpage%3D2%26search%3Dhook&reason=expired',
    )
  })

  test('adds only the expired reason for the root path', () => {
    expect(loginPath({ pathname: '/', search: '', hash: '' }, SESSION_EXPIRED_REASON)).toBe('/login?reason=expired')
  })

  test('keeps the existing target when the session ends on the login page', () => {
    expect(
      loginPath({ pathname: '/login', search: '?redirectTo=%2Fwebhooks%2F5', hash: '' }, SESSION_EXPIRED_REASON),
    ).toBe('/login?redirectTo=%2Fwebhooks%2F5&reason=expired')
  })
})
