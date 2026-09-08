import type { ReactNode } from 'react'

export function FaultConsole({ kind, children }: { kind: 'error' | '404'; children: ReactNode }) {
  const status = kind === 'error' ? 'KERNEL FAULT // RECOVERY INITIATED' : 'SIGNAL LOST // SECTOR NOT FOUND'
  const row = (text: string) => `│ ${text.padEnd(42)} │`
  return (
    <section className="boot-fault-screen">
      <div className="boot-fault-panel">
        <pre className="boot-frame" aria-hidden="true">{`╭${'─'.repeat(44)}╮\n${row('FAULT CONSOLE / MC-072')}\n${row('')}\n`}
          <span>│ </span><span className="boot-fault-status">{kind === 'error' ? <>KERNEL <span className="boot-error-word">FAULT</span> // RECOVERY INITIATED</> : status}</span>{`${' '.repeat(42 - status.length)} │\n${row('')}\n${row(kind === 'error' ? '> RECOVERY CHANNEL ........ STANDBY' : '> SECTOR LOOKUP ........... NO SIGNAL')}\n╰${'─'.repeat(44)}╯`}
        </pre>
        <h1 className="boot-sr-only">{status}</h1>
        <div className="boot-fault-details">{children}</div>
      </div>
    </section>
  )
}
