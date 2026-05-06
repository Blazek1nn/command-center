"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Bot, User, Sparkles, Zap, Brain } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import type { ChatRole } from "@/stores/chat-store";
import type { ModelAlias } from "@/lib/types";

interface MessageBubbleProps {
  role: ChatRole;
  content: string;
  ts: number;
  model?: ModelAlias;
  cost_usd?: number;
}

const MODEL_ICONS: Record<ModelAlias, { icon: typeof Sparkles; label: string; color: string }> = {
  haiku: { icon: Zap, label: "Haiku", color: "text-emerald-500" },
  sonnet: { icon: Brain, label: "Sonnet", color: "text-amber-500" },
  opus: { icon: Sparkles, label: "Opus", color: "text-rose-500" },
};

function formatCost(cost: number): string {
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  if (cost < 1) return `$${cost.toFixed(3)}`;
  return `$${cost.toFixed(2)}`;
}

// Memoizado: ChatStream re-renderiza a lista a cada SSE event. Sem React.memo,
// cada bubble re-processa markdown (caro). Comparação rasa nos props basta —
// content e ts identificam univocamente uma mensagem imutável.
export const MessageBubble = React.memo(MessageBubbleInner);

function MessageBubbleInner({ role, content, ts, model, cost_usd }: MessageBubbleProps) {
  const isCeo = role === "ceo";
  const modelMeta = model ? MODEL_ICONS[model] : null;
  const ModelIcon = modelMeta?.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className={cn("flex gap-3", isCeo ? "justify-end" : "justify-start")}
    >
      {!isCeo && (
        <Avatar className="mt-0.5 h-9 w-9 shrink-0">
          <AvatarFallback
            className={
              role === "manager"
                ? "border border-primary/40 bg-primary/8 text-primary"
                : "bg-secondary text-muted-foreground"
            }
          >
            {role === "manager" ? (
              <span className="font-display text-sm font-medium">管</span>
            ) : (
              <Bot className="h-4 w-4" />
            )}
          </AvatarFallback>
        </Avatar>
      )}

      <div
        className={cn(
          "prose-chat max-w-[82%] rounded-2xl px-5 py-4 text-base leading-relaxed",
          isCeo
            ? "border border-primary/25 bg-primary/8 text-foreground shadow-zen"
            : role === "manager"
              ? "border border-border bg-card text-foreground shadow-zen"
              : "border border-dashed border-border bg-transparent italic text-muted-foreground",
        )}
      >
        <div className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          <span className="font-medium">
            {isCeo ? "CEO (você)" : role === "manager" ? "Gerente" : "Sistema"}
          </span>
          <span>·</span>
          <time>{new Date(ts).toLocaleTimeString()}</time>
          {modelMeta && ModelIcon && (
            <>
              <span>·</span>
              <span
                className={cn(
                  "flex items-center gap-1 rounded-full border border-border/50 px-1.5 py-0.5 normal-case tracking-normal",
                  modelMeta.color,
                )}
                title={`Processado pelo ${modelMeta.label}`}
              >
                <ModelIcon className="h-3 w-3" />
                <span className="text-[10px] font-medium">{modelMeta.label}</span>
              </span>
            </>
          )}
          {typeof cost_usd === "number" && cost_usd > 0 && (
            <>
              <span>·</span>
              <span
                className="rounded-full border border-border/50 px-1.5 py-0.5 font-mono normal-case tracking-normal text-foreground/70"
                title="Custo total dessa interação (Manager + workers)"
              >
                {formatCost(cost_usd)}
              </span>
            </>
          )}
        </div>
        {isCeo ? (
          <div className="whitespace-pre-wrap break-words">{content}</div>
        ) : (
          <div className="prose-chat break-words">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              // rehype-sanitize bloqueia HTML perigoso (ex: <img onerror=...>).
              // Manager devolve markdown puro, então sanitização aqui é defense-in-depth.
              rehypePlugins={[rehypeSanitize]}
            >
              {content}
            </ReactMarkdown>
          </div>
        )}
      </div>

      {isCeo && (
        <Avatar className="mt-0.5 h-9 w-9 shrink-0">
          <AvatarFallback className="bg-secondary text-foreground">
            <User className="h-4 w-4" />
          </AvatarFallback>
        </Avatar>
      )}
    </motion.div>
  );
}
