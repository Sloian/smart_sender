import type { ZodType } from 'zod'
import { ApiError } from './api-error'
import { CSRF_HEADER, REQUESTED_WITH_HEADER, REQUESTED_WITH_VALUE } from './contract'

export type HttpMethod = 'GET' | 'POST' | 'PUT'

export type QueryValue = string | number | undefined

export interface RequestOptions<T> {
  method?: HttpMethod
  body?: unknown
  query?: Record<string, QueryValue>
  headers?: Record<string, string>
  schema?: ZodType<T>
  signal?: AbortSignal
}

export type SessionEndListener = () => void

export interface HttpClientConfig {
  baseUrl: string
  fetch?: typeof fetch
}

const CSRF_PATH = '/csrf'
const ROTATE_PATH = '/auth/token/rotate'

const needsCsrf = (method: HttpMethod) => method !== 'GET'
const isRotatable = (path: string) => path.startsWith('/v1/')

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text) return undefined
  try {
    return JSON.parse(text) as unknown
  } catch {
    return undefined
  }
}

export function createHttpClient(config: HttpClientConfig) {
  const listeners = new Set<SessionEndListener>()
  let fingerprint: () => string = () => ''
  let csrfToken: string | null = null
  let csrfRequest: Promise<string> | null = null
  let csrfGeneration = 0
  let rotateRequest: Promise<void> | null = null
  let sessionGeneration = 0
  let endedAtGeneration = 0

  const doFetch = (url: URL, init: RequestInit) => (config.fetch ?? globalThis.fetch)(url, init)

  function buildUrl(path: string, query: Record<string, QueryValue> = {}) {
    const url = new URL(path, config.baseUrl)
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== '') url.searchParams.set(key, String(value))
    }
    return url
  }

  function buildHeaders(method: HttpMethod, token: string, options: RequestOptions<unknown>) {
    const headers = new Headers(options.headers)
    headers.set(REQUESTED_WITH_HEADER, REQUESTED_WITH_VALUE)
    headers.set('Accept', 'application/json')
    if (needsCsrf(method)) headers.set(CSRF_HEADER, token)
    else headers.delete(CSRF_HEADER)
    if (options.body !== undefined) headers.set('Content-Type', 'application/json')
    return headers
  }

  function fetchCsrf(): Promise<string> {
    csrfRequest ??= (async () => {
      const response = await doFetch(buildUrl(CSRF_PATH), {
        headers: { [REQUESTED_WITH_HEADER]: REQUESTED_WITH_VALUE },
      })
      const token = response.headers.get(CSRF_HEADER)
      if (!response.ok || !token) throw ApiError.fromBody(response.status, await readBody(response))
      csrfToken = token
      csrfGeneration += 1
      return token
    })().finally(() => {
      csrfRequest = null
    })
    return csrfRequest
  }

  async function ensureCsrf(): Promise<string> {
    return csrfToken ?? fetchCsrf()
  }

  function endSession() {
    sessionGeneration += 1
    endedAtGeneration = sessionGeneration
    for (const listener of listeners) listener()
  }

  function rotate(): Promise<void> {
    const startedAt = sessionGeneration
    rotateRequest ??= send<unknown>(ROTATE_PATH, { method: 'POST', body: { fingerprint: fingerprint() } })
      .then(
        () => {
          if (endedAtGeneration > startedAt) throw new ApiError(401, 'AuthenticationException', 'Session ended.')
          sessionGeneration += 1
        },
        (error: unknown) => {
          if (endedAtGeneration <= startedAt) endSession()
          throw error
        },
      )
      .finally(() => {
        rotateRequest = null
      })
    return rotateRequest
  }

  async function send<T>(path: string, options: RequestOptions<T> = {}): Promise<T> {
    const method = options.method ?? 'GET'
    let csrfRetried = false
    let authRetried = false

    for (;;) {
      const token = await ensureCsrf()
      const csrfGenerationAtSend = csrfGeneration
      const generationAtSend = sessionGeneration

      const response = await doFetch(buildUrl(path, options.query), {
        method,
        headers: buildHeaders(method, token, options),
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: options.signal,
      })

      if (response.ok) {
        const body = await readBody(response)
        return options.schema ? options.schema.parse(body) : (body as T)
      }

      const error = ApiError.fromBody(response.status, await readBody(response))

      if (response.status === 419 && !csrfRetried) {
        csrfRetried = true
        if (csrfGeneration === csrfGenerationAtSend) {
          csrfToken = null
          await fetchCsrf()
        }
        continue
      }

      if (response.status === 401 && isRotatable(path)) {
        if (generationAtSend < endedAtGeneration) throw error
        if (authRetried) {
          if (generationAtSend === sessionGeneration) endSession()
          throw error
        }
        authRetried = true
        if (generationAtSend !== sessionGeneration && !rotateRequest) continue
        await (rotateRequest ?? rotate()).catch(() => {
          throw error
        })
        continue
      }

      throw error
    }
  }

  return {
    request: send,
    setFingerprintProvider(provider: () => string) {
      fingerprint = provider
    },
    onSessionEnd(listener: SessionEndListener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

export type HttpClient = ReturnType<typeof createHttpClient>
