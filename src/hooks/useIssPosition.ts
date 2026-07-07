import { useEffect, useRef, useState } from 'react'

const API_URL = 'https://api.wheretheiss.at/v1/satellites/25544'
const LULEA_COORDS = { lat: 65.584819, lon: 22.156702 }

export interface IssPositionState {
  latitude: number
  longitude: number
  altitude: number | null
  heading: number | null
  groundspeed: number | null
  altitudeSource: 'api' | 'derived' | 'unknown'
  headingSource: 'api' | 'derived' | 'unknown'
  groundspeedSource: 'api' | 'derived' | 'unknown'
  timestamp: number
  distanceFromLuleaKm: number
  loading: boolean
  error?: string
}

function haversineDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

function bearingDegrees(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const toDeg = (rad: number) => (rad * 180) / Math.PI
  const dLon = toRad(lon2 - lon1)
  const phi1 = toRad(lat1)
  const phi2 = toRad(lat2)
  const y = Math.sin(dLon) * Math.cos(phi2)
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLon)
  const bearing = toDeg(Math.atan2(y, x))
  return (bearing + 360) % 360
}

const initialState: IssPositionState = {
  latitude: 0,
  longitude: 0,
  altitude: null,
  heading: null,
  groundspeed: null,
  altitudeSource: 'unknown',
  headingSource: 'unknown',
  groundspeedSource: 'unknown',
  timestamp: 0,
  distanceFromLuleaKm: 0,
  loading: true,
}

export function useIssPosition(pollIntervalMs = 15000) {
  const [state, setState] = useState<IssPositionState>(initialState)
  const lastSampleRef = useRef<{
    latitude: number
    longitude: number
    timestamp: number
  } | null>(null)

  useEffect(() => {
    let timer: number | undefined
    let cancelled = false

    async function fetchPosition() {
      try {
        const response = await fetch(API_URL)
        if (!response.ok) {
          throw new Error(`Could not fetch ISS position (${response.status})`)
        }
        const data = await response.json()
        if (cancelled) return
        if (typeof data.latitude !== 'number' || typeof data.longitude !== 'number') {
          throw new Error('ISS position data missing coordinates')
        }
        const timestamp = typeof data.timestamp === 'number' ? data.timestamp * 1000 : Date.now()
        const distanceFromLuleaKm = haversineDistanceKm(
          data.latitude,
          data.longitude,
          LULEA_COORDS.lat,
          LULEA_COORDS.lon,
        )
        const altitude = typeof data.altitude === 'number' ? data.altitude : null
        const altitudeSource = altitude === null ? 'unknown' : 'api'
        const groundspeedFromApi = typeof data.velocity === 'number' ? data.velocity : null
        let groundspeed = groundspeedFromApi
        let groundspeedSource: IssPositionState['groundspeedSource'] =
          groundspeedFromApi === null ? 'unknown' : 'api'
        let heading: number | null = typeof data.heading === 'number' ? data.heading : null
        let headingSource: IssPositionState['headingSource'] =
          heading === null ? 'unknown' : 'api'
        const lastSample = lastSampleRef.current
        if (lastSample) {
          const timeDeltaMs = timestamp - lastSample.timestamp
          if (timeDeltaMs > 500) {
            const distanceKm = haversineDistanceKm(
              lastSample.latitude,
              lastSample.longitude,
              data.latitude,
              data.longitude,
            )
            if (groundspeed === null) {
              const hours = timeDeltaMs / (1000 * 60 * 60)
              if (hours > 0) {
                groundspeed = distanceKm / hours
                groundspeedSource = 'derived'
              }
            }
            if (heading === null && distanceKm > 0.01) {
              heading = bearingDegrees(
                lastSample.latitude,
                lastSample.longitude,
                data.latitude,
                data.longitude,
              )
              headingSource = 'derived'
            }
          }
        }
        lastSampleRef.current = {
          latitude: data.latitude,
          longitude: data.longitude,
          timestamp,
        }
        setState({
          latitude: data.latitude,
          longitude: data.longitude,
          altitude,
          heading,
          groundspeed,
          altitudeSource,
          headingSource,
          groundspeedSource,
          timestamp,
          distanceFromLuleaKm,
          loading: false,
        })
      } catch (error) {
        if (!cancelled) {
          setState((prev) => ({
            ...(prev ?? {}),
            loading: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          }))
        }
      }
    }

    fetchPosition()
    timer = window.setInterval(fetchPosition, pollIntervalMs)

    return () => {
      cancelled = true
      if (timer) {
        clearInterval(timer)
      }
    }
  }, [pollIntervalMs])

  return state
}
