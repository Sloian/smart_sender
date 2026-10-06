import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, beforeEach } from 'vitest'
import { CSRF_HEADER, REQUESTED_WITH_HEADER } from '../api/contract'
import { handlers } from '../mocks/handlers'
import { mockControl } from '../mocks/state'

export const BASE_URL = 'http://localhost'

export interface WireEntry {
  method: string
  path: string
  status: number
  requestedWith: string | null
  csrfToken: string | null
}

export const wire: WireEntry[] = []

export function count(method: string, path: string): number {
  return wire.filter((entry) => entry.method === method && entry.path === path).length
}

export const server = setupServer(...handlers)

export function setupMockServer(): void {
  beforeAll(() => {
    server.listen({ onUnhandledFrame: 'error' })
    server.events.on('response:mocked', ({ request, response }) => {
      wire.push({
        method: request.method,
        path: new URL(request.url).pathname,
        status: response.status,
        requestedWith: request.headers.get(REQUESTED_WITH_HEADER),
        csrfToken: request.headers.get(CSRF_HEADER),
      })
    })
  })

  beforeEach(() => {
    mockControl.reset()
    wire.length = 0
  })

  afterEach(() => {
    server.resetHandlers()
  })

  afterAll(() => {
    server.events.removeAllListeners()
    server.close()
  })
}
