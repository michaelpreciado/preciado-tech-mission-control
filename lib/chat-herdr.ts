import { stripVTControlCharacters } from 'node:util'
import { herdr, HerdrError, runHerdr, validateTarget, type HerdrRunner } from './herdr-bridge'
import { continuityStore, type ChatContinuity } from './chat-continuity'
import { withAgentFlight } from './agent-adapters'

// Both normal MC sends and pane turns share the Hermes flight lock.
/** herdr agent names must be 1-32 chars of [a-z0-9_-] and start with a lowercase letter. */
export function herdrPaneName(mcConversationId: string) {
  const slug = mcConversationId.toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 8) || 'session'
  return `mc-chat-${slug}`.slice(0, 32)
}

async function startInPane(record: ChatContinuity, run: HerdrRunner) {
  const deadline = Date.now() + 10_000
  for (let attempt = 0; attempt < 12; attempt++) {
    const remaining = deadline - Date.now()
    if (remaining <= 0) break
    try {
      await run(['agent', 'start', record.paneName!, '--kind', 'hermes', '--pane', record.herdrPane!, '--timeout', String(Math.min(8000, remaining)), '--',
        ...(record.profile !== 'default' ? ['--profile', record.profile] : []), 'chat',
        record.selector === 'name' ? '--continue' : '--resume', record.sessionName || record.hermesSession, '--no-restore-cwd', '--cli'], remaining)
      return
    } catch (error) {
      let ownerLine: string | undefined
      try {
        const output = await run(['pane', 'read', record.herdrPane!, '--lines', '40', '--format', 'text'], Math.max(1, Math.min(1000, deadline - Date.now())))
        ownerLine = stripVTControlCharacters(String(output.text || '')).split(/\r?\n/).find(line => line.includes('already has a live owner'))
      } catch { /* A diagnostic read must not replace the startup failure. */ }
      if (ownerLine) throw new HerdrError(ownerLine.trim(), 502, record.herdrPane)
      const recoverable = error instanceof HerdrError && (error.code === 'agent_pane_busy'
        || error.message.toLowerCase().includes('timed out waiting for agent startup'))
      if (!recoverable || attempt === 11 || Date.now() + 750 >= deadline) break
      await new Promise(resolve => setTimeout(resolve, 750))
    }
  }
  throw new HerdrError('Pane recorded, but startup is unconfirmed. Inspect it in the agent deck before retrying.', 502, record.herdrPane)
}

export async function continueInHerdr(record: ChatContinuity, text: string, run: HerdrRunner = runHerdr, file?: string) {
  const result = await withAgentFlight('hermes', async () => {
    const store = continuityStore(file)
    try {
      record = store.get(record.profile, record.hermesSession) ?? record
      if (!record.herdrPane) {
        const created = await run(['workspace', 'create', '--cwd', process.cwd(), '--label', 'MC chat', '--no-focus'])
        const pane = created.pane_id || (created.pane as { pane_id?: string })?.pane_id || (created.root_pane as { pane_id?: string })?.pane_id
        record = store.save({ ...record, herdrPane: validateTarget(pane), paneName: herdrPaneName(record.mcConversationId) })
        await startInPane(record, run)
      }
      const listed = await run(['agent', 'list'])
      const agent = (listed.agents as Array<{ pane_id: string; name?: string; agent?: string; agent_status?: string }> | undefined)?.find(a => a.pane_id === record.herdrPane)
      if (!agent || agent.name !== record.paneName || agent.agent !== 'hermes') throw new HerdrError('Recorded pane is missing or has changed. Inspect it in the agent deck.', 409, record.herdrPane)
      if (!['idle', 'done'].includes(agent.agent_status || '')) throw new HerdrError('Recorded Hermes pane is not idle. Inspect it before sending.', 409, record.herdrPane)
      await run(['agent', 'prompt', record.herdrPane!, text, '--wait', '--until', 'idle', '--until', 'done', '--timeout', '180000'], 185_000)
      herdr.invalidate()
      const output = await run(['pane', 'read', record.herdrPane!, '--lines', '200', '--format', 'text'])
      return { continuity: record, terminalText: stripVTControlCharacters(String(output.text || '')).slice(-100_000) }
    } finally { store.close() }
  })
  if (result.status === 409) throw new HerdrError(result.error, 409)
  return result.value
}
