import { Button, Center, Paper, Stack, Text } from '@mantine/core'
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

  return (
    <Center mih="100vh" p="md">
      <PageTitle title="Something went wrong" />
      <Paper withBorder p="xl" w="100%" maw={420}>
        <Stack>
          <PageHeading>Something went wrong</PageHeading>
          <Text>This page could not be shown. Please try again.</Text>
          <Button component={Link} to={DEFAULT_REDIRECT} replace>
            Back to webhooks
          </Button>
        </Stack>
      </Paper>
    </Center>
  )
}
