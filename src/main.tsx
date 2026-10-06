import '@mantine/core/styles.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'

async function enableMocking(): Promise<void> {
  const { startMocking } = await import('./mocks/browser')
  await startMocking()
}

async function bootstrap(root: HTMLElement): Promise<void> {
  try {
    await enableMocking()
  } catch (error) {
    console.error(error)
  }
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

const root = document.getElementById('root')
if (!root) throw new Error('Root element not found')

void bootstrap(root)
