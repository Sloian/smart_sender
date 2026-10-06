import type { ZodType } from 'zod'
import { API_UNAVAILABLE_MESSAGE, ApiError } from './api-error'
import { CSRF_HEADER, REQUESTED_WITH_HEADER, REQUESTED_WITH_VALUE, type FingerprintRequest } from './contract'

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
  reportError?: (error: unknown) => void
}

const CSRF_PATH = '/csrf'
const ROTATE_PATH = '/auth/token/rotate'

const needsCsrf = (method: HttpMethod) => method !== 'GET'
const isRotatable = (pathname: string) => pathname.startsWith('/v1/')

function missingFingerprint(): string {
  throw new Error('Fingerprint provider is not configured.')
}

function reportAsync(error: unknown) {
  queueMicrotask(() => {
    throw error
  })
}

function isJson(response: Response): boolean {
  const contentType = response.headers.get('Content-Type')
  if (contentType === null) return false
  return contentType.includes('json')
}

function serializeBody(body: unknown): string | undefined {
  if (body === undefined) return undefined
  return JSON.stringify(body)
}

function parseSuccessBody<T>(body: unknown, schema: ZodType<T> | undefined): T {
  if (schema) return schema.parse(body)
  return body as T
}

async function readBody(response: Response, strict = false): Promise<unknown> {
  const text = await response.text()
  if (!text) return undefined
  try {
    return JSON.parse(text) as unknown
  } catch (error) {
    if (strict && isJson(response)) throw error
    return undefined
  }
}

export function createHttpClient(config: HttpClientConfig) {
  const listeners = new Set<SessionEndListener>()
  let fingerprint: () => string = missingFingerprint
  let csrfToken: string | null = null
  let csrfRequest: Promise<string> | null = null
  let csrfGeneration = 0
  let rotateRequest: Promise<void> | null = null
  let sessionGeneration = 0
  let endedAtGeneration = 0

  const reportError = config.reportError ?? reportAsync
  const origin = new URL(config.baseUrl).origin

  function doFetch(url: URL, init: RequestInit): Promise<Response> {
    const fetchImpl = config.fetch ?? globalThis.fetch
    return fetchImpl(url, init)
  }

  function buildUrl(path: string, query: Record<string, QueryValue> = {}) {
    const url = new URL(path, config.baseUrl)
    if (url.origin !== origin) throw new Error(`Cross-origin request blocked: ${url.origin}`)
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

  async function requestCsrfToken(): Promise<string> {
    const csrfUrl = buildUrl(CSRF_PATH)
    const response = await doFetch(csrfUrl, {
      headers: { [REQUESTED_WITH_HEADER]: REQUESTED_WITH_VALUE },
    })
    const token = response.headers.get(CSRF_HEADER)
    if (!response.ok || !token) {
      const body = await readBody(response)
      throw ApiError.fromBody(response.status, body, API_UNAVAILABLE_MESSAGE)
    }
    csrfToken = token
    csrfGeneration += 1
    return token
  }

  function fetchCsrf(): Promise<string> {
    if (csrfRequest === null) {
      csrfRequest = requestCsrfToken().finally(() => {
        csrfRequest = null
      })
    }
    return csrfRequest
  }

  async function ensureCsrf(): Promise<string> {
    if (csrfToken !== null) return csrfToken
    return fetchCsrf()
  }

  async function refreshCsrf(csrfGenerationAtSend: number): Promise<void> {
    if (csrfGeneration !== csrfGenerationAtSend) return
    csrfToken = null
    await fetchCsrf()
  }

  function invalidateSession() {
    sessionGeneration += 1
    endedAtGeneration = sessionGeneration
  }

  function endSession() {
    invalidateSession()
    for (const listener of listeners) {
      try {
        listener()
      } catch (error) {
        reportError(error)
      }
    }
  }

  async function runRotate(body: FingerprintRequest): Promise<void> {
    const startedAt = sessionGeneration
    try {
      await send(ROTATE_PATH, { method: 'POST', body })
    } catch (error) {
      if (endedAtGeneration <= startedAt) endSession()
      throw error
    }
    if (endedAtGeneration > startedAt) throw new ApiError(401, 'AuthenticationException', 'Session ended.')
    sessionGeneration += 1
  }

  function rotate(): Promise<void> {
    if (rotateRequest === null) {
      const body: FingerprintRequest = { fingerprint: fingerprint() }
      rotateRequest = runRotate(body).finally(() => {
        rotateRequest = null
      })
    }
    return rotateRequest
  }

  async function renewSession(generationAtSend: number, error: ApiError): Promise<void> {
    const rotatedSinceSend = generationAtSend !== sessionGeneration && rotateRequest === null
    if (rotatedSinceSend) return
    const rotation = rotate()
    try {
      await rotation
    } catch {
      throw error
    }
  }

  async function send<T>(path: string, options: RequestOptions<T> = {}): Promise<T> {
    const method = options.method ?? 'GET'
    const url = buildUrl(path, options.query)
    const rotatable = isRotatable(url.pathname)
    let csrfRetried = false
    let authRetried = false

    for (;;) {
      const token = await ensureCsrf()
      const csrfGenerationAtSend = csrfGeneration
      const generationAtSend = sessionGeneration

      const response = await doFetch(url, {
        method,
        headers: buildHeaders(method, token, options),
        body: serializeBody(options.body),
        signal: options.signal,
      })

      if (response.ok) {
        const body = await readBody(response, true)
        return parseSuccessBody(body, options.schema)
      }

      const errorBody = await readBody(response)
      const error = ApiError.fromBody(response.status, errorBody)

      if (response.status === 419 && !csrfRetried) {
        csrfRetried = true
        await refreshCsrf(csrfGenerationAtSend)
        continue
      }

      if (response.status === 401 && rotatable) {
        if (generationAtSend < endedAtGeneration) throw error
        if (authRetried) {
          if (generationAtSend === sessionGeneration) endSession()
          throw error
        }
        authRetried = true
        await renewSession(generationAtSend, error)
        continue
      }

      throw error
    }
  }

  function request<T>(path: string, options: RequestOptions<T> & { schema: ZodType<T> }): Promise<T>
  function request(path: string, options?: Omit<RequestOptions<unknown>, 'schema'>): Promise<unknown>
  async function request(path: string, options: RequestOptions<unknown> = {}): Promise<unknown> {
    const target = buildUrl(path)
    if (target.pathname === ROTATE_PATH) throw new Error('Session rotation is managed by the http client.')
    return send(path, options)
  }

  return {
    request,
    invalidateSession,
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
