'use client'

import { useEffect } from 'react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Route error:', error)
  }, [error])

  return (
    <div className="pt-fault-screen">
      <div className="pt-fault-panel">
        <div className="pt-fault-mark" aria-hidden="true">
          &#x25A3;
        </div>
        <h2 className="pt-fault-title">System Fault Detected</h2>
        <p className="pt-fault-copy">
          A panel failed to render. This may be a transient issue.
        </p>
        {error.digest && <p className="pt-fault-ref">ref: {error.digest}</p>}
        <button onClick={reset} className="pt-fault-btn">
          Retry Connection
        </button>
      </div>
    </div>
  )
}