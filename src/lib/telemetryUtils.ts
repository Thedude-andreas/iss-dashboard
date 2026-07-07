import type { RangeDefinition, TelemetrySample } from '../types/telemetry'

export type Severity = 'nominal' | 'warning' | 'critical'

export function evaluateRange(
  value: number | undefined,
  range?: RangeDefinition
): Severity | null {
  if (value == null || !range) {
    return null
  }
  const [nominalMin, nominalMax] = range.nominal ?? []
  const [warningMin, warningMax] = range.warning ?? []

  const isInside = (min?: number, max?: number) => {
    if (min != null && value < min) return false
    if (max != null && value > max) return false
    return true
  }

  if (range.warning && !isInside(warningMin, warningMax)) {
    return 'critical'
  }
  if (range.nominal && !isInside(nominalMin, nominalMax)) {
    return 'warning'
  }
  return 'nominal'
}

export function formatUpdatedAgo(timestamp?: number): string {
  if (!timestamp) {
    return 'No updates yet'
  }
  const diffMs = Date.now() - timestamp
  const diffSeconds = Math.max(0, Math.round(diffMs / 1000))
  if (diffSeconds < 5) {
    return 'just now'
  }
  if (diffSeconds < 60) {
    return `${diffSeconds} s ago`
  }
  const diffMinutes = Math.round(diffSeconds / 60)
  if (diffMinutes < 60) {
    return `${diffMinutes} min ago`
  }
  const diffHours = Math.round(diffMinutes / 60)
  return `${diffHours} h ago`
}

export function latestSampleTimestamp(samples: Record<string, TelemetrySample>): number | undefined {
  return Object.values(samples).reduce<number | undefined>((latest, sample) => {
    if (!sample?.timestamp) {
      return latest
    }
    if (latest == null || sample.timestamp > latest) {
      return sample.timestamp
    }
    return latest
  }, undefined)
}
