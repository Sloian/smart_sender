import { Loader, Stack, Text } from '@mantine/core'

export function LoadingState({ label }: { label: string }) {
  return (
    <Stack role="status" align="center" py="xl">
      <Loader />
      <Text>{label}</Text>
    </Stack>
  )
}
