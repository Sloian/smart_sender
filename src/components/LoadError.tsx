import { Alert, Button, Stack, Text } from '@mantine/core'

interface LoadErrorProps {
  title: string
  message: string
  retrying: boolean
  onRetry: () => void
}

export function LoadError({ title, message, retrying, onRetry }: LoadErrorProps) {
  return (
    <Alert color="red" title={title}>
      <Stack align="flex-start">
        <Text size="sm">{message}</Text>
        <Button variant="light" color="red" loading={retrying} onClick={onRetry}>
          Retry
        </Button>
      </Stack>
    </Alert>
  )
}
