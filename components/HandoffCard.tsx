import type { HandoffReport } from '@/lib/handoff'

export type HandoffMessage = {
  id: number
  role: 'system'
  state: 'running' | 'done' | 'failed'
  task: string
  report?: HandoffReport
  error?: string
}

export function HandoffCard({ message }: { message: HandoffMessage }) {
  return <section className="cc-handoff" role="status" aria-label="handoff result" data-handoff-state={message.state}
    style={{ margin: 12, padding: 16, border: '1px solid var(--pt-border-dim)', borderLeft: '3px solid #00E5FF', borderRadius: 8, overflowWrap: 'anywhere' }}>
    <strong>Handoff result · Codex · {message.state}</strong>
    <p>New agent context seeded with a brief from this conversation. This is not a resumed session.</p>
    <p>{message.task}</p>
    {message.error && <p>{message.error}</p>}
    {message.report && <>
      <p>Process exit code: {message.report.exitCode ?? 'unavailable'}. Process evidence does not verify task completion.</p>
      <details open><summary>Repository diff evidence</summary><pre style={{ whiteSpace: 'pre-wrap' }}>{message.report.diffStat}</pre></details>
      <details open><summary>Output tail (up to 20 lines)</summary><pre style={{ whiteSpace: 'pre-wrap' }}>{message.report.outputTail || '(no output)'}</pre></details>
    </>}
  </section>
}
