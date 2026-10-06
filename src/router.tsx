import { Container, Title } from '@mantine/core'
import { createBrowserRouter } from 'react-router'

export const router = createBrowserRouter([
  {
    path: '/',
    element: (
      <Container py="xl">
        <Title order={1}>Smart Sender — Webhooks</Title>
      </Container>
    ),
  },
])
