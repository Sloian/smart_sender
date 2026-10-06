import { errorEnvelopeSchema, errorTypes, type ErrorType, type FieldErrors } from './contract'

export type ApiErrorType = ErrorType | 'UnknownError'

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

  static fromBody(status: number, body: unknown): ApiError {
    const parsed = errorEnvelopeSchema.safeParse(body)
    if (!parsed.success) {
      return new ApiError(status, 'UnknownError', `Request failed with status ${status}`)
    }
    const { type, message, payload } = parsed.data.error
    const knownType = errorTypes.find((candidate) => candidate === type) ?? 'UnknownError'
    return new ApiError(status, knownType, message, payload ?? {})
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError
}
