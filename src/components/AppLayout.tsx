import { AppShell, Button, Group, Text, Title } from '@mantine/core'
import { useState } from 'react'
import { Outlet, useLoaderData, useNavigate } from 'react-router'
import { signOut } from '../auth/auth-service'
import type { requireUser } from '../auth/route-guards'

export function AppLayout() {
  const user = useLoaderData<typeof requireUser>()
  const navigate = useNavigate()
  const [signingOut, setSigningOut] = useState(false)

  async function handleSignOut() {
    setSigningOut(true)
    try {
      await signOut(async (to) => {
        await navigate(to, { replace: true })
      })
    } finally {
      setSigningOut(false)
    }
  }

  return (
    <AppShell header={{ height: 60 }} padding="md">
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Title order={4}>Smart Sender</Title>
          <Group>
            <Text size="sm">
              {user.name} · {user.email}
            </Text>
            <Button variant="default" size="xs" loading={signingOut} onClick={() => void handleSignOut()}>
              Log out
            </Button>
          </Group>
        </Group>
      </AppShell.Header>
      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  )
}
