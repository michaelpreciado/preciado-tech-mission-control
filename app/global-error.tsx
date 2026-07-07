'use client'

import { useEffect } from 'react'

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('Global app error:', error)
  }, [error])

  return (
    <html lang="en">
      <body className="bg-[#020817] text-[#e8f4ff]">
        <div className="flex min-h-screen items-center justify-center p-8">
          <div className="critical-panel max-w-md rounded-xl border border-red-400/30 bg-red-500/10 p-8 text-center">
            <div className="mb-4 text-5xl" aria-hidden="true">▣</div>
            <h2 className="mb-3 text-xl font-bold text-red-200">Critical System Failure</h2>
            <p className="mb-6 text-sm text-red-300/80">
              Mission Control hit a fault boundary. Reboot the interface when ready.
            </p>
            {error.digest && (
              <div className="mb-4 break-all font-mono text-xs text-red-400/60">
                ref: {error.digest}
              </div>
            )}
            <button
              onClick={reset}
              className="console-button rounded-lg border border-red-400/40 bg-red-500/20 px-6 py-3 text-sm font-semibold text-red-100 transition hover:bg-red-500/40"
            >
              Reboot Interface
            </button>
          </div>
        </div>
      </body>
    </html>
  )
}
