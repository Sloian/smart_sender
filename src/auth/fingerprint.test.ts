import { describe, expect, test } from 'vitest'
import {
  FINGERPRINT_STORAGE_KEY,
  createFingerprintProvider,
  generateFingerprint,
  type FingerprintStorage,
} from './fingerprint'

const HEX_32 = /^[0-9a-f]{32}$/

function memoryStorage(initial: Record<string, string> = {}): FingerprintStorage & { values: Map<string, string> } {
  const values = new Map(Object.entries(initial))
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value)
    },
  }
}

describe('fingerprint', () => {
  test('generates 32 lowercase hex characters that differ between calls', () => {
    const first = generateFingerprint()
    const second = generateFingerprint()
    expect(first).toMatch(HEX_32)
    expect(second).toMatch(HEX_32)
    expect(first).not.toBe(second)
  })

  test('persists the value in storage and returns the same value on every call', () => {
    const storage = memoryStorage()
    const provider = createFingerprintProvider(() => storage)
    const value = provider()
    expect(FINGERPRINT_STORAGE_KEY).toBe('smart-sender.fingerprint')
    expect(value).toMatch(HEX_32)
    expect(storage.values.get(FINGERPRINT_STORAGE_KEY)).toBe(value)
    expect(provider()).toBe(value)
    expect(provider()).toBe(value)
  })

  test('reuses the stored value after a reload', () => {
    const storage = memoryStorage()
    const value = createFingerprintProvider(() => storage)()
    expect(createFingerprintProvider(() => storage)()).toBe(value)
  })

  test.each([
    ['a non-hex value', 'XYZ'],
    ['a 31-character value', 'a'.repeat(31)],
    ['an uppercase value', 'A'.repeat(32)],
  ])('replaces %s in storage with a fresh valid value', (_, stored) => {
    const storage = memoryStorage({ [FINGERPRINT_STORAGE_KEY]: stored })
    const value = createFingerprintProvider(() => storage)()
    expect(value).toMatch(HEX_32)
    expect(value).not.toBe(stored)
    expect(storage.values.get(FINGERPRINT_STORAGE_KEY)).toBe(value)
  })

  test('a storage that throws still yields one stable value', () => {
    const storage: FingerprintStorage = {
      getItem: () => {
        throw new Error('storage is blocked')
      },
      setItem: () => {
        throw new Error('storage is blocked')
      },
    }
    const provider = createFingerprintProvider(() => storage)
    const value = provider()
    expect(value).toMatch(HEX_32)
    expect(provider()).toBe(value)
  })

  test('a missing storage still yields one stable value', () => {
    const provider = createFingerprintProvider(() => undefined)
    const value = provider()
    expect(value).toMatch(HEX_32)
    expect(provider()).toBe(value)
  })
})
