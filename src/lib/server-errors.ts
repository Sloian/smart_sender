import type { FieldValues, Path, UseFormSetError } from 'react-hook-form'
import { errorMessage, isApiError } from '../api/api-error'

function joinMessages(messages: readonly string[] | undefined, fallback: string): string {
  if (messages === undefined) return fallback
  const joined = messages.join(' ')
  if (joined === '') return fallback
  return joined
}

export function applyServerErrors<T extends FieldValues>(
  error: unknown,
  fields: readonly NoInfer<Path<T>>[],
  setError: UseFormSetError<T>,
): void {
  if (!isApiError(error) || error.type !== 'ValidationException') {
    setError('root.server', { type: 'server', message: errorMessage(error) })
    return
  }
  const matched = fields.filter((field) => Object.hasOwn(error.fieldErrors, field))
  matched.forEach((field, index) => {
    const message = joinMessages(error.fieldErrors[field], error.message)
    setError(field, { type: 'server', message }, { shouldFocus: index === 0 })
  })
  const matchedKeys: readonly string[] = matched
  const unmatched = Object.entries(error.fieldErrors)
    .filter(([field]) => !matchedKeys.includes(field))
    .map(([, messages]) => messages.join(' '))
    .filter((message) => message !== '')
  const needsRootMessage = unmatched.length > 0 || matched.length === 0
  if (needsRootMessage) {
    setError('root.server', { type: 'server', message: joinMessages(unmatched, error.message) })
  }
}
