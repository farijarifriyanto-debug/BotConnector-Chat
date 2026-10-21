// Wire types for remote agent sessions (Plan C). The shapes mirror the relay/Device CLI contract:
// docs/superpowers/specs/2026-10-21-agent-remote-laptop-design.md §5 and the as-built wire reference
// in BotConnector-Desktop (docs/superpowers/specs/2026-10-21-agent-bridge-wire-asbuilt.md).

export interface AgentHost { home?: string; version?: string }

export type AgentItem =
  | { type: 'ready'; sessionId?: string; host?: AgentHost }
  | { type: 'text'; delta?: string; text?: string }
  | { type: 'thinking'; delta?: string; text?: string }
  | { type: 'tool_use'; id?: string; tool?: string; name?: string; target?: string; input?: unknown }
  | { type: 'tool_result'; id?: string; tool?: string; name?: string; target?: string; output?: string; isError?: boolean; display?: string }
  | { type: 'approval_request'; requestId: string; tool?: string; kind?: string; target?: string; preview?: string }
  | { type: 'result'; text?: string; usage?: { inputTokens?: number; outputTokens?: number }; stopReason?: string }
  | { type: string }

export type AgentFrame =
  | { event?: { item?: AgentItem } | { heartbeat?: true } }
  | { done?: true; result?: unknown }
  | { error?: { message?: string; code?: string } }

export interface AgentApproval {
  requestId: string
  tool?: string
  kind?: string
  target?: string
  preview?: string
}

export interface AgentBaseline {
  id: string
  cwd?: string
  permissionMode?: string
  messages?: { role?: string; content?: unknown }[]
  truncated?: boolean
  omittedCount?: number
}

export type AgentEntry =
  | { kind: 'user'; id: string; text: string }
  | { kind: 'text'; id: string; text: string }
  | { kind: 'thinking'; id: string; text: string }
  | { kind: 'tool'; id: string; tool: string; target?: string; status: 'running' | 'ok' | 'error'; output?: string; display?: string }
  | { kind: 'result'; id: string; text: string }
  | { kind: 'error'; id: string; code?: string; text: string }

export type AgentTurn = 'idle' | 'running' | 'awaiting_approval'

export interface AgentView {
  entries: AgentEntry[]
  pending: AgentApproval | null
  turn: AgentTurn
  usage: { inputTokens?: number; outputTokens?: number } | null
  error: string | null
  /** how many old baseline messages the relay dropped before sending the transcript */
  omitted: number
}

export interface AgentWorkspace { path: string; name?: string; lastUsed?: string }
export interface AgentSessionSummary { id: string; mtime?: string; preview?: string }
export type AgentApprovalAnswer = 'yes' | 'no' | 'session'
