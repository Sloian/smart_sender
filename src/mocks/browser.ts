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

export const worker = setupWorker(cacheOnlyRequests, ...handlers)
