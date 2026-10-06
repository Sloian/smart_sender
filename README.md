# Smart Sender — Webhooks Admin

A small React + TypeScript (strict) single-page app built for the Smart Sender Senior Frontend Engineer test task. It covers signing in with a device session, browsing and searching webhooks, and editing a webhook. The backend is a self-written MSW mock of the task's API contract that runs in the browser, so no backend, database or environment variables are needed.

## Stack

- Vite 8, React 19
- TypeScript 6 with `strict` and `noUncheckedIndexedAccess`
- Mantine 9 for the UI
- TanStack Query 5 for server state
- React Router 8 data router, with loaders for guards and URL canonicalization
- react-hook-form 7 + zod 4 for forms and the contract schemas
- MSW 3: a browser worker for the app and a Node server for the tests
- Vitest 5
- ESLint 10 with typescript-eslint `strictTypeChecked`

## Requirements

- Node 24, pinned in `.nvmrc` and also used by CI. With nvm, run `nvm use`.
- npm, which ships with Node. Dependencies are locked in `package-lock.json`.
- Nothing else.

## Run the app

```bash
nvm use
npm ci
npm run dev
```

Open `http://localhost:5173`. That is Vite's default port; if it is taken, Vite prints the URL it used.

`src/main.tsx` registers and starts the MSW service worker (`public/mockServiceWorker.js`) before the app renders, so the mock API is active automatically.

**Reload behaviour.** The mock keeps all state, including the session and any webhook edits, in page memory, so a full reload resets it. You sign in again, which the task explicitly allows. After signing in you land on the URL you reloaded, including `page` and `search`, because the login redirect keeps it in `redirectTo`. The device fingerprint survives reloads in `localStorage`.

Production build, served at `http://localhost:4173`:

```bash
npm run build
npm run preview
```

The mock is included in the production build on purpose; see "Known limitations and unfinished items".

## Test credentials

- Email `demo@smartsender.test`, password `password123`. This is the single mock user, defined in `src/mocks/state.ts`.
- A wrong password shows "These credentials do not match our records." under the Password field (a 422 from the mock).
- There is no captcha widget. The client sends a fixed non-empty `X-Captcha-Token` header, which the mock accepts, as the task allows.

## Tests and checks

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

- `npm test`: the Vitest suite, run once in Node.
- `npm run typecheck`: `tsc -b` over the app and the build config.
- `npm run lint`: ESLint with type-aware rules.
- `npm run build`: the type-check plus the Vite production build.

**Required test.** The test the task asks for is `two parallel requests with 401 share one rotate and both retries succeed` in `src/api/http-client.test.ts`, in the `session rotation` block. Run it alone with:

```bash
npx vitest run src/api/http-client.test.ts -t "two parallel requests with 401 share one rotate"
```

It proves that after `mockControl.expireSession()`, `GET /v1/me` and `GET /v1/webhooks` run in parallel and both get 401. Exactly one `POST /auth/token/rotate` reaches the mock, carrying `X-CSRF-TOKEN`. Each request is retried once (statuses 401 then 200) and resolves with data. The session-end handler is not called.

What else is covered:

- `src/api/http-client.test.ts`: CSRF bootstrap and the 419 retry; a rotate failure or a 401 on the retry ending the session once; rotate never rotating; late 401s; requests from an ended session never replayed; the typed `ApiError`.
- `src/mocks/handlers.test.ts`: the mock against the contract.
- Tests under `src/auth/`: fingerprint, safe redirects, sign-in, sign-out and session end, route guards.
- Tests under `src/webhooks/`: list URL params, search-history rules, API wrappers, query options and cache sync.
- `src/lib/server-errors.test.ts`, `src/query-client.test.ts`, `src/components/RouteError.test.tsx` and `src/api/contract.test.ts`.

The tests run in Node against the same MSW handlers the browser uses, through `src/test/mock-server.ts` (msw/node). They assert on a log of the real requests and move mock time with `mockControl`, not with fake timers.

CI: `.github/workflows/ci.yml` runs on every push and pull request with Node from `.nvmrc`. Its steps are `npm ci`, typecheck, lint, test and build, with read-only permissions.

## Key decisions

### HTTP client

`src/api/http-client.ts` (`createHttpClient`) has no React or TanStack imports. All retry and session rules live in one place and are tested on the wire against the real mock.

- Every request sends `X-Requested-With: XMLHttpRequest`.
- CSRF: one shared lazy `GET /csrf` runs before the first other request, and parallel first calls share it. `X-CSRF-TOKEN` goes on POST and PUT only. A 419 triggers one shared token refetch and at most one retry; a second 419 surfaces as an error.
- A 401 on a `/v1/` request: all concurrent 401s share one `POST /auth/token/rotate`, then each request is retried once.
- A session generation counter does two things. A 401 that arrives after the rotate has already settled retries without a second rotate. A request sent before the session ended is never replayed in a later session.
- Rotate and the other `/auth/` calls never trigger a rotate. This is decided on the resolved same-origin path. Cross-origin URLs are rejected, and calling rotate through `request` is rejected.
- Retry budgets are per request and per failure kind: at most one retry after a 419 and one after a 401, so a request reaches the server at most three times.
- A rotate failure or a 401 on the retried request ends the session once. `onSessionEnd` listeners run once per ended session, and every caller rejects with its own 401 `ApiError`. The app then clears the in-memory user, redirects to `/login?redirectTo=…&reason=expired` (which shows a "Session expired" notice) and clears the TanStack Query cache.
- Every non-2xx response becomes a typed `ApiError` with status, type, message and field errors.
- Success bodies are validated with the zod schemas in `src/api/contract.ts`. A request without a schema returns `unknown`.
- A CSRF bootstrap that returns no token, for example when the mock worker is not active, shows "API is unavailable. Reload the page and try again." instead of a raw status.

### Session data

- `device_session_token` exists only in a local variable between `POST /auth/login` and `POST /auth/token/issue`. It is never stored: not in `localStorage`, `sessionStorage`, cookies or the URL.
- The 32-hex fingerprint is generated once with Web Crypto, kept in `localStorage` under `smart-sender.fingerprint`, and sent in the login, issue, rotate and revoke bodies.
- The signed-in user lives in memory only. Sign-in order is login, then issue, then `GET /v1/me`.
- Nothing calls `/v1/me` on a cold start, because after every reload it would only produce a rotate followed by a 400.
- Logout runs `invalidateSession()` first, so late 401s neither rotate nor redirect; then `POST /auth/token/revoke` with a 5 s timeout (a failure is ignored); then it clears the local user, navigates to `/login` and clears the query cache.

### Routing and guards

- The data-router loaders `requireUser` and `redirectIfSignedIn` in `src/auth/route-guards.ts` run before render and never call the API.
- The requested URL, including its query, travels in `redirectTo`.
- `safeRedirectPath` in `src/auth/redirect.ts` accepts only in-app paths. It blocks protocol-relative, backslash, absolute and `javascript:` targets, and login loops.
- Unknown routes redirect to `/webhooks`, and a route error boundary shows a generic error screen.
- `src/routes.tsx` is the one route tree, shared by the app and the guard tests.

### URL as the source of truth for the list

- `page` and `search` are parsed and serialized in `src/webhooks/list-params.ts`.
- The `/webhooks` loader canonicalizes the URL before render: `page` is omitted when it is 1, `search` is omitted when empty, and invalid values are normalized by a redirect.
- Search is debounced by 300 ms and resets to page 1.
- Refining a search replaces the history entry, while a new search or a page change pushes one, so Back and Forward stops stay meaningful.
- A pending debounce is dropped when the URL changes elsewhere (Back/Forward or pagination), so it cannot overwrite the restored state.
- A page past the end shows an explicit "Page not found" state with a link to the last page instead of silently clamping. An empty search result shows "No webhooks found".
- The edit page carries the list's `page` and `search` in its own URL, and the way back is rebuilt from them, so there is no free-form redirect parameter.

### Server state

- TanStack Query handles the list and the detail. `keepPreviousData` keeps the current page visible while the next one loads.
- Queries never retry an `ApiError`, because retries belong to the HTTP client. Other failures retry once, and mutations never retry.
- After a successful save the app sets the detail cache, patches the row in place in the cached list pages and invalidates the list queries. Nothing is written before the server confirms; there is no optimistic update.

### Forms

- react-hook-form throughout. The login form validates the email format and that a password is present with zod, and maps server 422 errors.
- The edit form lives on `/webhooks/:id`, a separate page that supports deep links and the 404 case. It has no client validation: the server's 422 messages appear under Name and URL through `applyServerErrors` in `src/lib/server-errors.ts`. The first invalid field gets focus and `aria-invalid` is set. Unknown keys and other errors appear in a form-level alert.
- A save that finishes after the user has left the form does not navigate.

### Mock design

- One handler list, `src/mocks/handlers.ts`, serves both the browser worker (`src/mocks/browser.ts`) and the Node test server (`src/test/mock-server.ts`).
- In-memory state and `mockControl` (reset, session TTL, clock offset, expire, revoke) live in `src/mocks/state.ts`.
- When Chrome restarts an idle service worker, MSW 3 forgets the page, so the page re-sends `MOCK_ACTIVATE` on focus, on `pageshow`, when it becomes visible, and every 5 s.
- Chrome DevTools sends `only-if-cached` requests. For non-API paths these get a bypass fetch, which removes the worker passthrough errors on reload.

### Scale and libraries

- A single package with flat feature folders, because the task asks for an architecture that matches its size.
- Mantine: a ready table, pagination, and inputs with error slots.
- TanStack Query: caching plus loading and error states, and one call to clear the cache on logout.
- React Router data router: loaders for guards and canonical URLs.
- react-hook-form + zod: typed forms; zod also validates every API response.
- MSW: required by the task, with the same handlers in the browser and the tests.
- Vitest: Vite-native, runs in Node.

## Mock API

- The mock implements the nine endpoints of the task's contract: `GET /csrf`, `POST /auth/login`, `POST /auth/token/issue`, `POST /auth/token/rotate`, `POST /auth/token/revoke`, `GET /v1/me`, `GET /v1/webhooks`, `GET /v1/webhooks/{id}` and `PUT /v1/webhooks/{id}`.
- Errors use the `{ error: { type, message, payload? } }` envelope.
- The CSRF token is fixed: `mock-csrf-token-7f3a9c`. Every POST and PUT without it, including login and rotate, gets 419 before anything changes.
- `/auth/login` needs a non-empty `X-Captcha-Token`; otherwise it returns 422 on `captcha`. A wrong email or password returns 422 on `password`.
- The device session token is single-use and bound to the fingerprint used at login.
- The session lasts 30 s after issue. Each rotate extends it to 30 s from now.
- Rotate returns 400 before issue, after revoke, or for another fingerprint. Protected endpoints return 401 once the session has lapsed.
- There are 28 seeded webhooks named Order, Lead or Payment hook N, in a stable order by id.
- `page` starts at 1, and a page past the end returns an empty `data` array. The page size is always 10, whatever `limit` says.
- Search is a case-insensitive literal substring match on the name. Whitespace is not trimmed, following the task's wording. `results.total` counts the matches after search.
- PUT checks run in this order: CSRF (419), session (401), unknown id (404), validation (422). Validation requires a name after trimming and an http or https URL with a host.
- All state lives in page memory and resets on reload.

## Project structure

- `src/api/`: contract schemas, `ApiError`, the HTTP client and its app instance
- `src/auth/`: fingerprint, in-memory session, auth API, sign-in/sign-out/session-end service, route guards, safe redirects
- `src/webhooks/`: list URL params, search-history rules, API wrappers, query options and cache sync
- `src/pages/`: login, webhooks list and webhook edit pages
- `src/components/`: app layout with header and logout, full-page loader, route error screen
- `src/lib/`: mapping server 422 errors to form fields
- `src/mocks/`: MSW handlers, state and browser worker setup
- `src/test/`: the shared MSW Node server and request log for tests
- `src/main.tsx`: starts the mock, then renders
- `src/App.tsx`: providers and the session-end subscription
- `src/routes.tsx`: the route tree
- `src/router.tsx`: the browser router
- `src/query-client.ts`: the TanStack Query client and its retry rules

Tests sit next to the code as `*.test.ts` / `*.test.tsx`.

## Known limitations and unfinished items

- The mock ships in the production build on purpose. The worker starts in every build, so `npm run preview` works without a backend. A real deployment would gate the mock behind an environment flag and point the client at a real API.
- A reload resets the mock (session and edits), so the session does not survive a reload. The task allows signing in again.
- If Chrome restarts the idle mock service worker while the tab stays visible and focused, requests in the next 5 s or less can miss the mock. If one of them is the CSRF bootstrap, the login form shows "API is unavailable. Reload the page and try again." and a reload fixes it. Recovery was checked by stopping the worker through the Chrome DevTools Protocol, not with a real multi-minute background idle.
- The repository has no browser or end-to-end test suite. All repository tests run in Node, and no page component is rendered in a test. Browser flows were checked with throwaway Playwright scripts that are not part of the repository: login, return-to URL, logout, session renewal, list, search, history, edit, 422, 404 and the narrow layout.
- A theoretical race remains in the search debounce: the 300 ms timer could fire in the sub-frame gap between a Back/Forward popstate and React committing the new location. It was never observed.
- The visual design is deliberately minimal (Mantine defaults), because the task grades logic rather than visuals.
- There is no route-level code splitting (only the mock is loaded as a separate chunk), so `npm run build` prints Vite's warning about a chunk larger than 500 kB.
- Creating, deleting and toggling webhooks is not implemented, because the contract has no such endpoints.

## Ideas for v2

- An optimistic update on save.
- Component tests for list URL sync and for edit-form error mapping, plus a Playwright suite in CI.
- Gate the mock behind an environment flag, with a configurable API base URL.
- With a real backend, restore the session on start through `/v1/me` instead of asking the user to sign in after a reload.
- Route-level code splitting.
