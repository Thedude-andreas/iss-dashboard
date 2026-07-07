import { formatUpdatedAgo } from '../lib/telemetryUtils'

const STATUS_DESCRIPTIONS: Record<string, string> = {
  CONNECTING: 'Connecting',
  CONNECTED: 'Connected',
  STALLED: 'Data stream is lagging',
  DISCONNECTED: 'Disconnected',
}

const statusStyles: Record<'ok' | 'warn' | 'error', string> = {
  ok: 'connection-status--ok',
  warn: 'connection-status--warn',
  error: 'connection-status--error',
}

function normalizeStatus(status: string) {
  if (!status) {
    return { label: 'Unknown status', mode: statusStyles.warn }
  }
  if (status.startsWith('CONNECTED')) {
    return { label: STATUS_DESCRIPTIONS.CONNECTED, mode: statusStyles.ok }
  }
  if (status.startsWith('STALLED')) {
    return { label: STATUS_DESCRIPTIONS.STALLED, mode: statusStyles.warn }
  }
  if (status.startsWith('CONNECTING')) {
    return { label: STATUS_DESCRIPTIONS.CONNECTING, mode: statusStyles.warn }
  }
  return { label: STATUS_DESCRIPTIONS.DISCONNECTED, mode: statusStyles.error }
}

interface Props {
  status: string
  lastUpdated?: number
  error?: string
}

export function ConnectionStatus({ status, lastUpdated, error }: Props) {
  const { label, mode } = normalizeStatus(status)

  return (
    <section className={`connection-status ${mode}`}>
      <div>
        <p className="eyebrow">ISS Live connection</p>
        <h2>{label}</h2>
        <p className="muted">Status code: {status || 'unknown'}</p>
      </div>
      <div className="connection-status__meta">
        <span>Latest data: {formatUpdatedAgo(lastUpdated)}</span>
        {error && <span className="error">{error}</span>}
      </div>
    </section>
  )
}
