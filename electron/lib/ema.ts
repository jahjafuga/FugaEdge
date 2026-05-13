// Standard exponential moving average. Seeds with an SMA of the first
// `period` values, then iterates: EMA_t = α·v + (1-α)·EMA_{t-1} where
// α = 2 / (period + 1).
// Returns an array of nullable EMAs aligned to `values` — null until enough
// data has been seen to seed the SMA.
export function ema(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null)
  if (period <= 0 || values.length < period) return out

  let sum = 0
  for (let i = 0; i < period; i++) sum += values[i]
  let prev = sum / period
  out[period - 1] = prev

  const alpha = 2 / (period + 1)
  for (let i = period; i < values.length; i++) {
    prev = values[i] * alpha + prev * (1 - alpha)
    out[i] = prev
  }
  return out
}
