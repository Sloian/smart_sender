import { Badge } from '@mantine/core'

export function StatusBadge({ active }: { active: boolean }) {
  if (active) {
    return (
      <Badge variant="dot" color="green" tt="none">
        Active
      </Badge>
    )
  }
  return (
    <Badge variant="dot" color="gray.6" tt="none">
      Inactive
    </Badge>
  )
}
