import type { FormattedTelemetryValue, TelemetrySample } from '../types/telemetry'

const MMHG_PER_PSI = 51.7149
const KPA_PER_MMHG = 0.133322

export const converters = {
  mmhgToPsi: (value: number) => value / MMHG_PER_PSI,
  mmhgToKpa: (value: number) => value * KPA_PER_MMHG,
}

export function getNumericValue(sample?: TelemetrySample): number | null {
  if (!sample) {
    return null
  }
  const raw = sample.calibratedValue ?? sample.rawValue
  if (raw == null) {
    return null
  }
  const normalized = raw.toString().trim()
  if (!normalized) {
    return null
  }
  const numeric = Number(normalized)
  return Number.isFinite(numeric) ? numeric : null
}

export function formatNumber(value: number, decimals = 1): string {
  return new Intl.NumberFormat('sv-SE', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value)
}

export function defaultNumericFormatter(
  sample: TelemetrySample | undefined,
  decimals = 1,
  units?: string
): FormattedTelemetryValue | null {
  const numericValue = getNumericValue(sample)
  if (numericValue == null) {
    const fallback = sample?.calibratedValue ?? sample?.rawValue
    if (!fallback) {
      return null
    }
    return { primary: fallback }
  }
  return {
    primary: `${formatNumber(numericValue, decimals)}${units ? `\u00a0${units}` : ''}`,
    numericValue,
    units,
  }
}

export function formatMissionTime(sample?: TelemetrySample): FormattedTelemetryValue | null {
  const value = sample?.calibratedValue ?? sample?.rawValue
  if (!value) {
    return null
  }
  const [daysRaw, clockRaw] = value.split('/')
  const dayNumber = Number(daysRaw)
  const dayLabel = Number.isFinite(dayNumber)
    ? `Day ${dayNumber.toString().padStart(2, '0')}`
    : `Day ${daysRaw}`
  const clockLabel = clockRaw?.trim() ? `${clockRaw.trim()} GMT` : 'GMT'
  return {
    primary: `${dayLabel} · ${clockLabel}`,
    secondary: 'Greenwich Mean Time from ISSLive!',
  }
}

export function formatAtmosphericPressure(
  sample?: TelemetrySample,
  decimals = 2
): FormattedTelemetryValue | null {
  const mmhg = getNumericValue(sample)
  if (mmhg == null) {
    return null
  }
  const psi = converters.mmhgToPsi(mmhg)
  const kpa = converters.mmhgToKpa(mmhg)
  return {
    primary: `${formatNumber(psi, decimals)}\u00a0psi`,
    secondary: `${formatNumber(mmhg, 1)} mmHg · ${formatNumber(kpa, 1)} kPa`,
    numericValue: psi,
    units: 'psi',
  }
}

export function formatPartialPressure(
  sample?: TelemetrySample,
  decimals = 2,
  unitLabel = 'mmHg'
): FormattedTelemetryValue | null {
  const mmhg = getNumericValue(sample)
  if (mmhg == null) {
    return null
  }
  const kpa = converters.mmhgToKpa(mmhg)
  return {
    primary: `${formatNumber(mmhg, decimals)}\u00a0${unitLabel}`,
    secondary: `${formatNumber(kpa, 2)} kPa`,
    numericValue: mmhg,
    units: unitLabel,
  }
}

export function formatPercentage(
  sample?: TelemetrySample,
  decimals = 1
): FormattedTelemetryValue | null {
  const numericValue = getNumericValue(sample)
  if (numericValue == null) {
    return null
  }
  return {
    primary: `${formatNumber(numericValue, decimals)}%`,
    numericValue,
    units: '%',
  }
}

export function formatSignedValue(
  sample?: TelemetrySample,
  decimals = 2,
  units?: string
): FormattedTelemetryValue | null {
  const numericValue = getNumericValue(sample)
  if (numericValue == null) {
    return null
  }
  const formatted = formatNumber(numericValue, decimals)
  return {
    primary: `${formatted}${units ? `\u00a0${units}` : ''}`,
    numericValue,
    units,
  }
}
