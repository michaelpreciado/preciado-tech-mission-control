/**
 * Canonical Event Schema — TypeScript mirror of backend/app/schema.py
 *
 * Every event emitted by OpenClaw or Hermes into Mission Control must
 * conform to this envelope.  The payload shape is determined by event_type.
 */

export type AgentId = "openclaw" | "hermes" | "jarvis";

export type EventType =
  | "task_update"
  | "memory_write"
  | "tool_call"
  | "stock_signal"
  | "mission_status"
  | "project_event"
  | "heartbeat"
  | "session_activity"
  | "idea_capture"
  | "cost_update"
  | "ops_activity"
  | "pipeline_update";

// ---------------------------------------------------------------------------
// Payloads
// ---------------------------------------------------------------------------

export type TaskUpdatePayload = {
  task_id?: string;
  title: string;
  status: "active" | "backlog" | "scheduled" | "done" | "attention";
  owner?: string;
  priority: "high" | "normal" | "low";
  detail?: string;
  source_path?: string;
};

export type MemoryWritePayload = {
  memory_id?: string;
  title: string;
  excerpt: string;
  source_path: string;
  tags: string[];
};

export type ToolCallPayload = {
  tool_name: string;
  input_summary?: string;
  output_summary?: string;
  duration_ms?: number;
  success: boolean;
};

export type StockSignalPayload = {
  symbol: string;
  signal: string;
  price?: number;
  change_percent?: number;
  note?: string;
};

export type MissionStatusPayload = {
  mission_id: string;
  title: string;
  status: "pending" | "active" | "completed" | "failed";
  assigned_to?: string;
  priority: "high" | "medium" | "low";
  progress_pct?: number;
};

export type ProjectEventPayload = {
  project_id: string;
  project_name: string;
  kind: "obsidian" | "github" | "workspace";
  event: string;
  progress?: number;
  tasks_delta?: number;
};

export type HeartbeatPayload = {
  current_task?: string;
  status: "working" | "idle" | "error";
  idea_title?: string;
  idea_description?: string;
};

export type SessionActivityPayload = {
  activity: string;
  platform?: string;
  input_tokens: number;
  output_tokens: number;
  estimated_cost_usd: number;
};

export type IdeaCapturePayload = {
  title: string;
  description?: string;
  status: "new" | "approved" | "rejected";
};

export type CostUpdatePayload = {
  model: string;
  provider: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  estimated_cost_usd: number;
  failed: boolean;
};

export type OpsActivityPayload = {
  file_path: string;
  area: "workspace" | "vault" | "repo" | "inbox" | "cron" | "logs";
  kind: "markdown" | "code" | "config" | "data" | "other";
  event: "recent-change" | "inbox-item" | "scheduled-run" | "log-update";
  age_minutes: number;
};

export type PipelineStage =
  | "leads_found"
  | "social_scraped"
  | "concept_ready"
  | "awaiting_approval"
  | "in_development"
  | "completed";

export type PipelineUpdatePayload = {
  lead_id: string;
  business_name: string;
  stage: PipelineStage;
  // Downstream action this transition triggers in the web-dev-pipeline skill
  // (scrape_socials, x_api_inspiration, telegram_notify, claude_code_handoff,
  // email_draft_signoff).
  action?: string;
  detail?: string;
  score?: number;
};

// Union discriminated by event_type if you need exhaustiveness checking
export type CanonicalPayload =
  | ({ event_type: "task_update" } & TaskUpdatePayload)
  | ({ event_type: "memory_write" } & MemoryWritePayload)
  | ({ event_type: "tool_call" } & ToolCallPayload)
  | ({ event_type: "stock_signal" } & StockSignalPayload)
  | ({ event_type: "mission_status" } & MissionStatusPayload)
  | ({ event_type: "project_event" } & ProjectEventPayload)
  | ({ event_type: "heartbeat" } & HeartbeatPayload)
  | ({ event_type: "session_activity" } & SessionActivityPayload)
  | ({ event_type: "idea_capture" } & IdeaCapturePayload)
  | ({ event_type: "cost_update" } & CostUpdatePayload)
  | ({ event_type: "ops_activity" } & OpsActivityPayload)
  | ({ event_type: "pipeline_update" } & PipelineUpdatePayload);

// ---------------------------------------------------------------------------
// Top-level envelope
// ---------------------------------------------------------------------------

export type CanonicalEvent = {
  agent_id: AgentId;
  session_id: string;
  event_type: EventType;
  timestamp: string; // ISO-8601 UTC
  payload: Record<string, unknown>;
  source_path?: string;
  metadata?: Record<string, unknown>;
};

// Agent status snapshot returned by /v1/agents/status
export type AgentStatus = {
  agent_id: AgentId;
  last_seen_at: string; // ISO-8601 UTC
  status: "alive" | "stale" | "unknown";
  current_task?: string;
};
