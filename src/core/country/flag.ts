// Returns the unicode flag for a 2-letter ISO 3166-1 alpha-2 code.
// Uses regional-indicator-symbol math: each letter maps to U+1F1E6..U+1F1FF
// (A..Z), and two of those code points in sequence render as a flag in
// any modern OS / font / emoji library.

export function flagEmoji(iso: string | null | undefined): string {
  if (!iso) return ''
  const code = iso.toUpperCase()
  if (!/^[A-Z]{2}$/.test(code)) return ''
  const base = 0x1f1e6
  const a = base + (code.charCodeAt(0) - 65)
  const b = base + (code.charCodeAt(1) - 65)
  return String.fromCodePoint(a, b)
}
