export const LOGIN_PATH = '/login'
export const DEFAULT_REDIRECT = '/webhooks'
export const REDIRECT_PARAM = 'redirectTo'
export const REASON_PARAM = 'reason'
export const SESSION_EXPIRED_REASON = 'expired'

export type LoginReason = typeof SESSION_EXPIRED_REASON

const PARSE_BASE = 'http://app.invalid'

export interface PathLike {
  pathname: string
  search: string
  hash: string
}

function isLoginPath(pathname: string): boolean {
  try {
    const normalized = decodeURIComponent(pathname).toLowerCase().replace(/\/+$/, '')
    return normalized === LOGIN_PATH
  } catch {
    return true
  }
}

export function safeRedirectPath(value: string | null | undefined): string {
  if (value === null || value === undefined) return DEFAULT_REDIRECT
  if (!value.startsWith('/')) return DEFAULT_REDIRECT
  if (!URL.canParse(value, PARSE_BASE)) return DEFAULT_REDIRECT
  const url = new URL(value, PARSE_BASE)
  if (url.origin !== PARSE_BASE) return DEFAULT_REDIRECT
  if (isLoginPath(url.pathname)) return DEFAULT_REDIRECT
  return `${url.pathname}${url.search}${url.hash}`
}

export function loginPath({ pathname, search, hash }: PathLike, reason?: LoginReason): string {
  const params = new URLSearchParams()
  if (isLoginPath(pathname)) {
    const loginParams = new URLSearchParams(search)
    const target = loginParams.get(REDIRECT_PARAM)
    if (target !== null) params.set(REDIRECT_PARAM, target)
  } else if (pathname !== '/') {
    params.set(REDIRECT_PARAM, `${pathname}${search}${hash}`)
  }
  if (reason) params.set(REASON_PARAM, reason)
  const query = params.toString()
  if (query === '') return LOGIN_PATH
  return `${LOGIN_PATH}?${query}`
}
