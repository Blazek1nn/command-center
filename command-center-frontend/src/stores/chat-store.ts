"use client";

import { create } from "zustand";
import type { FileTouch, ModelAlias, Plan, TaskOutcome, UsageSummary } from "@/lib/types";

export interface WorkerAction {
  tool: string;
  summary: string;
  ts: number;
}

export type TaskRunStatus = "pending" | "running" | "done" | "failed" | "cancelled";

export type ModelChoice = ModelAlias | "auto";

export interface TaskRun {
  index: number;
  task_id: number | null;
  title: string;
  model: string;
  project: string | null;
  status: TaskRunStatus;
  employee: string | null;
  output: string;
  error: string | null;
  cost_usd: number | null;
  duration_ms: number | null;
  input_tokens: number;
  output_tokens: number;
  /** Tool uses observados em tempo real (Frente β). Acumulados via SSE worker_action. */
  actions: WorkerAction[];
  /** Arquivos modificados (Write/Edit/etc). Vem no payload task_completed. */
  files_touched: FileTouch[];
  /** URL do PR criado automaticamente (Frente ζ). null = auto-PR não ativado ou não gerado. */
  pr_url: string | null;
  /** Sprint 3: true se task falhou por permission prompt detectado pelo watchdog. */
  permission_blocked?: boolean;
}

export type ChatRole = "ceo" | "manager" | "system";

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: number;
  /** Modelo que processou esta mensagem (manager) ou foi solicitado (ceo). */
  model?: ModelAlias;
  /** Para mensagens do CEO: a escolha original do dropdown ("auto" | modelo). */
  requestedModel?: ModelChoice;
  /** Custo total dessa interação em USD (usado em mensagens do manager). */
  cost_usd?: number;
}

export type StreamPhase =
  | "idle"
  | "thinking"
  | "planning"
  | "awaiting_approval"  // plan_only=true terminou — esperando CEO clicar "Despachar"
  | "executing"
  | "reporting"
  | "reconnecting"
  | "done"
  | "error";

interface ChatState {
  messages: ChatMessage[];
  plan: Plan | null;
  tasks: Record<number, TaskRun>;
  taskIdToIndex: Record<number, number>;
  phase: StreamPhase;
  errorMessage: string | null;
  thinkingText: string;
  /** Modelo que está rodando AGORA (resolvido pelo backend após smalltalk fast-path). */
  activeModel: ModelAlias | null;
  usage: UsageSummary | null;
  /** Acumulado da sessão (todas as conversas desde o page-load). */
  sessionUsage: UsageSummary;
  /** Quantas memórias foram injetadas no plano atual (Frente η). */
  memoriesUsed: number;

  currentConversationId: number | null;

  appendMessage: (m: ChatMessage) => void;
  reset: () => void;
  setPhase: (phase: StreamPhase) => void;
  setError: (msg: string | null) => void;
  setPlan: (plan: Plan) => void;
  appendThinking: (text: string) => void;
  clearThinking: () => void;
  setActiveModel: (m: ModelAlias | null) => void;
  setMemoriesUsed: (n: number) => void;
  upsertTask: (idx: number, patch: Partial<TaskRun>) => void;
  appendTaskAction: (idx: number, action: WorkerAction) => void;
  bindTaskId: (taskId: number, idx: number) => void;
  applyOutcomes: (outcomes: TaskOutcome[]) => void;
  applyUsage: (usage: UsageSummary) => void;
  setConversationId: (id: number | null) => void;
  hydrateMessages: (messages: ChatMessage[]) => void;
}

const emptyBucket = () => ({ cost_usd: 0, input_tokens: 0, output_tokens: 0 });
const emptyUsage = (): UsageSummary => ({
  manager: emptyBucket(),
  workers: emptyBucket(),
  total: emptyBucket(),
});

const initialState: Pick<
  ChatState,
  | "messages"
  | "plan"
  | "tasks"
  | "taskIdToIndex"
  | "phase"
  | "errorMessage"
  | "thinkingText"
  | "activeModel"
  | "usage"
  | "sessionUsage"
  | "memoriesUsed"
  | "currentConversationId"
> = {
  messages: [],
  plan: null,
  tasks: {},
  taskIdToIndex: {},
  phase: "idle",
  errorMessage: null,
  thinkingText: "",
  activeModel: null,
  usage: null,
  sessionUsage: emptyUsage(),
  memoriesUsed: 0,
  currentConversationId: null,
};

export const useChatStore = create<ChatState>((set) => ({
  ...initialState,

  appendMessage: (m) =>
    set((s) => ({ messages: [...s.messages, m] })),

  reset: () => set({ ...initialState }),

  setPhase: (phase) => set({ phase }),
  setError: (msg) => set({ errorMessage: msg, phase: msg ? "error" : "idle" }),

  setPlan: (plan) => {
    const tasks: Record<number, TaskRun> = {};
    plan.tasks.forEach((t, idx) => {
      tasks[idx] = {
        index: idx,
        task_id: null,
        title: t.title,
        model: t.model,
        project: t.project,
        status: "pending",
        employee: null,
        output: "",
        error: null,
        cost_usd: null,
        duration_ms: null,
        input_tokens: 0,
        output_tokens: 0,
        actions: [],
        files_touched: [],
        pr_url: null,
      };
    });
    set({ plan, tasks, taskIdToIndex: {}, usage: null, thinkingText: "" });
  },

  appendThinking: (text) =>
    set((s) => ({ thinkingText: s.thinkingText + text })),

  clearThinking: () => set({ thinkingText: "" }),

  setActiveModel: (m) => set({ activeModel: m }),

  setMemoriesUsed: (n) => set({ memoriesUsed: n }),

  upsertTask: (idx, patch) =>
    set((s) => {
      const prev = s.tasks[idx];
      if (!prev) return s;
      return { tasks: { ...s.tasks, [idx]: { ...prev, ...patch } } };
    }),

  appendTaskAction: (idx, action) =>
    set((s) => {
      const prev = s.tasks[idx];
      if (!prev) return s;
      // Limita a 50 actions por task pra não inflar memória durante runs longos
      const actions = prev.actions.length >= 50
        ? [...prev.actions.slice(-49), action]
        : [...prev.actions, action];
      return { tasks: { ...s.tasks, [idx]: { ...prev, actions } } };
    }),

  bindTaskId: (taskId, idx) =>
    set((s) => ({ taskIdToIndex: { ...s.taskIdToIndex, [taskId]: idx } })),

  applyOutcomes: (outcomes) =>
    set((s) => {
      const next = { ...s.tasks };
      for (const o of outcomes) {
        const cur = next[o.index];
        if (!cur) continue;
        next[o.index] = {
          ...cur,
          task_id: o.task_id ?? cur.task_id,
          status: o.status,
          output: o.output ?? cur.output,
          error: o.error,
          cost_usd: o.cost_usd,
          duration_ms: o.duration_ms,
          input_tokens: o.input_tokens ?? cur.input_tokens,
          output_tokens: o.output_tokens ?? cur.output_tokens,
        };
      }
      return { tasks: next };
    }),

  setConversationId: (id) => set({ currentConversationId: id }),
  hydrateMessages: (messages) => set({ messages }),

  applyUsage: (usage) =>
    set((s) => ({
      usage,
      sessionUsage: {
        manager: {
          cost_usd: s.sessionUsage.manager.cost_usd + usage.manager.cost_usd,
          input_tokens: s.sessionUsage.manager.input_tokens + usage.manager.input_tokens,
          output_tokens: s.sessionUsage.manager.output_tokens + usage.manager.output_tokens,
        },
        workers: {
          cost_usd: s.sessionUsage.workers.cost_usd + usage.workers.cost_usd,
          input_tokens: s.sessionUsage.workers.input_tokens + usage.workers.input_tokens,
          output_tokens: s.sessionUsage.workers.output_tokens + usage.workers.output_tokens,
        },
        total: {
          cost_usd: s.sessionUsage.total.cost_usd + usage.total.cost_usd,
          input_tokens: s.sessionUsage.total.input_tokens + usage.total.input_tokens,
          output_tokens: s.sessionUsage.total.output_tokens + usage.total.output_tokens,
        },
      },
    })),
}));
