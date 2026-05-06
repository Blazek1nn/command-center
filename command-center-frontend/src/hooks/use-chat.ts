"use client";

import { useCallback, useRef } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { streamSse, safeJson } from "@/lib/sse";
import { useChatStore } from "@/stores/chat-store";
import { loadAutoDispatch } from "@/components/chat/PlanEditor";
import type {
  ChatErrorPayload,
  ManagerDeltaPayload,
  ManagerReportPayload,
  ManagerThinkingPayload,
  ModelAlias,
  Plan,
  PrCreatedPayload,
  TaskCompletedPayload,
  TaskFailedPayload,
  TaskProgressPayload,
  TaskSpec,
  TaskStartedPayload,
  WorkerActionPayload,
} from "@/lib/types";

export type ModelChoice = ModelAlias | "auto";

function newId(): string {
  return Math.random().toString(36).slice(2, 11);
}

/**
 * useChat() — orquestra o fluxo SSE end-to-end com /api/chat.
 *
 * - Mantém histórico de mensagens (CEO + manager) em zustand
 * - Reflete fases: thinking → planning → executing → reporting → done
 * - Atualiza tasks à medida que eventos chegam
 */
export function useChat() {
  const store = useChatStore();
  const queryClient = useQueryClient();
  const abortRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(
    async (message: string, modelChoice: ModelChoice = "auto") => {
      const trimmed = message.trim();
      if (!trimmed) return;

      // Cancela um envio anterior em andamento
      abortRef.current?.abort();

      // Reset *parcial*: mantemos o histórico, mas zeramos plan/tasks.
      const prevMessages = useChatStore.getState().messages;
      useChatStore.setState({
        messages: [
          ...prevMessages,
          {
            id: newId(),
            role: "ceo",
            content: trimmed,
            createdAt: Date.now(),
            requestedModel: modelChoice,
          },
        ],
        plan: null,
        tasks: {},
        taskIdToIndex: {},
        thinkingText: "",
        activeModel: null,
        phase: "thinking",
        errorMessage: null,
      });

      const controller = new AbortController();
      abortRef.current = controller;

      // Captura conversation_id ATIVO no momento do envio. Se usuário trocar
      // de conversa antes do primeiro evento SSE chegar, não vamos rotear
      // tasks pra conversa errada — comparamos contra esse snapshot.
      const conversationIdSnapshot = useChatStore.getState().currentConversationId;

      // Flag local que controla o retry: só retentamos antes de plan_created.
      let planCreated = false;

      try {
        // Auto-dispatch toggle: false (default) = plano só, usuário aprova
        // antes de gastar tokens dos workers. true = dispatcher roda direto.
        const autoDispatch = loadAutoDispatch();

        const stream = streamSse("/api/chat", {
          method: "POST",
          body: JSON.stringify({
            message: trimmed,
            conversation_id: conversationIdSnapshot,
            history: prevMessages.map((m) => ({
              role: m.role,
              content: m.content,
            })),
            // "auto" → não envia, deixa o backend decidir (smalltalk fast-path).
            // explicit haiku/sonnet/opus → força aquele modelo no Manager.
            manager_model: modelChoice === "auto" ? null : modelChoice,
            // Quando o usuário força um modelo, desliga o auto-detect smalltalk
            force_planning: modelChoice !== "auto",
            // Plan-only: não dispara workers. Cliente vai chamar /api/dispatch
            // separado depois que o usuário editar/aprovar o plano.
            plan_only: !autoDispatch,
          }),
          signal: controller.signal,
          shouldAutoRetry: () => !planCreated,
          onRetry: () => {
            store.setPhase("reconnecting");
            toast.message("Reconectando…", { duration: 2000 });
          },
        });

        for await (const evt of stream) {
          const payload = safeJson<unknown>(evt.data);
          if (payload == null) continue;

          switch (evt.event) {
            case "conversation_started": {
              const p = payload as { conversation_id: number };
              if (useChatStore.getState().currentConversationId == null) {
                useChatStore.getState().setConversationId(p.conversation_id);
                // Update URL without remount
                if (typeof window !== "undefined") {
                  window.history.replaceState(null, "", `/chat/${p.conversation_id}`);
                }
                queryClient.invalidateQueries({ queryKey: ["conversations"] });
              }
              break;
            }
            case "manager_thinking": {
              const p = payload as ManagerThinkingPayload;
              store.setPhase("thinking");
              if (p.model) store.setActiveModel(p.model);
              break;
            }
            case "manager_delta": {
              const p = payload as ManagerDeltaPayload;
              store.appendThinking(p.text);
              break;
            }
            case "plan_created": {
              const rawPlan = payload as Plan & { memories_used?: number };
              planCreated = true;
              store.setPlan(rawPlan);
              if (rawPlan.memories_used != null) {
                store.setMemoriesUsed(rawPlan.memories_used);
              }
              // Se plan_only E tem tasks: parar em "awaiting_approval" pra renderizar PlanEditor.
              // Se 0 tasks (small talk / direct_reply): vai "thinking" → backend manda
              // manager_report imediatamente, sem passar por "executing".
              // Se auto-dispatch: vai pra "executing" direto.
              if (!loadAutoDispatch() && rawPlan.tasks && rawPlan.tasks.length > 0) {
                store.setPhase("awaiting_approval");
              } else if (rawPlan.tasks && rawPlan.tasks.length > 0) {
                store.setPhase("executing");
              }
              // else: 0 tasks — mantém "thinking" até manager_report chegar
              break;
            }
            case "task_started": {
              const p = payload as TaskStartedPayload;
              store.bindTaskId(p.task_id, p.index);
              store.upsertTask(p.index, {
                task_id: p.task_id,
                status: "running",
                employee: p.employee,
              });
              break;
            }
            case "task_progress": {
              const p = payload as TaskProgressPayload;
              const cur = useChatStore.getState().tasks[p.index];
              store.upsertTask(p.index, {
                output: (cur?.output ?? "") + (p.chunk ?? ""),
              });
              break;
            }
            case "task_completed": {
              const p = payload as TaskCompletedPayload;
              store.upsertTask(p.index, {
                status: "done",
                output: p.summary,
                cost_usd: p.cost_usd,
                duration_ms: p.duration_ms,
                input_tokens: p.input_tokens ?? 0,
                output_tokens: p.output_tokens ?? 0,
                files_touched: p.files_touched ?? [],
              });
              break;
            }
            case "task_failed": {
              const p = payload as TaskFailedPayload;
              store.upsertTask(p.index, {
                status: "failed",
                error: p.error,
                permission_blocked: p.permission_blocked,
              });
              break;
            }
            case "worker_action": {
              const p = payload as WorkerActionPayload;
              store.appendTaskAction(p.index, {
                tool: p.tool,
                summary: p.input_summary,
                ts: Date.now(),
              });
              break;
            }
            case "manager_report": {
              const p = payload as ManagerReportPayload;
              store.applyOutcomes(p.outcomes ?? []);
              if (p.usage) store.applyUsage(p.usage);
              const activeModel = useChatStore.getState().activeModel;
              store.appendMessage({
                id: newId(),
                role: "manager",
                content: p.report,
                createdAt: Date.now(),
                model: activeModel ?? undefined,
                cost_usd: p.usage?.total.cost_usd,
              });
              store.setPhase("reporting");
              break;
            }
            case "pr_created": {
              const p = payload as PrCreatedPayload;
              store.upsertTask(p.index, { pr_url: p.pr_url });
              toast.success(`PR criado: ${p.pr_url}`, { duration: 8000 });
              break;
            }
            case "error": {
              const p = payload as ChatErrorPayload & { exception?: string; traceback?: string };
              const msg = p.error || p.exception || "erro desconhecido";
              store.setError(`[${p.stage}] ${msg}${p.traceback ? "\n\n" + p.traceback : ""}`);
              toast.error(`Falha (${p.stage}): ${msg}`);
              break;
            }
            case "done": {
              store.setPhase("done");
              await queryClient.invalidateQueries({ queryKey: ["tasks"] });
              await queryClient.invalidateQueries({ queryKey: ["employees"] });
              break;
            }
            default:
              break;
          }
        }
      } catch (err) {
        const e = err as Error;
        if (e.name === "AbortError") return;
        store.setError(e.message);
        if (planCreated) {
          // Já recebemos plano — retry manual evita re-cobrar Manager
          toast.error(`Conexão perdida. ${e.message}`, {
            action: {
              label: "Refazer",
              onClick: () => void sendMessage(trimmed, modelChoice),
            },
            duration: 10000,
          });
        } else {
          // Auto-retry já tentou e falhou — mostra retry manual igualmente
          toast.error(`Falha ao conectar. ${e.message}`, {
            action: {
              label: "Tentar novamente",
              onClick: () => void sendMessage(trimmed, modelChoice),
            },
            duration: 10000,
          });
        }
      }
    },
    [store, queryClient],
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    if (
      ["thinking", "planning", "awaiting_approval", "executing", "reporting", "reconnecting"].includes(
        useChatStore.getState().phase,
      )
    ) {
      useChatStore.setState({ phase: "idle" });
    }
  }, []);

  /** Dispatch um plano (talvez editado pelo CEO) via /api/dispatch e streamea SSE. */
  const dispatchPlan = useCallback(
    async (tasks: TaskSpec[], execution_mode: "parallel" | "sequential" = "sequential") => {
      const conversationId = useChatStore.getState().currentConversationId;
      if (conversationId == null) {
        toast.error("Sem conversation_id — recarregue a página.");
        return;
      }
      if (tasks.length === 0) return;

      // Atualiza o plan no store (substitui o original pelo editado)
      store.setPlan({
        understanding: useChatStore.getState().plan?.understanding ?? "",
        execution_mode,
        tasks,
        estimated_minutes: 0,
        direct_reply: null,
        critique: useChatStore.getState().plan?.critique ?? null,
      });
      store.setPhase("executing");

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const stream = streamSse("/api/dispatch", {
          method: "POST",
          body: JSON.stringify({
            conversation_id: conversationId,
            understanding: useChatStore.getState().plan?.understanding ?? "",
            tasks,
            execution_mode,
            reporter_model: "sonnet",
          }),
          signal: controller.signal,
          shouldAutoRetry: () => false, // dispatch já consumiu Manager — sem retry barato
        });

        for await (const evt of stream) {
          const payload = safeJson<unknown>(evt.data);
          if (payload == null) continue;

          switch (evt.event) {
            case "task_started": {
              const p = payload as TaskStartedPayload;
              store.bindTaskId(p.task_id, p.index);
              store.upsertTask(p.index, {
                task_id: p.task_id,
                status: "running",
                employee: p.employee,
              });
              break;
            }
            case "task_progress": {
              const p = payload as TaskProgressPayload;
              const cur = useChatStore.getState().tasks[p.index];
              store.upsertTask(p.index, {
                output: (cur?.output ?? "") + (p.chunk ?? ""),
              });
              break;
            }
            case "task_completed": {
              const p = payload as TaskCompletedPayload;
              store.upsertTask(p.index, {
                status: "done",
                output: p.summary,
                cost_usd: p.cost_usd,
                duration_ms: p.duration_ms,
                input_tokens: p.input_tokens ?? 0,
                output_tokens: p.output_tokens ?? 0,
                files_touched: p.files_touched ?? [],
              });
              break;
            }
            case "task_failed": {
              const p = payload as TaskFailedPayload;
              store.upsertTask(p.index, {
                status: "failed",
                error: p.error,
                permission_blocked: p.permission_blocked,
              });
              break;
            }
            case "worker_action": {
              const p = payload as WorkerActionPayload;
              store.appendTaskAction(p.index, {
                tool: p.tool,
                summary: p.input_summary,
                ts: Date.now(),
              });
              break;
            }
            case "manager_report": {
              const p = payload as ManagerReportPayload;
              store.applyOutcomes(p.outcomes ?? []);
              if (p.usage) store.applyUsage(p.usage);
              const activeModel = useChatStore.getState().activeModel;
              store.appendMessage({
                id: newId(),
                role: "manager",
                content: p.report,
                createdAt: Date.now(),
                model: activeModel ?? undefined,
                cost_usd: p.usage?.total.cost_usd,
              });
              store.setPhase("reporting");
              break;
            }
            case "pr_created": {
              const p = payload as PrCreatedPayload;
              store.upsertTask(p.index, { pr_url: p.pr_url });
              toast.success(`PR criado: ${p.pr_url}`, { duration: 8000 });
              break;
            }
            case "error": {
              const p = payload as ChatErrorPayload;
              store.setError(`[${p.stage}] ${p.error}`);
              toast.error(`Falha (${p.stage}): ${p.error}`);
              break;
            }
            case "done": {
              store.setPhase("done");
              await queryClient.invalidateQueries({ queryKey: ["tasks"] });
              await queryClient.invalidateQueries({ queryKey: ["employees"] });
              break;
            }
            default:
              break;
          }
        }
      } catch (err) {
        const e = err as Error;
        if (e.name === "AbortError") return;
        store.setError(e.message);
        toast.error(`Dispatch falhou: ${e.message}`);
      }
    },
    [store, queryClient],
  );

  /** Cancela o plano que está aguardando aprovação (limpa state + volta pro idle). */
  const cancelPlan = useCallback(() => {
    if (useChatStore.getState().phase === "awaiting_approval") {
      useChatStore.setState({ plan: null, tasks: {}, phase: "idle" });
    }
  }, []);

  return {
    sendMessage,
    cancel,
    dispatchPlan,
    cancelPlan,
    messages: store.messages,
    plan: store.plan,
    tasks: store.tasks,
    phase: store.phase,
    errorMessage: store.errorMessage,
    thinkingText: store.thinkingText,
    usage: store.usage,
    sessionUsage: store.sessionUsage,
    memoriesUsed: store.memoriesUsed,
  };
}
