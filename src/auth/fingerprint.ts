export const FINGERPRINT_STORAGE_KEY = 'smart-sender.fingerprint'
const FINGERPRINT_PATTERN = /^[0-9a-f]{32}$/

export type FingerprintStorage = Pick<Storage, 'getItem' | 'setItem'>

export function generateFingerprint(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function readStored(storage: FingerprintStorage): string | null {
  const stored = storage.getItem(FINGERPRINT_STORAGE_KEY)
  if (stored === null) return null
  if (!FINGERPRINT_PATTERN.test(stored)) return null
  return stored
}

function loadOrCreate(getStorage: () => FingerprintStorage | undefined): string {
  try {
    const storage = getStorage()
    if (!storage) return generateFingerprint()
    const stored = readStored(storage)
    if (stored) return stored
    const created = generateFingerprint()
    storage.setItem(FINGERPRINT_STORAGE_KEY, created)
    return created
  } catch {
    return generateFingerprint()
  }
}

export function createFingerprintProvider(getStorage: () => FingerprintStorage | undefined): () => string {
  let fingerprint: string | undefined
  return () => {
    if (fingerprint === undefined) {
      fingerprint = loadOrCreate(getStorage)
    }
    return fingerprint
  }
}

export const getFingerprint = createFingerprintProvider(() => globalThis.localStorage)
