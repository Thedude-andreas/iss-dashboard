import type { FormattedTelemetryValue, TelemetryCardConfig, TelemetrySample } from '../types/telemetry'
import {
  defaultNumericFormatter,
  formatAtmosphericPressure,
  formatMissionTime,
  formatPartialPressure,
  formatPercentage,
  formatSignedValue,
  formatNumber,
  getNumericValue,
} from '../lib/formatters'

const OGA_STATE_MAP: Record<string, string> = {
  PROCESS: 'Generating O₂',
  STANDBY: 'Standby',
  SHUTDOWN: 'Shutdown',
  STOP: 'Stopped',
  VENT_DOME: 'Venting dome',
  INERT_DOME: 'Inerting dome',
  FAST_SHUTDOWN: 'Fast shutdown',
  N2_PURGE_SHUTDOWN: 'N₂ purge shutdown',
}

function formatOgaState(sample?: TelemetrySample): FormattedTelemetryValue | null {
  const raw = sample?.calibratedValue ?? sample?.rawValue
  if (!raw) {
    return null
  }
  const normalized = raw.trim().toUpperCase()
  return {
    primary: OGA_STATE_MAP[normalized] ?? raw,
    secondary: normalized !== raw ? normalized : undefined,
  }
}

function formatSolarJoint(sample?: TelemetrySample): FormattedTelemetryValue | null {
  const numericValue = getNumericValue(sample)
  if (numericValue == null) {
    return null
  }
  return {
    primary: `${formatNumber(numericValue, 2)}°`,
    numericValue,
    units: '°',
  }
}

const PSI_RANGE: [number, number] = [13.8, 15.5]
const PSI_WARNING: [number, number] = [12, 16.5]

export const telemetryCards: TelemetryCardConfig[] = [
  {
    id: 'TIME_000001',
    label: 'Orbit time / GMT',
    description: 'Greenwich Mean Time drives planning, logs and coordination across ISS.',
    category: 'Mission Ops',
    formatSample: formatMissionTime,
    detail: 'Source: NASA ISSLive! via Lightstreamer',
  },
  {
    id: 'S0000005',
    label: 'SARJ port angle',
    description: 'The Solar Alpha Rotary Joint steers the arrays to maximize solar input.',
    category: 'Mission Ops',
    formatSample: formatSolarJoint,
    detail: 'Slow motion proves ISS is constantly trimming its sun-tracking.',
  },
  {
    id: 'USLAB000058',
    label: 'Cabin pressure (Destiny)',
    description: 'Primary pressure in the Destiny lab where the crew spends most of the workday.',
    category: 'Life support',
    formatSample: formatAtmosphericPressure,
    range: { nominal: PSI_RANGE, warning: PSI_WARNING, unit: 'psi' },
    footnote: 'Conversion assumes telemetry arrives in mmHg.',
  },
  {
    id: 'USLAB000053',
    label: 'Lab ppO₂',
    description: 'Oxygen partial pressure inside the lab — shorthand for breathable air.',
    category: 'Life support',
    formatSample: (sample) => formatPartialPressure(sample, 1),
    range: { nominal: [130, 180], warning: [110, 200], unit: 'mmHg' },
  },
  {
    id: 'USLAB000055',
    label: 'Lab ppCO₂',
    description: 'CO₂ level in Destiny after filtering through the MCA system.',
    category: 'Life support',
    formatSample: (sample) => formatPartialPressure(sample, 2),
    range: { nominal: [0, 5], warning: [0, 6], unit: 'mmHg' },
  },
  {
    id: 'NODE3000003',
    label: 'Node 3 ppCO₂',
    description: 'CO₂ levels near the environmental control racks in Node 3.',
    category: 'Life support',
    formatSample: (sample) => formatPartialPressure(sample, 2),
    range: { nominal: [0, 5], warning: [0, 6], unit: 'mmHg' },
  },
  {
    id: 'NODE3000010',
    label: 'Oxygen Generator State',
    description: 'Shows the current phase of the Oxygen Generator Assembly.',
    category: 'Life support',
    formatSample: formatOgaState,
  },
  {
    id: 'NODE3000011',
    label: 'O₂ production',
    description: 'Mass flow from the OGA expressed in pounds per day.',
    category: 'Life support',
    formatSample: (sample) => formatSignedValue(sample, 2, 'lbm/d'),
    detail: 'Negative readings imply no net production at this instant.',
  },
  {
    id: 'NODE3000005',
    label: 'Urine tank level',
    description: 'Fill level for the Node 3 condensate / urine tank.',
    category: 'Water & resources',
    formatSample: (sample) => formatPercentage(sample, 1),
    range: { nominal: [0, 75], warning: [0, 90], unit: '%' },
  },
  {
    id: 'NODE3000008',
    label: 'Waste water tank',
    description: 'Waste Water Storage Tank feeding the purification loops.',
    category: 'Water & resources',
    formatSample: (sample) => formatPercentage(sample, 1),
  },
  {
    id: 'NODE3000009',
    label: 'Potable water',
    description: 'Available processed water downstream of the WPA.',
    category: 'Water & resources',
    formatSample: (sample) => formatPercentage(sample, 1),
  },
  {
    id: 'P1000003',
    label: 'ETCS Loop B temp',
    description: 'Outlet temperature on Loop B of the external thermal control system.',
    category: 'Thermal & power',
    formatSample: (sample) => defaultNumericFormatter(sample, 1, '°C'),
    range: { nominal: [-10, 45], warning: [-20, 55], unit: '°C' },
  },
]

export const categories = ['Mission Ops', 'Life support', 'Water & resources', 'Thermal & power']
