import { describe, expect, it } from 'vitest'
import { describeUsage, formatBytes, isStorageFull } from './storage'

const MB = 1024 * 1024

describe('account storage', () => {
  it('spots the server refusing a write for space, however the error arrives', () => {
    expect(isStorageFull(new Error('storage_full'))).toBe(true)
    expect(isStorageFull({ message: 'storage_full', code: 'P0001' })).toBe(true)
    expect(isStorageFull(new Error('Failed to fetch'))).toBe(false)
    expect(isStorageFull(null)).toBe(false)
  })

  it('formats sizes the way people read them', () => {
    expect(formatBytes(300)).toBe('1 KB')
    expect(formatBytes(250 * 1024)).toBe('250 KB')
    expect(formatBytes(4.25 * MB)).toBe('4.3 MB')
    expect(formatBytes(20 * MB)).toBe('20 MB')
  })

  it('says how full the account is', () => {
    expect(describeUsage({ used: 5 * MB, cap: 20 * MB })).toEqual({ label: '5 MB of 20 MB', pct: 25, level: 'ok' })
    expect(describeUsage({ used: 18.5 * MB, cap: 20 * MB }).level).toBe('near')
    expect(describeUsage({ used: 20 * MB, cap: 20 * MB })).toMatchObject({ pct: 100, level: 'full' })
    expect(describeUsage({ used: 21 * MB, cap: 20 * MB }).pct).toBe(100)
  })

  it('shows no limit for an account without a cap', () => {
    expect(describeUsage({ used: 64 * MB, cap: null })).toEqual({ label: '64 MB used · no limit', pct: null, level: 'ok' })
  })
})
