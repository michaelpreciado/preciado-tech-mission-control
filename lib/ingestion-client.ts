/**
 * Ingestion client -- thin wrapper around the FastAPI ingestion service.
 * Next.js data layer uses this to merge live Hermes + OpenClaw events.
 */

const INGEST_BASE = process.env.INGESTION_API_URL || "http://127.0.0.1:8000"

async function fetchJson<T = unknown>(path: string): Promise<T> {
  const url = `${INGEST_BASE}${path}`
  let res: Response
  try {
    res = await fetch(url, { next: { revalidate: 0 } })
  } catch (err) {
    throw new Error(`ingestion client network error on ${path}: ${err instanceof Error ? err.message : 'unknown'}`)
  }
  if (!res.ok) {
    throw new Error(`ingestion client error ${res.status} on ${path}`)
  }
  try {
    return await res.json() as T
  } catch {
    throw new Error(`ingestion client: invalid JSON response on ${path}`)
  }
}

export async function listEvents(agent_id?: string, event_type?: string, limit = 200) {
  const params = new URLSearchParams()
  if (agent_id) params.set("agent_id", agent_id)
  if (event_type) params.set("event_type", event_type)
  params.set("limit", String(Math.min(limit, 1000)))
  return fetchJson(`/v1/events?${params.toString()}`)
}

export async function getAgentsStatus() {
  return fetchJson("/v1/agents/status")
}
