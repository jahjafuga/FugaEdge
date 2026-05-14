import { describe, it, expect } from 'vitest'
import { flagEmoji } from '../flag'

describe('flagEmoji', () => {
  it('returns 🇺🇸 for US', () => {
    expect(flagEmoji('US')).toBe('🇺🇸')
  })
  it('returns 🇨🇳 for CN (case-insensitive)', () => {
    expect(flagEmoji('cn')).toBe('🇨🇳')
  })
  it('returns empty string for null/undefined/empty/invalid', () => {
    expect(flagEmoji(null)).toBe('')
    expect(flagEmoji(undefined)).toBe('')
    expect(flagEmoji('')).toBe('')
    expect(flagEmoji('USA')).toBe('')
    expect(flagEmoji('U1')).toBe('')
  })
})
