/** Inert terminal vocabulary. Both lengths are rendered; CSS owns the swap. */
export function AsciiKicker({ view, detail, framed = false }: { view: string; detail: string; framed?: boolean }) {
  return (
    <div className={`v4-kicker${framed ? ' v4-corners' : ''}`} aria-hidden="true">
      <span className="v4-ascii-full">[ // {view} // {detail} ]</span>
      <span className="v4-ascii-short">[ // {view} ]</span>
    </div>
  )
}

export function AsciiDivider() {
  return <div className="v4-divider" aria-hidden="true"><span>─ // ─</span></div>
}

export function AsciiConsole({ state }: { state: 'SCANNING' | 'FAULT' | '404 / NO SIGNAL' }) {
  return (
    <pre className="v4-console" aria-hidden="true">
      {'+--------------------------+\n| > '}{state}<span className="v4-cursor">_</span>{' '.repeat(22 - state.length) + '|\n+--------------------------+'}
    </pre>
  )
}
