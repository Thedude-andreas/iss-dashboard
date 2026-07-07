import { useEffect, useMemo, useRef, useState } from 'react'
import { Subscription } from 'lightstreamer-client-web/lightstreamer.esm'

import { telemetryCards } from '../data/telemetry'
import type { TelemetrySample } from '../types/telemetry'
import {
  SUBSCRIPTION_FIELDS,
  attachLightstreamerClient,
  getLightstreamerClient,
} from '../lib/lightstreamerClient'
import { fetchRestroomSnapshot, persistRestroomEvent } from '../lib/restroomPersistence'
import { latestSampleTimestamp } from '../lib/telemetryUtils'
import type { RestroomHistoryEntry } from '../types/restroom'

const RESTROOM_WINDOW_MS = 24 * 60 * 60 * 1000

export interface TelemetryState {
  samples: Record<string, TelemetrySample>
  connectionStatus: string
  lastUpdated?: number
  error?: string
  lastUrineIncreaseAt?: number
  urineHistory: RestroomHistoryEntry[]
}

export function useIssTelemetry(): TelemetryState {
  const [samples, setSamples] = useState<Record<string, TelemetrySample>>({})
  const [connectionStatus, setConnectionStatus] = useState('DISCONNECTED')
  const [error, setError] = useState<string | undefined>(undefined)
  const [lastUrineIncreaseAt, setLastUrineIncreaseAt] = useState<number | undefined>(undefined)
  const [urineHistory, setUrineHistory] = useState<RestroomHistoryEntry[]>([])
  const latestNumericValues = useRef<Record<string, number | undefined>>({})
  const isMountedRef = useRef(true)

  const itemIds = useMemo(() => telemetryCards.map((card) => card.id), [])

  useEffect(() => {
    return () => {
      isMountedRef.current = false
    }
  }, [])

  useEffect(() => {
    return attachLightstreamerClient(setConnectionStatus)
  }, [])

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()
    ;(async () => {
      try {
        const snapshot = await fetchRestroomSnapshot(controller.signal)
        if (!cancelled) {
          setLastUrineIncreaseAt(snapshot.timestamp)
          setUrineHistory(snapshot.history ?? [])
        }
      } catch (fetchError) {
        if (import.meta.env.DEV) {
          console.warn('Unable to load shared restroom timestamp', fetchError)
        }
      }
    })()

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [])

  useEffect(() => {
    const client = getLightstreamerClient()
    const subscription = new Subscription('MERGE', itemIds, SUBSCRIPTION_FIELDS)
    subscription.setRequestedSnapshot('yes')
    subscription.setRequestedMaxFrequency(1)
    subscription.addListener({
      onItemUpdate: (update: any) => {
        const id = update.getItemName() ?? itemIds[update.getItemPos() - 1]
        if (!id) {
          return
        }
        const numericValue = parseNumericValue(
          update.getValue('CalibratedData') ?? update.getValue('Value'),
        )

        if (id === 'NODE3000005' && numericValue != null) {
          const previousValue = latestNumericValues.current[id]
          if (previousValue != null && numericValue > previousValue) {
            const timestamp = Date.now()
            const delta = numericValue - previousValue
            setLastUrineIncreaseAt(timestamp)
            if (delta > 0) {
              setUrineHistory((prev) => pruneHistory([...prev, { timestamp, delta }]))
              persistRestroomEvent(timestamp, delta)
                .then((snapshot) => {
                  if (isMountedRef.current) {
                    if (snapshot.timestamp) {
                      setLastUrineIncreaseAt(snapshot.timestamp)
                    }
                    setUrineHistory(snapshot.history ?? [])
                  }
                })
                .catch((persistError) => {
                  if (import.meta.env.DEV) {
                    console.warn('Unable to persist restroom event', persistError)
                  }
                })
            }
          }
          latestNumericValues.current[id] = numericValue
        } else if (numericValue != null) {
          latestNumericValues.current[id] = numericValue
        }
        setSamples((prev) => ({
          ...prev,
          [id]: {
            id,
            timestamp: Date.now(),
            feedTimestamp: update.getValue('TimeStamp'),
            rawValue: update.getValue('Value'),
            calibratedValue: update.getValue('CalibratedData'),
            statusClass: update.getValue('Status.Class'),
            statusIndicator: update.getValue('Status.Indicator'),
            statusColor: update.getValue('Status.Color'),
          },
        }))
      },
      onSubscriptionError: (_code: unknown, message: string) => {
        setError(message)
      },
    })

    client.subscribe(subscription)

    return () => {
      client.unsubscribe(subscription)
    }
  }, [itemIds])

  const lastUpdated = latestSampleTimestamp(samples)

  return {
    samples,
    connectionStatus,
    lastUpdated,
    error,
    lastUrineIncreaseAt,
    urineHistory,
  }
}

function parseNumericValue(value: string | null): number | null {
  if (value == null) {
    return null
  }
  const normalized = value.trim()
  if (!normalized) {
    return null
  }
  const numericValue = Number(normalized)
  return Number.isFinite(numericValue) ? numericValue : null
}

function pruneHistory(entries: RestroomHistoryEntry[]): RestroomHistoryEntry[] {
  const cutoff = Date.now() - RESTROOM_WINDOW_MS
  return entries.filter((entry) => entry.timestamp >= cutoff)
}
