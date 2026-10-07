# Smart Sender — Webhooks Admin

A React + TypeScript (strict) SPA for the Smart Sender Senior Frontend test task. It has device-session login, a paginated and searchable webhooks list, and a webhook edit page. The API is an MSW mock of the task contract that runs in the browser, so no backend is needed.

## Run

Requires Node 22.22+ (CI uses Node 24 from `.nvmrc`).

```bash
npm ci
npm run dev
```

Open http://localhost:5173. The mock keeps its state in page memory, so a reload resets the session and you sign in again. After signing in you return to the URL you were on.

## Test credentials

`demo@smartsender.test` / `password123`

## Tests

```bash
npm test
```

The required test is `two parallel requests with 401 share one rotate and both retries succeed` in `src/api/http-client.test.ts`. It checks that two parallel 401s trigger one rotate and both retries succeed. To run it alone:

```bash
npx vitest run src/api/http-client.test.ts -t "two parallel requests with 401 share one rotate"
```

The tests run in Node against the same MSW handlers the browser uses and assert on the log of real requests. CI (`.github/workflows/ci.yml`) also runs `npm run typecheck`, `npm run lint` and `npm run build`.

## Key decisions

- **One HTTP client owns the retry rules.** `src/api/http-client.ts` has no React imports.
  - Concurrent 401s on `/v1/` share one `/auth/token/rotate`.
  - A 419 triggers one shared CSRF refetch.
  - Each request is retried at most once after a 401 and once after a 419.
  - A failed rotate or a repeated 401 ends the session once and redirects to `/login?redirectTo=…&reason=expired`.
  - A session generation counter stops requests from an ended session from being replayed after the next sign-in.
- **Session data.**
  - `device_session_token` exists only in a local variable between login and issue.
  - The 32-hex fingerprint is generated once with Web Crypto and kept in `localStorage`.
  - The user is held in memory.
  - Logout first invalidates the session, so late 401s are ignored. It then calls revoke and clears the query cache.
- **Layers.**
  - `src/api` holds the client, the zod contract and `ApiError`.
  - `src/auth` and `src/webhooks` hold the API wrappers, TanStack Query options and URL params.
  - `src/pages` holds the UI.
  - Route guards are React Router loaders, so protected pages never render without a user.
- **The URL is the source of truth for the list.**
  - The route loader parses and canonicalizes `page` and `search`.
  - Search is debounced by 300 ms and resets to page 1. Back and Forward restore the previous state.
  - Loading, empty, error and page-out-of-range states are explicit.
  - The edit page `/webhooks/:id` keeps the list's `page` and `search` in its URL, so you return to the same view.
- **Forms and errors.**
  - Forms use react-hook-form.
  - Server 422 `payload` errors are shown under the matching fields (`src/lib/server-errors.ts`). Other errors appear in a form-level alert.
  - Every non-2xx response becomes a typed `ApiError`.
- **UI.** A Mantine theme with WCAG AA contrast in light and dark mode (follows the system setting); below 768 px the list switches to stacked cards.
- **Typing.**
  - TypeScript runs with `strict` and `noUncheckedIndexedAccess`; ESLint uses `strictTypeChecked`.
  - API types are inferred from the zod schemas in `src/api/contract.ts`, and response data is validated against them.
- **Scale.** The project is a single package with flat feature folders.

## Unfinished and limitations

- The mock is always on, including in the production build. A real deployment would put it behind an env flag and use a real API.
- The session does not survive a reload because the mock resets. The task allows this.
- The repo has no browser or E2E tests, and page components are not rendered in tests. Browser flows were checked by hand with Playwright.
- When Chrome restarts the idle mock service worker, a request in the next 5 s can miss the mock. The login form then shows "Can't reach the server", and a reload fixes it.
- There is no route-level code splitting, so `npm run build` warns about a chunk larger than 500 kB.
