import { MantineProvider } from '@mantine/core'
import { renderToString } from 'react-dom/server'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, test } from 'vitest'
import { RouteError } from './RouteError'

async function renderAfterLoaderError() {
  const router = createMemoryRouter(
    [
      {
        ErrorBoundary: RouteError,
        children: [
          {
            path: 'webhooks',
            loader: () => {
              throw new Error('loader failed')
            },
          },
        ],
      },
    ],
    { initialEntries: ['/webhooks'] },
  )
  router.initialize()
  await new Promise((resolve) => setTimeout(resolve, 0))
  const html = renderToString(
    <MantineProvider>
      <RouterProvider router={router} />
    </MantineProvider>,
  )
  router.dispose()
  return html
}

describe('RouteError', () => {
  test('a loader error shows the app error screen with a way back to the webhooks', async () => {
    const html = await renderAfterLoaderError()

    expect(html).toContain('Something went wrong')
    expect(html).toContain('<title>Something went wrong · Smart Sender</title>')
    expect(html).toContain('<h1')
    expect(html).toContain('href="/webhooks"')
    expect(html).not.toContain('Unexpected Application Error')
    expect(html).not.toContain('loader failed')
  })
})
