import type { ReactNode } from 'react'
import type { TelemetryCardConfig, TelemetrySample } from '../types/telemetry'
import { evaluateRange, formatUpdatedAgo } from '../lib/telemetryUtils'
import type { Severity } from '../lib/telemetryUtils'

interface TelemetryCardProps {
  config: TelemetryCardConfig
  sample?: TelemetrySample
  extraContent?: ReactNode
}

const severityClass: Record<Severity, string> = {
  nominal: 'telemetry-card--nominal',
  warning: 'telemetry-card--warning',
  critical: 'telemetry-card--critical',
}

export function TelemetryCard({ config, sample, extraContent }: TelemetryCardProps) {
  const formatter = config.formatSample ?? (() => null)
  const formatted = formatter(sample)
  const severity = evaluateRange(formatted?.numericValue, config.range ?? undefined)
  const cardClass = ['telemetry-card']
  if (severity) {
    cardClass.push(severityClass[severity])
  }

  return (
    <article className={cardClass.join(' ')}>
      <div className="telemetry-card__value">
        <p className="value-primary">{formatted?.primary ?? 'Waiting for data'}</p>
        {formatted?.secondary && (
          <p className="value-secondary">{formatted.secondary}</p>
        )}
      </div>
      <div className="telemetry-card__body">
        <h3>{config.label}</h3>
        <p className="description">{config.description}</p>
      </div>
      <div className="telemetry-card__meta">
        <span>Updated: {formatUpdatedAgo(sample?.timestamp)}</span>
        {config.detail && <span>{config.detail}</span>}
      </div>
      {extraContent && <div className="telemetry-card__extra">{extraContent}</div>}
      {config.footnote && <p className="footnote">{config.footnote}</p>}
    </article>
  )
}
