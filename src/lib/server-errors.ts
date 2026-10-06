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
  const matched = fields.filter((field) => Object.hasOwn(error.fieldErrors, field))
  matched.forEach((field, index) => {
    const message = error.fieldErrors[field]?.join(' ') || error.message
    setError(field, { type: 'server', message }, { shouldFocus: index === 0 })
  })
  const matchedKeys: readonly string[] = matched
  const unmatched = Object.entries(error.fieldErrors)
    .filter(([field]) => !matchedKeys.includes(field))
    .map(([, messages]) => messages.join(' '))
    .filter(Boolean)
  if (unmatched.length > 0 || matched.length === 0) {
    setError('root.server', { type: 'server', message: unmatched.join(' ') || error.message })
  }
}
