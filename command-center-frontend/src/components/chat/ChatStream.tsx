"use client";

import * as React from "react";
import Image from "next/image";
import { Loader2, RefreshCw } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChatInput } from "@/components/chat/ChatInput";
import { MessageBubble } from "@/components/chat/MessageBubble";
import { PlanView } from "@/components/chat/PlanView";
import { PlanEditor } from "@/components/chat/PlanEditor";
import { ExecutionStepper } from "@/components/chat/ExecutionStepper";
import { TaskActivityCard } from "@/components/chat/TaskActivityCard";
import { BrushStroke, EnsoLogo } from "@/components/sumi";
import { Brain } from "lucide-react";
import { useChat } from "@/hooks/use-chat";
import { api } from "@/lib/api";
import { useDialogs } from "@/stores/dialogs";

const PHASE_LABEL: Record<string, string> = {
  thinking: "Gerente refletindo…",
  planning: "Compondo o plano…",
  awaiting_approval: "Aguardando aprovação do plano…",
  executing: "Funcionários em ação…",
  reporting: "Lavrando o relatório…",
  reconnecting: "Reconectando…",
};

export function ChatStream() {
  const {
    sendMessage,
    cancel,
    dispatchPlan,
    cancelPlan,
    messages,
    plan,
    tasks,
    phase,
    errorMessage,
    thinkingText,
    memoriesUsed,
  } = useChat();
  const scrollRef = React.useRef<HTMLDivElement>(null);

  // Registra `cancel` como handler global do Esc. Limpa no unmount pra
  // evitar handler stale apontando pra ChatStream desmontado.
  React.useEffect(() => {
    useDialogs.getState().setCancelHandler(cancel);
    return () => useDialogs.getState().setCancelHandler(null);
  }, [cancel]);

  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, plan, tasks, phase]);

  const busy = ["thinking", "planning", "executing", "reporting", "reconnecting"].includes(phase);
  const isAwaiting = phase === "awaiting_approval" && plan && plan.tasks.length > 0;
  const isEmpty = messages.length === 0 && !plan && !busy && !isAwaiting;

  // ── Empty state: hero full-bleed, sem scroll ──────────────────────────────
  if (isEmpty) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="relative min-h-0 flex-1 overflow-hidden">
          <Image
            src="/assets/mountain-hero.png"
            alt=""
            fill
            className="object-cover object-center"
            priority
            quality={90}
            sizes="(max-width: 768px) 100vw, (max-width: 1280px) calc(100vw - 256px), calc(100vw - 640px)"
          />
          {/* Gradiente: creme opaco à esquerda → transparente à direita */}
          <div className="absolute inset-0 bg-gradient-to-r from-[#F5F2ED] from-30% via-[#F5F2ED]/90 via-50% to-transparent" />

          <div className="relative z-10 flex h-full flex-col justify-center px-14 py-10">
            <EmptyContent onPick={sendMessage} />
          </div>
        </div>
        <ChatInput onSend={sendMessage} onCancel={cancel} busy={false} />
      </div>
    );
  }

  // ── Estado com mensagens ──────────────────────────────────────────────────
  return (
    <div className="flex h-full min-h-0 flex-col">
      <ScrollArea className="min-h-0 flex-1">
        <div ref={scrollRef} className="mx-auto flex w-full max-w-3xl flex-col gap-7 px-6 py-10">
          {messages.map((m) => (
            <MessageBubble
              key={m.id}
              role={m.role}
              content={m.content}
              ts={m.createdAt}
              model={m.model}
              cost_usd={m.cost_usd}
            />
          ))}

          {/* Badge de memória — aparece quando o Manager usou contexto histórico */}
          {memoriesUsed > 0 && (
            <div className="flex items-center gap-1.5 self-start rounded-full border border-violet-500/30 bg-violet-500/8 px-2.5 py-1 text-[11px] text-violet-600 dark:text-violet-400">
              <Brain className="h-3 w-3" />
              <span>
                Lembrei de {memoriesUsed} {memoriesUsed === 1 ? "conversa" : "conversas"} relevante{memoriesUsed === 1 ? "" : "s"}
              </span>
            </div>
          )}

          {/* Stepper de execução — só aparece quando há tasks reais (não em small talk) */}
          {plan && plan.tasks.length > 0 && (
            <ExecutionStepper
              phase={phase}
              taskCount={Object.keys(tasks).length}
              doneCount={Object.values(tasks).filter((t) => t.status === "done").length}
            />
          )}

          {/* PlanEditor: aparece quando o plano chega e está aguardando aprovação */}
          {isAwaiting && plan && (
            <PlanEditor
              plan={plan}
              onDispatch={(editedTasks, mode) => void dispatchPlan(editedTasks, mode)}
              onCancel={cancelPlan}
            />
          )}

          {/* TaskActivityCards: durante e depois da execução, com file changes + actions stream */}
          {!isAwaiting && plan && plan.tasks.length > 0 && (
            <div className="space-y-2">
              {Object.values(tasks)
                .sort((a, b) => a.index - b.index)
                .map((t) => (
                  <TaskActivityCard key={t.index} task={t} />
                ))}
            </div>
          )}

          {busy && (
            <div className="flex flex-col gap-2 text-sm text-muted-foreground">
              <div className="flex items-center gap-2.5">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span className="font-display italic">
                  {PHASE_LABEL[phase] ?? "Processando…"}
                </span>
              </div>
              {phase === "thinking" && thinkingText && (
                <pre className="ml-6 max-h-48 overflow-y-auto whitespace-pre-wrap rounded-md border border-border/50 bg-muted/30 px-3 py-2 font-mono text-xs leading-relaxed text-foreground/80">
                  {thinkingText}
                </pre>
              )}
            </div>
          )}

          {errorMessage && (
            <div className="rounded-2xl border border-destructive/30 bg-destructive/8 p-4 shadow-zen">
              <div className="font-display font-medium text-destructive">Falha</div>
              <pre className="mt-2 whitespace-pre-wrap font-mono text-xs leading-relaxed text-destructive/85">
                {errorMessage}
              </pre>
            </div>
          )}
        </div>
      </ScrollArea>

      <ChatInput onSend={sendMessage} onCancel={cancel} busy={busy} />
    </div>
  );
}

const FALLBACK_SAMPLES = [
  "Adicione testes E2E ao MedDecide cobrindo o fluxo de triagem.",
  "Refatore o módulo de execução do trading-agent para usar asyncio.",
  "Crie o esqueleto inicial do wine-scanner-br (FastAPI + SQLite).",
  "Liste os 4 projetos numa tabela e diga qual modelo usaria pra cada tipo de tarefa.",
];

function EmptyContent({ onPick }: { onPick: (s: string) => void }) {
  const queryClient = useQueryClient();
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["suggestions"],
    queryFn: () => api.getSuggestions(),
    staleTime: 1000 * 60 * 30, // 30min — backend já tem cache de 1h
    retry: 1,
  });

  const samples = (data?.suggestions && data.suggestions.length > 0)
    ? data.suggestions
    : FALLBACK_SAMPLES;

  const refresh = React.useCallback(() => {
    void queryClient.fetchQuery({
      queryKey: ["suggestions"],
      queryFn: () => api.getSuggestions(true),
    });
  }, [queryClient]);

  return (
    <div className="max-w-sm space-y-6">
      <EnsoLogo label="始" size={52} />

      <div className="space-y-3">
        <h2 className="font-display text-3xl font-medium leading-tight tracking-tight">
          Pronto para o briefing.
        </h2>
        <p className="text-[15px] leading-relaxed text-muted-foreground">
          Conte ao gerente o que precisa ser feito.{" "}
          Ele decompõe e despacha — até três funcionários em paralelo.
        </p>
      </div>

      <BrushStroke variant="horizontal" className="h-3 w-36 text-foreground/40" />

      <div className="space-y-2">
        <div className="flex items-center justify-between px-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          <span>
            {data?.source === "llm"
              ? "Sugestões do CTO virtual"
              : data?.source === "rules"
                ? "Sugestões"
                : "Carregando…"}
          </span>
          <button
            onClick={refresh}
            disabled={isLoading || isFetching}
            className="flex items-center gap-1 transition-colors hover:text-foreground disabled:opacity-50"
            aria-label="Regenerar sugestões"
            title="Regenerar sugestões"
          >
            <RefreshCw className={`h-3 w-3 ${isFetching ? "animate-spin" : ""}`} />
          </button>
        </div>
        <div className="grid gap-2">
          {samples.map((s) => (
            <button
              key={s}
              onClick={() => onPick(s)}
              className="rounded-xl border border-border bg-[#F5F2ED]/80 px-4 py-3 text-left text-[14px] leading-relaxed text-muted-foreground shadow-zen backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:bg-[#F5F2ED] hover:text-foreground"
            >
              {s}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
