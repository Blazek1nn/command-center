"use client";

import { Coins, ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import { useChatStore } from "@/stores/chat-store";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { cn, formatCost } from "@/lib/utils";

function fmtTokens(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}

interface Props {
  compact?: boolean;
}

export function TokenMeter({ compact = false }: Props) {
  const sessionUsage = useChatStore((s) => s.sessionUsage);
  const total = sessionUsage.total;

  return (
    <HoverCard openDelay={150}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border border-border bg-card/70 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-all hover:border-primary/40 hover:text-foreground",
            compact && "px-2",
          )}
          aria-label="Consumo da sessão"
        >
          <Coins className="h-3.5 w-3.5 text-primary" />
          <span className="font-mono">{formatCost(total.cost_usd || null)}</span>
          {!compact && (
            <span className="hidden font-mono text-[11px] sm:inline">
              · {fmtTokens(total.input_tokens + total.output_tokens)} tok
            </span>
          )}
        </button>
      </HoverCardTrigger>
      <HoverCardContent className="w-72" align="end">
        <div className="space-y-3 text-xs">
          <div>
            <div className="mb-1 font-semibold uppercase tracking-wider text-muted-foreground">
              Consumo da sessão
            </div>
            <Row label="Total" cost={total.cost_usd} input={total.input_tokens} output={total.output_tokens} bold />
          </div>
          <div className="space-y-1.5 border-t border-border pt-2">
            <Row
              label="Gerente (Opus)"
              cost={sessionUsage.manager.cost_usd}
              input={sessionUsage.manager.input_tokens}
              output={sessionUsage.manager.output_tokens}
            />
            <Row
              label="Workers"
              cost={sessionUsage.workers.cost_usd}
              input={sessionUsage.workers.input_tokens}
              output={sessionUsage.workers.output_tokens}
            />
          </div>
          <p className="text-[10px] leading-relaxed text-muted-foreground">
            Tokens via OAuth da sua conta Pro/Max. Reseta quando você recarrega a página.
          </p>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

function Row({
  label,
  cost,
  input,
  output,
  bold,
}: {
  label: string;
  cost: number;
  input: number;
  output: number;
  bold?: boolean;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-3", bold && "font-semibold")}>
      <span className="text-muted-foreground">{label}</span>
      <span className="flex items-center gap-2 font-mono">
        <span title="custo USD">{formatCost(cost || null)}</span>
        <span className="text-muted-foreground" title="input tokens">
          <ArrowDownToLine className="inline h-3 w-3" /> {fmtTokens(input)}
        </span>
        <span className="text-muted-foreground" title="output tokens">
          <ArrowUpFromLine className="inline h-3 w-3" /> {fmtTokens(output)}
        </span>
      </span>
    </div>
  );
}
