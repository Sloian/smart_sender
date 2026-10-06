import type { FieldValues, Path, UseFormSetError } from 'react-hook-form'
import { isApiError } from '../api/api-error'

export const GENERIC_ERROR = 'Something went wrong. Please try again.'

export function applyServerErrors<T extends FieldValues>(
  error: unknown,
  fields: readonly NoInfer<Path<T>>[],
  setError: UseFormSetError<T>,
): void {
  if (!isApiError(error) || error.type !== 'ValidationException') {
    setError('root.server', { type: 'server', message: isApiError(error) ? error.message : GENERIC_ERROR })
    return
  }
  const unmatched: string[] = []
  for (const [field, messages] of Object.entries(error.fieldErrors)) {
    const message = messages.join(' ')
    const known = fields.find((candidate) => candidate === field)
    if (known) setError(known, { type: 'server', message }, { shouldFocus: true })
    else unmatched.push(message)
  }
  if (unmatched.length > 0 || Object.keys(error.fieldErrors).length === 0) {
    setError('root.server', { type: 'server', message: unmatched.join(' ') || error.message })
  }
}
