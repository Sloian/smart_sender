import { Button, Center, Group, Paper, Stack, Text } from '@mantine/core'
import { useEffect } from 'react'
import { Link, useRouteError } from 'react-router'
import { DEFAULT_REDIRECT } from '../auth/redirect'
import { PageHeading } from './PageHeading'
import { PageTitle } from './PageTitle'

export function RouteError() {
  const error = useRouteError()

  useEffect(() => {
    console.error(error)
  }, [error])

  function reload() {
    window.location.reload()
  }

  return (
    <Center mih="100vh" p="md">
      <PageTitle title="Something went wrong" />
      <Paper withBorder p="xl" w="100%" maw={420}>
        <Stack>
          <PageHeading>Something went wrong</PageHeading>
          <Text>This page couldn't load.</Text>
          <Group>
            <Button onClick={reload}>Reload</Button>
            <Button component={Link} to={DEFAULT_REDIRECT} replace variant="default">
              Back to webhooks
            </Button>
          </Group>
        </Stack>
      </Paper>
    </Center>
  )
}
