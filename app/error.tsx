'use client'

import { AsciiHorizon } from './vf/Ascii'
import { useEffect } from 'react'
import { FaultConsole } from '@/components/boot/FaultConsole'

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error('Route error:', error) }, [error])
  return (
    <FaultConsole kind="error">
      <AsciiHorizon />
      <p>A panel failed to render. Reconnect to retry.</p>
      {error.digest && <p className="boot-reference">ref: {error.digest}</p>}
      <button onClick={reset} className="boot-action">[ RETRY CONNECTION → ]</button>
    </FaultConsole>
  )
}
