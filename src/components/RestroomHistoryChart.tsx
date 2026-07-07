import { useEffect, useState } from 'react'
import type { RestroomHistoryEntry } from '../types/restroom'

interface RestroomHistoryChartProps {
  entries: RestroomHistoryEntry[]
}

const WINDOW_MS = 24 * 60 * 60 * 1000
const COMPACT_BAR_HEIGHT = 80
const EXPANDED_BAR_HEIGHT = 170
const AXIS_BOTTOM = 28
const SECOND_TO_MS_THRESHOLD = 1_000_000_000_000

export function RestroomHistoryChart({ entries }: RestroomHistoryChartProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const maxDelta = Math.max(...entries.map((entry) => entry.delta), 1)
  const now = Date.now()
  const barHeight = isExpanded ? EXPANDED_BAR_HEIGHT : COMPACT_BAR_HEIGHT
  const maxTick = Math.max(1, Math.ceil(maxDelta))
  const tickStep = maxTick > 20 ? 5 : maxTick > 12 ? 2 : 1
  const yAxisTicks = Array.from(
    { length: Math.floor(maxTick / tickStep) + 1 },
    (_, index) => index * tickStep
  )

  useEffect(() => {
    if (!isExpanded) return
    document.body.classList.add('restroom-chart--fullscreen')
    return () => {
      document.body.classList.remove('restroom-chart--fullscreen')
    }
  }, [isExpanded])

  return (
    <>
      <button
        type="button"
        className={`restroom-chart${isExpanded ? ' restroom-chart--expanded' : ''}`}
        aria-label="Urine tank increases last 24 hours"
        aria-expanded={isExpanded}
        onClick={() => setIsExpanded((prev) => !prev)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setIsExpanded(false)
          }
        }}
      >
        {isExpanded && (
          <span className="restroom-chart__close" aria-hidden="true">
            ×
          </span>
        )}
        <div className="restroom-chart__track" />
        {isExpanded && (
          <>
            <div className="restroom-chart__axis restroom-chart__axis--y" aria-hidden="true" />
            <div className="restroom-chart__axis restroom-chart__axis--x" aria-hidden="true" />
            <div className="restroom-chart__x-label restroom-chart__x-label--now">0h</div>
            <div className="restroom-chart__x-label restroom-chart__x-label--mid">-12h</div>
            <div className="restroom-chart__x-label restroom-chart__x-label--day">-24h</div>
            {yAxisTicks.map((tick) => (
              <div
                key={tick}
                className="restroom-chart__y-label"
                style={{ bottom: `${AXIS_BOTTOM + (tick / maxTick) * barHeight}px` }}
              >
                {tick}%
              </div>
            ))}
          </>
        )}
        {entries.map((entry) => {
          const timestamp =
            entry.timestamp < SECOND_TO_MS_THRESHOLD ? entry.timestamp * 1000 : entry.timestamp
          const age = Math.max(0, now - timestamp)
          const position = Math.min(0.999, age / WINDOW_MS)
          const height = Math.max(3, Math.round((entry.delta / maxDelta) * barHeight))
          return (
            <span
              key={entry.timestamp}
              className="restroom-chart__bar"
              style={{
                height,
                right: `${position * 100}%`,
              }}
              aria-hidden="true"
            />
          )
        })}
      </button>
      {!entries.length && <p className="extra-note">No urine tank increases logged past 24 h.</p>}
    </>
  )
}
