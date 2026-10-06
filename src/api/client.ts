import { getFingerprint } from '../auth/fingerprint'
import { createHttpClient } from './http-client'

export const httpClient = createHttpClient({ baseUrl: window.location.origin })
httpClient.setFingerprintProvider(getFingerprint)
