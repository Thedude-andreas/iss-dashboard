export interface TelemetrySample {
  id: string
  timestamp: number
  feedTimestamp: string | null
  rawValue: string | null
  calibratedValue: string | null
  statusClass: string | null
  statusIndicator: string | null
  statusColor: string | null
}

export interface FormattedTelemetryValue {
  primary: string
  secondary?: string
  numericValue?: number
  units?: string
}

export type RangeDefinition = {
  nominal?: [number, number]
  warning?: [number, number]
  unit?: string
}

export interface TelemetryCardConfig {
  id: string
  label: string
  description: string
  category: string
  units?: string
  decimals?: number
  enumMap?: Record<string, string>
  range?: RangeDefinition
  formatSample?: (sample: TelemetrySample | undefined) => FormattedTelemetryValue | null
  detail?: string
  footnote?: string
}
