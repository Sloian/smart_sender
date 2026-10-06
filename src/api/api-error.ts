import { errorEnvelopeSchema, errorTypes, type ErrorType, type FieldErrors } from './contract'

export type ApiErrorType = ErrorType | 'UnknownError'

export const API_UNAVAILABLE_MESSAGE = 'API is unavailable. Reload the page and try again.'

export const GENERIC_ERROR = 'Something went wrong. Please try again.'

function toErrorType(type: string): ApiErrorType {
  const known = errorTypes.find((candidate) => candidate === type)
  if (known === undefined) return 'UnknownError'
  return known
}

export class ApiError extends Error {
  readonly status: number
  readonly type: ApiErrorType
  readonly fieldErrors: FieldErrors

  constructor(status: number, type: ApiErrorType, message: string, fieldErrors: FieldErrors = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.type = type
    this.fieldErrors = fieldErrors
  }

  static fromBody(status: number, body: unknown, fallbackMessage = `Request failed with status ${status}`): ApiError {
    const parsed = errorEnvelopeSchema.safeParse(body)
    if (!parsed.success) {
      return new ApiError(status, 'UnknownError', fallbackMessage)
    }
    const { type, message, payload } = parsed.data.error
    const knownType = toErrorType(type)
    return new ApiError(status, knownType, message, payload ?? {})
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError
}

export function errorMessage(error: unknown): string {
  if (isApiError(error)) return error.message
  return GENERIC_ERROR
}
