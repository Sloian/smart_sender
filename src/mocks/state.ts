import type { Webhook } from '../api/contract'

export const MOCK_USER = {
  id: 1,
  email: 'demo@smartsender.test',
  password: 'password123',
  first_name: 'Demo',
  last_name: 'User',
}

export const CSRF_TOKEN = 'mock-csrf-token-7f3a9c'
const DEFAULT_SESSION_TTL_MS = 30_000

interface Session {
  fingerprint: string
  expiresAt: number
}

interface MockState {
  webhooks: Webhook[]
  deviceTokens: Map<string, string>
  session: Session | null
  sessionTtlMs: number
  clockOffsetMs: number
}

const seedKinds = [
  { name: 'Order', endpoint: 'https://shop.example.com/webhooks/orders' },
  { name: 'Lead', endpoint: 'https://crm.example.com/webhooks/leads' },
  { name: 'Payment', endpoint: 'https://billing.example.com/webhooks/payments' },
] as const

function seedWebhooks(): Webhook[] {
  return Array.from({ length: 28 }, (_, index) => {
    const id = index + 1
    const createdAt = new Date(Date.UTC(2026, 0, id))
    const kind = seedKinds[id % seedKinds.length] ?? seedKinds[0]
    return {
      id,
      name: `${kind.name} hook ${id}`,
      url: `${kind.endpoint}/${id}`,
      active: id % 4 !== 0,
      created_at: createdAt.toISOString(),
    }
  })
}

export const state: MockState = {
  webhooks: seedWebhooks(),
  deviceTokens: new Map<string, string>(),
  session: null,
  sessionTtlMs: DEFAULT_SESSION_TTL_MS,
  clockOffsetMs: 0,
}

export const now = (): number => Date.now() + state.clockOffsetMs

export const mockControl = {
  reset(): void {
    state.webhooks = seedWebhooks()
    state.deviceTokens.clear()
    state.session = null
    state.sessionTtlMs = DEFAULT_SESSION_TTL_MS
    state.clockOffsetMs = 0
  },
  setSessionTtl(ms: number): void {
    state.sessionTtlMs = ms
  },
  advanceTime(ms: number): void {
    state.clockOffsetMs += ms
  },
  expireSession(): void {
    if (state.session) state.session.expiresAt = now() - 1
  },
  revokeSession(): void {
    state.session = null
  },
}
