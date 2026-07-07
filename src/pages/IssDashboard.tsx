import { IssMap } from '../components/IssMap'
import { ConnectionStatus } from '../components/ConnectionStatus'
import { TelemetryCard } from '../components/TelemetryCard'
import { categories, telemetryCards } from '../data/telemetry'
import { useIssTelemetry } from '../hooks/useIssTelemetry'
import { formatUpdatedAgo } from '../lib/telemetryUtils'
import { RestroomHistoryChart } from '../components/RestroomHistoryChart'

export function IssDashboard() {
  const { samples, connectionStatus, lastUpdated, error, lastUrineIncreaseAt, urineHistory } = useIssTelemetry()

  return (
    <div className="iss-page">
      <IssMap />

      <header className="hero">
        <p className="eyebrow">andreasmartensson.com · ISSLive!/Lightstreamer</p>
        <h1>Vibe ISS · Live telemetry</h1>
        <p className="lead">
          A custom dashboard streaming critical International Space Station systems in real time, backed by NASA’s
          public ISSLive! feed via Lightstreamer.
        </p>
        <div className="hero-actions">
          <a
            href="https://www.nasa.gov/international-space-station/"
            target="_blank"
            rel="noreferrer"
            className="button"
          >
            Learn more about the ISS
          </a>
          <span className="tag">Live since {new Date().getFullYear()}</span>
        </div>
      </header>

      <ConnectionStatus status={connectionStatus} lastUpdated={lastUpdated} error={error} />

      {categories.map((category) => {
        const cards = telemetryCards.filter((card) => card.category === category)
        return (
          <section key={category} className="telemetry-section">
            <div className="section-header">
              <p className="eyebrow">Systemgrupp</p>
              <h2>{category}</h2>
            </div>
            <div className="card-grid">
              {cards.map((card) => {
                const extraContent =
                  card.id === 'NODE3000005' ? (
                    <div className="extra-note-stack">
                      <p>
                        Time since last restroom visit:{' '}
                        {lastUrineIncreaseAt
                          ? formatUpdatedAgo(lastUrineIncreaseAt)
                          : 'No increase recorded yet'}
                      </p>
                      <RestroomHistoryChart entries={urineHistory} />
                    </div>
                  ) : undefined
                return (
                  <TelemetryCard
                    key={card.id}
                    config={card}
                    sample={samples[card.id]}
                    extraContent={extraContent}
                  />
                )
              })}
            </div>
          </section>
        )
      })}

      <section className="meta">
        <h3>About the dashboard</h3>
        <p>
          Built with React/Vite and deployed as a static app, the entire experience runs in the browser. Telemetry is
          delivered directly from push.lightstreamer.com, so the UI always reflects the latest public ISS data without
          any custom backend.
        </p>
        <p>
          The layout is responsive and the color coding is driven by nominal ranges per sensor, updating the moment new
          packets arrive.
        </p>
      </section>
    </div>
  )
}
