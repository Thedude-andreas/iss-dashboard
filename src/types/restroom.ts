export interface RestroomHistoryEntry {
  timestamp: number
  delta: number
}

export interface RestroomSnapshot {
  timestamp?: number
  history: RestroomHistoryEntry[]
}
