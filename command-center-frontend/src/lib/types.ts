/**
 * Tipos espelhando os Pydantic models do backend (`command-center-backend`).
 * Mantenha em sincronia com `src/command_center/db/models.py` e
 * `src/command_center/agents/manager.py`.
 */

export type TaskStatus = "pending" | "running" | "done" | "failed" | "cancelled";
export type EmployeeStatus = "idle" | "busy" | "offline";
export type ProjectStatus = "active" | "archived";
export type ModelAlias = "opus" | "sonnet" | "haiku";
export type ExecutionMode = "parallel" | "sequential";

export interface Project {
  id: number;
  name: string;
  path: string;
  description: string | null;
  status: ProjectStatus;
  created_at: string;
  /** Stack detectado heuristicamente (max 3 labels). Vazio se não conseguiu inferir. */
  tech_stack?: string[];
}

export interface SuggestionsResponse {
  suggestions: string[];
  source: "llm" | "rules" | "cache";
  generated_at: string;
}

export interface DispatchEstimate {
  per_task: number[];
  total_usd: number;
  total_brl: number;
  note: string;
}

export interface ProjectInput {
  name: string;
  path: string;
  description?: string | null;
}

export interface TaskInput {
  title: string;
  prompt: string;
  project_id?: number | null;
  model?: string | null;
}

export interface Task {
  id: number;
  project_id: number | null;
  parent_task_id: number | null;
  title: string;
  prompt: string;
  status: TaskStatus;
  assigned_to: number | null;
  model: string | null;
  output: string | null;
  error: string | null;
  cost_estimate: number | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface Employee {
  id: number;
  name: string;
  model: string;
  specialty: string;
  status: EmployeeStatus;
  current_task_id: number | null;
}

/* ---------- Plan / Manager ---------- */

export interface TaskSpec {
  title: string;
  prompt: string;
  project: string | null;
  model: ModelAlias;
  specialty: string;
  depends_on: number[];
  auto_pr?: boolean;
  linear_issue_id?: string | null;
}

export interface Plan {
  understanding: string;
  execution_mode: ExecutionMode;
  tasks: TaskSpec[];
  estimated_minutes: number;
  /** Resposta direta quando não há tasks (small talk). null quando há tasks. */
  direct_reply?: string | null;
  /** Pensamento crítico do gerente sobre o plano: riscos, alternativas, suposições. */
  critique?: string | null;
}

/* ---------- SSE events emitidos por /api/chat ---------- */

export type ChatSseEventType =
  | "manager_thinking"
  | "manager_delta"
  | "plan_created"
  | "task_started"
  | "task_progress"
  | "task_completed"
  | "task_failed"
  | "manager_report"
  | "pr_created"
  | "error"
  | "done";

export interface PrCreatedPayload {
  index: number;
  task_id: number;
  pr_url: string;
}

export interface ManagerThinkingPayload {
  message: string;
  /** Modelo escolhido pelo backend (auto fast-path resolve para haiku/sonnet/opus). */
  model?: ModelAlias;
}

export interface ManagerDeltaPayload {
  text: string;
}

export interface TaskStartedPayload {
  /** Índice estável (0-based) da task no plano. Use isto para binding. */
  index: number;
  task_id: number;
  title: string;
  employee: string | null;
  model: string;
  project: string | null;
  cwd: string | null;
}

export interface TaskProgressPayload {
  /** Índice estável (0-based) da task no plano. Use isto para binding. */
  index: number;
  task_id: number;
  chunk: string;
}

export interface FileTouch {
  tool: "Write" | "Edit" | "MultiEdit" | "NotebookEdit";
  path: string;
  operation: "create" | "modify" | "delete";
}

export interface TaskCompletedPayload {
  /** Índice estável (0-based) da task no plano. Use isto para binding. */
  index: number;
  task_id: number;
  summary: string;
  cost_usd: number | null;
  duration_ms: number | null;
  input_tokens?: number;
  output_tokens?: number;
  files_touched?: FileTouch[];
}

export interface WorkerActionPayload {
  index: number;
  task_id: number;
  worker: string | null;
  tool: string;
  input_summary: string;
}

export interface UsageBucket {
  cost_usd: number;
  input_tokens: number;
  output_tokens: number;
}

export interface UsageSummary {
  manager: UsageBucket;
  workers: UsageBucket;
  total: UsageBucket;
}

export interface TaskFailedPayload {
  /** Índice estável (0-based) da task no plano. Use isto para binding. */
  index: number;
  task_id: number;
  error: string;
  /** Sprint 3: true se task falhou por permission prompt (MCP travado).
   * UI mostra mensagem específica + link pra configurar mcp.json. */
  permission_blocked?: boolean;
}

export interface ManagerReportPayload {
  report: string;
  outcomes: TaskOutcome[];
  usage?: UsageSummary;
}

export interface TaskOutcome {
  index: number;
  title: string;
  status: "done" | "failed" | "cancelled";
  task_id: number | null;
  output: string | null;
  error: string | null;
  cost_usd: number | null;
  duration_ms: number | null;
  input_tokens?: number;
  output_tokens?: number;
}

export interface ChatErrorPayload {
  stage: string;
  error: string;
}

export type ChatSseEvent =
  | { type: "manager_thinking"; data: ManagerThinkingPayload }
  | { type: "manager_delta"; data: ManagerDeltaPayload }
  | { type: "plan_created"; data: Plan }
  | { type: "task_started"; data: TaskStartedPayload }
  | { type: "task_progress"; data: TaskProgressPayload }
  | { type: "task_completed"; data: TaskCompletedPayload }
  | { type: "task_failed"; data: TaskFailedPayload }
  | { type: "manager_report"; data: ManagerReportPayload }
  | { type: "error"; data: ChatErrorPayload }
  | { type: "done"; data: { ok: boolean } };

/* ---------- Conversations ---------- */

export interface ConversationMessage {
  id: number;
  role: string;
  content: string;
  created_at: string;
}

export interface ConversationSummary {
  id: number;
  title: string;
  project_id: number | null;
  total_cost_usd: number;
  started_at: string;
  updated_at: string;
  status: string;
  message_count: number;
}

export interface ConversationDetail extends ConversationSummary {
  messages: ConversationMessage[];
}

/* ---------- Files ---------- */

export interface FileRead {
  path: string;
  bytes: number;
  content: string;
  truncated: boolean;
}

/* ---------- Metrics ---------- */

export interface ModelBreakdown {
  cost_usd: number;
  count: number;
}

export interface SessionMetrics {
  date: string;
  total_cost_usd: number;
  total_input_tokens: number;
  total_output_tokens: number;
  by_model: Record<string, ModelBreakdown>;
  task_count: number;
}

/* ---------- Integrations ---------- */

export interface IntegrationOut {
  integration_type: "github" | "linear";
  token_hint: string;
  extra_config: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface IntegrationsResponse {
  integrations: IntegrationOut[];
}

export interface IntegrationTestResult {
  ok: boolean;
  message?: string;
  user?: string;
  email?: string;
}

/* ---------- Skills & MCPs ---------- */

export interface SkillInfo {
  name: string;
  scope: "project" | "global";
  chars: number;
  preview: string;
}

export interface SkillsResponse {
  skills: SkillInfo[];
}

export interface McpConfigResponse {
  config: Record<string, unknown>;
}

/* ---------- Memory ---------- */

export interface MemoryEntry {
  id: number;
  project_id: number | null;
  conversation_id: number | null;
  source_type: "decision" | "note" | "message";
  content: string;
  tags: string | null;
  created_at: string;
}

export interface MemorySearchEntry extends MemoryEntry {
  score: number;
}

export interface MemoryListResponse {
  mode: "list";
  items: MemoryEntry[];
}

export interface MemorySearchResponse {
  mode: "search";
  query: string;
  items: MemorySearchEntry[];
}

/* ---------- /api/events (bus global) ---------- */

export type GlobalSseEventType =
  | "manager_thinking"
  | "plan_created"
  | "task_started"
  | "task_progress"
  | "task_completed"
  | "task_failed"
  | "manager_report"
  | "employee_status"
  | "queue_status"
  | "error";

export interface GlobalSseEvent {
  type: GlobalSseEventType;
  timestamp: string;
  payload: Record<string, unknown>;
}
