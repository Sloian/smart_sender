import '@mantine/core/styles.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'

async function enableMocking(): Promise<void> {
  const { startMocking } = await import('./mocks/browser')
  await startMocking()
}

const root = document.getElementById('root')
if (!root) throw new Error('Root element not found')

void enableMocking()
  .catch((error: unknown) => {
    console.error(error)
  })
  .finally(() => {
    createRoot(root).render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
  })
