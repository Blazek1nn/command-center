import type {
  ConversationDetail,
  ConversationSummary,
  DispatchEstimate,
  Employee,
  FileRead,
  IntegrationOut,
  IntegrationTestResult,
  IntegrationsResponse,
  McpConfigResponse,
  MemoryListResponse,
  MemorySearchResponse,
  Project,
  ProjectInput,
  SessionMetrics,
  SkillsResponse,
  SuggestionsResponse,
  Task,
  TaskInput,
  TaskSpec,
  TaskStatus,
} from "./types";

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = await res.text().catch(() => null);
    }
    throw new ApiError(res.status, `HTTP ${res.status} on ${path}`, body);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  // Projects
  listProjects: () => request<Project[]>("/api/projects"),
  getProject: (id: number) => request<Project>(`/api/projects/${id}`),
  createProject: (body: ProjectInput) =>
    request<Project>("/api/projects", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  // Tasks
  listTasks: (params: { project_id?: number; status?: TaskStatus; limit?: number } = {}) => {
    const search = new URLSearchParams();
    if (params.project_id != null) search.set("project_id", String(params.project_id));
    if (params.status) search.set("status", params.status);
    if (params.limit) search.set("limit", String(params.limit));
    const qs = search.toString();
    return request<Task[]>(`/api/tasks${qs ? `?${qs}` : ""}`);
  },
  getTask: (id: number) => request<Task>(`/api/tasks/${id}`),
  cancelTask: (id: number) =>
    request<{ cancelled: boolean }>(`/api/tasks/${id}/cancel`, { method: "POST" }),
  createTask: (body: TaskInput) =>
    request<Task>("/api/tasks", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  retryTask: (id: number) =>
    request<Task>(`/api/tasks/${id}/retry`, { method: "POST" }),

  // Employees
  listEmployees: () => request<Employee[]>("/api/employees"),

  // Metrics
  getMetricsSession: () => request<SessionMetrics>("/api/metrics/session"),

  // Files
  readFile: (project: string, path: string) => {
    const search = new URLSearchParams({ project, path }).toString();
    return request<FileRead>(`/api/files/read?${search}`);
  },

  // Conversations
  listConversations: () => request<ConversationSummary[]>("/api/conversations"),
  getConversation: (id: number) => request<ConversationDetail>(`/api/conversations/${id}`),
  createConversation: (body: { title?: string; project_id?: number | null }) =>
    request<ConversationSummary>("/api/conversations", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  deleteConversation: (id: number) =>
    request<void>(`/api/conversations/${id}`, { method: "DELETE" }),

  // Suggestions
  getSuggestions: (refresh = false) =>
    request<SuggestionsResponse>(`/api/suggestions${refresh ? "?refresh=true" : ""}`),

  // Dispatch — estima custo total de um plano antes de rodar
  estimateDispatch: (tasks: TaskSpec[]) =>
    request<DispatchEstimate>("/api/dispatch/estimate", {
      method: "POST",
      body: JSON.stringify({ tasks }),
    }),

  // Skills & MCPs
  listSkills: (projectId: number) =>
    request<SkillsResponse>(`/api/projects/${projectId}/skills`),
  getSkill: (projectId: number, name: string) =>
    request<{ name: string; content: string }>(`/api/projects/${projectId}/skills/${name}`),
  createSkill: (projectId: number, name: string, content: string) =>
    request<{ name: string; path: string; chars: number }>(`/api/projects/${projectId}/skills`, {
      method: "POST",
      body: JSON.stringify({ name, content }),
    }),
  deleteSkill: (projectId: number, name: string) =>
    request<{ deleted: boolean }>(`/api/projects/${projectId}/skills/${name}`, { method: "DELETE" }),
  getMcpConfig: (projectId: number) =>
    request<McpConfigResponse>(`/api/projects/${projectId}/mcps`),
  saveMcpConfig: (projectId: number, config: Record<string, unknown>) =>
    request<{ saved: boolean; path: string }>(`/api/projects/${projectId}/mcps`, {
      method: "PUT",
      body: JSON.stringify({ config }),
    }),
  listGlobalSkills: () =>
    request<SkillsResponse>("/api/skills/global"),
  createGlobalSkill: (name: string, content: string) =>
    request<{ name: string; path: string; chars: number }>("/api/skills/global", {
      method: "POST",
      body: JSON.stringify({ name, content }),
    }),
  deleteGlobalSkill: (name: string) =>
    request<{ deleted: boolean }>(`/api/skills/global/${name}`, { method: "DELETE" }),

  // Memory
  listMemory: (params: { project_id?: number; limit?: number } = {}) => {
    const search = new URLSearchParams();
    if (params.project_id != null) search.set("project_id", String(params.project_id));
    if (params.limit != null) search.set("limit", String(params.limit));
    const qs = search.toString();
    return request<MemoryListResponse>(`/api/memory${qs ? `?${qs}` : ""}`);
  },
  searchMemory: (q: string, project_id?: number) => {
    const search = new URLSearchParams({ q });
    if (project_id != null) search.set("project_id", String(project_id));
    return request<MemorySearchResponse>(`/api/memory?${search.toString()}`);
  },
  deleteMemory: (id: number) =>
    request<{ deleted: boolean }>(`/api/memory/${id}`, { method: "DELETE" }),

  // Integrations
  listIntegrations: () =>
    request<IntegrationsResponse>("/api/integrations"),
  upsertIntegration: (integration_type: string, token: string, extra_config?: Record<string, unknown>) =>
    request<{ saved: boolean; type: string }>("/api/integrations", {
      method: "POST",
      body: JSON.stringify({ integration_type, token, extra_config }),
    }),
  deleteIntegration: (type: string) =>
    request<{ deleted: boolean }>(`/api/integrations/${type}`, { method: "DELETE" }),
  testIntegration: (type: string) =>
    request<IntegrationTestResult>(`/api/integrations/${type}/test`),

  // Health
  health: () => request<{ status: string }>("/health"),
};

export { ApiError };
