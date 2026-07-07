'use client'

import { useEffect } from 'react'

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('Route error:', error)
  }, [error])

  return (
    <div className="flex min-h-[400px] items-center justify-center p-8">
      <div className="rounded-xl border border-red-400/30 bg-red-500/10 p-6 text-center">
        <div className="mb-4 text-4xl" aria-hidden="true">&#x25A3;</div>
        <h2 className="mb-2 text-lg font-bold text-red-200">System Fault Detected</h2>
        <p className="mb-4 text-sm text-red-300/80">
          A panel failed to render. This may be a transient issue.
        </p>
        {error.digest && (
          <p className="mono mb-4 text-[10px] text-red-400/60">ref: {error.digest}</p>
        )}
        <button
          onClick={reset}
          className="rounded-lg border border-red-400/30 bg-red-500/20 px-4 py-2 text-sm text-red-200 transition hover:bg-red-500/30"
        >
          Retry Connection
        </button>
      </div>
    </div>
  )
}
