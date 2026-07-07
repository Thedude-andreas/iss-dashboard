import type { RestroomSnapshot } from '../types/restroom'

const apiBase = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')
const endpoint = `${apiBase}/api/last-urine.php`

interface ApiResponse {
  timestamp?: number
  history?: RestroomHistoryEntry[]
  error?: string
}

interface RestroomHistoryEntry {
  timestamp: number
  delta: number
}

async function handleResponse(response: Response): Promise<RestroomSnapshot> {
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`API error ${response.status}: ${text}`)
  }
  const data = (await response.json()) as ApiResponse
  return {
    timestamp: typeof data.timestamp === 'number' ? data.timestamp : undefined,
    history: Array.isArray(data.history)
      ? data.history
          .map((entry) =>
            typeof entry === 'object' && entry
              ? {
                  timestamp: typeof entry.timestamp === 'number' ? entry.timestamp : undefined,
                  delta: typeof entry.delta === 'number' ? entry.delta : undefined,
                }
              : undefined,
          )
          .filter((entry): entry is RestroomHistoryEntry =>
            Boolean(entry && entry.timestamp != null && entry.delta != null),
          )
      : [],
  }
}

export async function fetchRestroomSnapshot(signal?: AbortSignal): Promise<RestroomSnapshot> {
  const response = await fetch(endpoint, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
    },
    signal,
    credentials: 'same-origin',
  })
  return handleResponse(response)
}

export async function persistRestroomEvent(
  timestamp: number,
  delta: number,
  signal?: AbortSignal,
): Promise<RestroomSnapshot> {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({ timestamp, delta }),
    signal,
    credentials: 'same-origin',
  })
  return handleResponse(response)
}
