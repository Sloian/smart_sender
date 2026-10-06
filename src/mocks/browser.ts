import { bypass, http } from 'msw'
import { setupWorker } from 'msw/browser'
import { handlers } from './handlers'

const MOCKED_PREFIXES = ['/csrf', '/auth/', '/v1/']

const cacheOnlyRequests = http.get(
  ({ request }) => {
    if (request.cache !== 'only-if-cached') return false
    const url = new URL(request.url)
    return url.origin === window.location.origin && !MOCKED_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))
  },
  ({ request }) => fetch(bypass(request.url)),
)

const worker = setupWorker(cacheOnlyRequests, ...handlers)

const ACTIVATE_MESSAGE = 'MOCK_ACTIVATE'
const REACTIVATE_INTERVAL_MS = 5_000

function keepMockingActive(registration: ServiceWorkerRegistration): void {
  const activate = () => {
    registration.active?.postMessage(ACTIVATE_MESSAGE)
  }
  window.addEventListener('focus', activate)
  window.addEventListener('pageshow', activate)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') activate()
  })
  window.setInterval(activate, REACTIVATE_INTERVAL_MS)
}

export async function startMocking(): Promise<void> {
  const registration = await worker.start({ onUnhandledFrame: 'bypass', quiet: true })
  if (registration) keepMockingActive(registration)
}
