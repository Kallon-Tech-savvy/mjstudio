import { useEffect, useState } from 'react'

export function OfflineBanner() {
  const [offline, setOffline] = useState(() => typeof navigator !== 'undefined' && !navigator.onLine)
  const [wasOffline, setWasOffline] = useState(false)

  useEffect(() => {
    const handleOffline = () => {
      setOffline(true)
      setWasOffline(true)
    }
    const handleOnline = () => {
      setOffline(false)
      setWasOffline(true)
      window.setTimeout(() => setWasOffline(false), 3500)
    }

    window.addEventListener('offline', handleOffline)
    window.addEventListener('online', handleOnline)
    return () => {
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('online', handleOnline)
    }
  }, [])

  const [dismissed, setDismissed] = useState(false)

  const visible = (offline || (wasOffline && !offline)) && !dismissed
  if (!visible) return null

  return (
    <div
      className={`offline-banner${offline ? '' : ' offline-banner--reconnected'}`}
      role="status"
      aria-live="polite"
      onClick={() => setDismissed(true)}
      style={{ cursor: 'pointer' }}
      title="Tap anywhere to dismiss"
    >
      <span className="offline-banner__dot" aria-hidden="true" />
      {offline
        ? 'Offline mode: You can work normally. Saved locally and will sync when reconnected. (Tap to dismiss)'
        : 'Back online. Your studio changes are syncing with the cloud. (Tap to dismiss)'}
    </div>
  )
}
