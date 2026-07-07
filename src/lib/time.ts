export function formatDistanceToNow(timestamp: number): string {
  const diffMs = Date.now() - timestamp
  const diffMinutes = Math.floor(diffMs / 60000)
  if (diffMinutes < 1) {
    const diffSeconds = Math.max(1, Math.floor(diffMs / 1000))
    return `${diffSeconds}s ago`
  }
  if (diffMinutes < 60) {
    return `${diffMinutes} min ago`
  }
  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) {
    return `${diffHours} h ago`
  }
  const diffDays = Math.floor(diffHours / 24)
  return `${diffDays} d ago`
}
