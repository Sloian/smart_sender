import { createHttpClient } from './http-client'

export const httpClient = createHttpClient({ baseUrl: window.location.origin })
