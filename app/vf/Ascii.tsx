/** Inert terminal vocabulary. Both lengths are rendered; CSS owns the swap. */
import { ROUTE_ART as EMBLEMS } from './AsciiArt'

function emblemFor(view: string) {
  if (/CHAT|CONTENT/.test(view)) return EMBLEMS.signal
  if (/MEMORY|GITHUB|CALENDAR/.test(view)) return EMBLEMS.archive
  if (/PROJECT|PIPELINE|SETUP/.test(view)) return EMBLEMS.build
  if (/KANBAN|BOT/.test(view)) return EMBLEMS.network
  return EMBLEMS.core
}

export function AsciiKicker({ view, detail, framed = false }: { view: string; detail: string; framed?: boolean }) {
  return (
    <div className={`v4-kicker cyber-route${framed ? ' v4-corners' : ''}`} aria-hidden="true">
      <pre className="cyber-route-art">{emblemFor(view)}</pre>
      <div className="cyber-route-copy">
        <span className="cyber-route-eyebrow">{'// SECTOR DIRECTORY'}</span>
        <span className="v4-ascii-full">[ {view} / {detail} ]</span>
        <span className="v4-ascii-short">[ {view} ]</span>
      </div>
      <span className="cyber-route-code">{'++\n||\n++'}</span>
    </div>
  )
}

export function AsciiDivider() {
  return <div className="v4-divider" aria-hidden="true"><span>{'+--[ / / / ::: / / / ]--+'}</span></div>
}

export function AsciiSkyline() {
  return <pre className="cyber-skyline" aria-hidden="true">{'       |       .      \n   .  [::]     |      \n  [|] |::| .  [|]     \n _|:|_|::|[|]_|:|_    \n|:|:|:|::|:|:|:|:|    \n====================  \n  P R E C I A D O     '}</pre>
}

export function AsciiPanelTrim() {
  return <div className="cyber-panel-trim" aria-hidden="true"><span>{'+--'}</span><span>{'[== / :: + :: / ==]'}</span><span>{'--+'}</span></div>
}

export function AsciiWordmark() {
  return <div className="cyber-wordmark" aria-hidden="true">
    <pre>{' /\\     /\\   .========.\n/  \\   /  \\  ||\n||  \\ /  ||  ||\n||   V   ||  ||\n||       ||  \\========/'} </pre>
    <div><span>MISSION CONTROL</span><small>{'[ HUMAN + MACHINE ]'}</small></div>
  </div>
}

export function AsciiCity() {
  return <div className="cyber-city" aria-hidden="true">
    <pre>{'      .       |         .\n  |       .--[+]--.       |\n [#]      | [] [] |      [#]\n |#| .--. | [] [] | .--. |#|\n |#| |::| |======| |::| |#|\n_|#|_|::|_|_|++|_|_|::|_|#|_\n=============================\n /_/ /_/ /_/ /_/ /_/ /_/ /_/'}</pre>
    <div><span>{'// PRECIADO'}</span><span>{'[ END OF TRANSMISSION ]'}</span></div>
  </div>
}

export function AsciiTerminalArt({ compact = false }: { compact?: boolean }) {
  return <pre className={`cyber-terminal-art${compact ? ' is-compact' : ''}`} aria-hidden="true">{compact ? '[ / >_ / ]' : '   .------------.\n   |  / >_      |\n   |____________|\n      _|____|_\n     /________\\'}</pre>
}

export function AsciiConsole({ state }: { state: 'SCANNING' | 'FAULT' | '404 / NO SIGNAL' }) {
  return (
    <pre className="v4-console" aria-hidden="true">
      {'+--------------------------+\n| > '}{state}<span className="v4-cursor">_</span>{' '.repeat(22 - state.length) + '|\n+--------------------------+'}
    </pre>
  )
}
