import { z } from 'zod'

export const CSRF_HEADER = 'X-CSRF-TOKEN'
export const CAPTCHA_HEADER = 'X-Captcha-Token'
export const REQUESTED_WITH_HEADER = 'X-Requested-With'
export const REQUESTED_WITH_VALUE = 'XMLHttpRequest'

export const webhookSchema = z.object({
  id: z.int().positive(),
  name: z.string(),
  url: z.string(),
  active: z.boolean(),
  created_at: z.iso.datetime(),
})

export const webhookListSchema = z.object({
  data: z.array(webhookSchema),
  paging: z.object({
    pages: z.object({
      current: z.int().min(1),
      last: z.int().min(1),
    }),
    results: z.object({
      total: z.int().min(0),
      limitation: z.int().min(1),
    }),
  }),
})

export const meSchema = z.object({
  id: z.int(),
  email: z.email(),
  first_name: z.string(),
  last_name: z.string(),
  name: z.string(),
})

export const loginResponseSchema = z.object({
  device_session_token: z.string().min(1),
})

const fieldErrorsSchema = z.record(z.string(), z.array(z.string()))

export const errorEnvelopeSchema = z.object({
  error: z.object({
    type: z.string(),
    message: z.string(),
    payload: fieldErrorsSchema.optional(),
  }),
})

export const errorTypes = [
  'BadRequestException',
  'AuthenticationException',
  'NotFoundException',
  'TokenMismatchException',
  'ValidationException',
] as const

export type ErrorType = (typeof errorTypes)[number]

export const errorTypeByStatus = {
  400: 'BadRequestException',
  401: 'AuthenticationException',
  404: 'NotFoundException',
  419: 'TokenMismatchException',
  422: 'ValidationException',
} as const satisfies Record<number, ErrorType>

export type Webhook = z.infer<typeof webhookSchema>
export type WebhookList = z.infer<typeof webhookListSchema>
export type Me = z.infer<typeof meSchema>
export type LoginResponse = z.infer<typeof loginResponseSchema>
export type FieldErrors = z.infer<typeof fieldErrorsSchema>
export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>

export interface LoginRequest {
  email: string
  password: string
  fingerprint: string
}

export interface IssueRequest {
  device_session_token: string
  fingerprint: string
}

export interface FingerprintRequest {
  fingerprint: string
}

export interface WebhookUpdateRequest {
  name: string
  url: string
}
