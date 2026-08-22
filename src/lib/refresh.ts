import { useEffect } from 'react'

// Chat-driven actions (transfers, goal changes, auto-payments) mutate account
// data from outside whichever page happens to be mounted. Pages that display
// that data subscribe via useDataRefresh so they refetch instead of going stale.
const DATA_CHANGED_EVENT = 'vantra:data-changed'

export function emitDataChanged() {
  window.dispatchEvent(new Event(DATA_CHANGED_EVENT))
}

export function useDataRefresh(onRefresh: () => void) {
  useEffect(() => {
    window.addEventListener(DATA_CHANGED_EVENT, onRefresh)
    return () => window.removeEventListener(DATA_CHANGED_EVENT, onRefresh)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
