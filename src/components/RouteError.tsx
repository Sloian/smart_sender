import { Button, Center, Paper, Stack, Text, Title } from '@mantine/core'
import { useEffect } from 'react'
import { Link, useRouteError } from 'react-router'
import { DEFAULT_REDIRECT } from '../auth/redirect'

export function RouteError() {
  const error = useRouteError()

  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <Center mih="100vh">
      <Paper withBorder p="xl" w={420}>
        <Stack>
          <Title order={2}>Something went wrong</Title>
          <Text>This page could not be shown. Please try again.</Text>
          <Button component={Link} to={DEFAULT_REDIRECT} replace>
            Back to webhooks
          </Button>
        </Stack>
      </Paper>
    </Center>
  )
}
