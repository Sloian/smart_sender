import type { UseFormSetError } from 'react-hook-form'
import { describe, expect, test, vi } from 'vitest'
import { ApiError, GENERIC_ERROR } from '../api/api-error'
import { applyServerErrors } from './server-errors'

interface Values {
  email: string
  password: string
}

const FIELDS = ['email', 'password'] as const

const validationError = (payload: Record<string, string[]>) =>
  ApiError.fromBody(422, { error: { type: 'ValidationException', message: 'The given data was invalid.', payload } })

function apply(error: unknown) {
  const setError = vi.fn<UseFormSetError<Values>>()
  applyServerErrors<Values>(error, FIELDS, setError)
  return setError
}

describe('applyServerErrors', () => {
  test('a 422 field message goes to that field with focus', () => {
    const setError = apply(validationError({ password: ['These credentials do not match our records.'] }))

    expect(setError).toHaveBeenCalledTimes(1)
    expect(setError).toHaveBeenCalledWith(
      'password',
      { type: 'server', message: 'These credentials do not match our records.' },
      { shouldFocus: true },
    )
  })

  test('a 422 key that is not a field goes to the root error', () => {
    const setError = apply(validationError({ captcha: ['The captcha token is required.'] }))

    expect(setError).toHaveBeenCalledTimes(1)
    expect(setError).toHaveBeenCalledWith('root.server', { type: 'server', message: 'The captcha token is required.' })
  })

  test('field and non-field keys are split between the field and the root error', () => {
    const setError = apply(validationError({ password: ['A'], fingerprint: ['The fingerprint is invalid.'] }))

    expect(setError).toHaveBeenCalledTimes(2)
    expect(setError).toHaveBeenCalledWith('password', { type: 'server', message: 'A' }, { shouldFocus: true })
    expect(setError).toHaveBeenCalledWith('root.server', { type: 'server', message: 'The fingerprint is invalid.' })
  })

  test('several messages for one field are joined', () => {
    const setError = apply(validationError({ password: ['First.', 'Second.'] }))

    expect(setError).toHaveBeenCalledTimes(1)
    expect(setError).toHaveBeenCalledWith('password', { type: 'server', message: 'First. Second.' }, { shouldFocus: true })
  })

  test('only the first form field with an error gets focus', () => {
    const setError = apply(validationError({ password: ['B'], email: ['A'] }))

    expect(setError).toHaveBeenCalledTimes(2)
    expect(setError).toHaveBeenNthCalledWith(1, 'email', { type: 'server', message: 'A' }, { shouldFocus: true })
    expect(setError).toHaveBeenNthCalledWith(2, 'password', { type: 'server', message: 'B' }, { shouldFocus: false })
  })

  test('a field with no messages shows the envelope message', () => {
    const setError = apply(validationError({ email: [] }))

    expect(setError).toHaveBeenCalledTimes(1)
    expect(setError).toHaveBeenCalledWith(
      'email',
      { type: 'server', message: 'The given data was invalid.' },
      { shouldFocus: true },
    )
  })

  test('a 422 with an empty payload shows the envelope message', () => {
    const setError = apply(validationError({}))

    expect(setError).toHaveBeenCalledTimes(1)
    expect(setError).toHaveBeenCalledWith('root.server', { type: 'server', message: 'The given data was invalid.' })
  })

  test('a non-422 api error shows its message', () => {
    const error = ApiError.fromBody(401, { error: { type: 'AuthenticationException', message: 'Unauthenticated.' } })
    const setError = apply(error)

    expect(setError).toHaveBeenCalledTimes(1)
    expect(setError).toHaveBeenCalledWith('root.server', { type: 'server', message: 'Unauthenticated.' })
  })

  test('a network failure shows the generic message', () => {
    const setError = apply(new TypeError('Failed to fetch'))

    expect(GENERIC_ERROR).toBe('Something went wrong. Please try again.')
    expect(setError).toHaveBeenCalledTimes(1)
    expect(setError).toHaveBeenCalledWith('root.server', { type: 'server', message: GENERIC_ERROR })
  })
})
