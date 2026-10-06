import { bypass, http } from 'msw'
import { setupWorker } from 'msw/browser'
import { handlers } from './handlers'

const cacheOnlyRequests = http.get(
  ({ request }) =>
    request.cache === 'only-if-cached' && new URL(request.url).origin === window.location.origin,
  ({ request }) => fetch(bypass(request.url)),
)

export const worker = setupWorker(cacheOnlyRequests, ...handlers)
