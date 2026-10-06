import { errorEnvelopeSchema, errorTypes, type ErrorType, type FieldErrors } from './contract'

export type ApiErrorType = ErrorType | 'UnknownError'

export const API_UNAVAILABLE_MESSAGE = 'API is unavailable. Reload the page and try again.'

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
    const knownType = errorTypes.find((candidate) => candidate === type) ?? 'UnknownError'
    return new ApiError(status, knownType, message, payload ?? {})
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError
}
