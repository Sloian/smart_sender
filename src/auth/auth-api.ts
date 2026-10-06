import { httpClient } from '../api/client'
import {
  CAPTCHA_HEADER,
  loginResponseSchema,
  meSchema,
  type FingerprintRequest,
  type IssueRequest,
  type LoginRequest,
  type Me,
} from '../api/contract'
import { getFingerprint } from './fingerprint'

export const CAPTCHA_TOKEN = 'demo-captcha-token'

export interface Credentials {
  email: string
  password: string
}

export async function login(credentials: Credentials): Promise<string> {
  const body: LoginRequest = { email: credentials.email, password: credentials.password, fingerprint: getFingerprint() }
  const { device_session_token } = await httpClient.request('/auth/login', {
    method: 'POST',
    headers: { [CAPTCHA_HEADER]: CAPTCHA_TOKEN },
    body,
    schema: loginResponseSchema,
  })
  return device_session_token
}

export async function issueSession(deviceSessionToken: string): Promise<void> {
  const body: IssueRequest = { device_session_token: deviceSessionToken, fingerprint: getFingerprint() }
  await httpClient.request('/auth/token/issue', { method: 'POST', body })
}

export async function revokeSession(signal?: AbortSignal): Promise<void> {
  const body: FingerprintRequest = { fingerprint: getFingerprint() }
  await httpClient.request('/auth/token/revoke', { method: 'POST', body, signal })
}

export function fetchMe(): Promise<Me> {
  return httpClient.request('/v1/me', { schema: meSchema })
}
