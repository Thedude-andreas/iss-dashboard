import { MapContainer, TileLayer, CircleMarker, Tooltip, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { useIssPosition } from '../hooks/useIssPosition'
import { formatNumber } from '../lib/formatters'
import { useEffect } from 'react'

const LULEA_COORDS: [number, number] = [65.584819, 22.156702]

function MapUpdater({ coords }: { coords?: [number, number] }) {
  const map = useMap()
  useEffect(() => {
    if (coords) {
      map.setView(coords, map.getZoom(), { animate: true })
    }
  }, [coords, map])
  return null
}

export function IssMap() {
  const positionState = useIssPosition()
  const hasPosition = positionState.timestamp !== 0 && !positionState.loading
  const markerCoords: [number, number] | undefined = hasPosition
    ? [positionState.latitude, positionState.longitude]
    : undefined
  const formatNavValue = (
    value: number | null,
    unit: string,
    source: 'api' | 'derived' | 'unknown',
    decimals = 1,
    showDerivedTag = true
  ) => {
    if (value == null || Number.isNaN(value)) {
      return '—'
    }
    const suffix = showDerivedTag && source === 'derived' ? ' · est.' : ''
    return `${formatNumber(value, decimals)} ${unit}${suffix}`
  }

  return (
    <section className="iss-map">
      <div className="map-header">
        <p className="eyebrow">Live position</p>
        <h2>International Space Station</h2>
        {hasPosition ? (
          <p className="distance">
            Distance to Luleå: {formatNumber(positionState.distanceFromLuleaKm, 0)} km
          </p>
        ) : (
          <p className="distance">Fetching orbital data…</p>
        )}
        {positionState.error && <p className="error-text">{positionState.error}</p>}
      </div>
      <div className="map-nav">
        <div className="map-nav__item">
          <span className="map-nav__label">Altitude</span>
          <span className="map-nav__value">
            {formatNavValue(positionState.altitude, 'km', positionState.altitudeSource, 1)}
          </span>
        </div>
        <div className="map-nav__item">
          <span className="map-nav__label">Derived track</span>
          <span className="map-nav__value">
            {formatNavValue(positionState.heading, '°', positionState.headingSource, 0, false)}
          </span>
        </div>
        <div className="map-nav__item">
          <span className="map-nav__label">Groundspeed</span>
          <span className="map-nav__value">
            {formatNavValue(positionState.groundspeed, 'km/h', positionState.groundspeedSource, 0)}
          </span>
        </div>
      </div>
      <div className="map-wrapper">
        {markerCoords ? (
          <MapContainer center={markerCoords} zoom={3} scrollWheelZoom={false}>
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <MapUpdater coords={markerCoords} />
            <CircleMarker center={markerCoords} radius={10} pathOptions={{ color: '#f97316', weight: 2 }}>
              <Tooltip direction="top" offset={[0, -10]} permanent>
                Lat {positionState.latitude.toFixed(2)}° · Lon {positionState.longitude.toFixed(2)}°
              </Tooltip>
            </CircleMarker>
            <CircleMarker center={LULEA_COORDS} radius={6} pathOptions={{ color: '#60a5fa', weight: 2 }}>
              <Tooltip direction="right" offset={[10, 0]} permanent>
                Luleå
              </Tooltip>
            </CircleMarker>
          </MapContainer>
        ) : (
          <div className="map-placeholder">Waiting for telemetry…</div>
        )}
      </div>
    </section>
  )
}
