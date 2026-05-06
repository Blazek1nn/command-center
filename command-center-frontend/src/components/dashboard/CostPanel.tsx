"use client";

import * as React from "react";
import { useChatStore } from "@/stores/chat-store";

const fmtUsd = (n: number) =>
  n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });

const fmtTokens = (n: number) => {
  if (n < 1_000) return String(n);
  if (n < 1_000_000) return (n / 1_000).toFixed(1) + "k";
  return (n / 1_000_000).toFixed(2) + "M";
};

export function CostPanel() {
  const usage = useChatStore((s) => s.sessionUsage);
  const total = usage.total.cost_usd;
  const managerCost = usage.manager.cost_usd;
  const workerCost = usage.workers.cost_usd;
  const max = Math.max(managerCost, workerCost, 0.0001); // evita divisão por zero
  const managerPct = (managerCost / max) * 100;
  const workerPct = (workerCost / max) * 100;
  const totalIO = usage.total.input_tokens + usage.total.output_tokens;

  return (
    <div className="border-b border-border px-3 py-3">
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Custo da sessão
        </div>
        <div className="text-[10px] tabular-nums text-muted-foreground">
          {fmtTokens(totalIO)} tok
        </div>
      </div>

      <div className="mt-1 font-display text-2xl font-medium tabular-nums leading-none text-foreground">
        {fmtUsd(total)}
      </div>

      <div className="mt-2.5 space-y-1.5">
        <CostBar label="Manager" cost={managerCost} pct={managerPct} accent="primary" />
        <CostBar label="Workers" cost={workerCost} pct={workerPct} accent="muted" />
      </div>
    </div>
  );
}

function CostBar({
  label,
  cost,
  pct,
  accent,
}: {
  label: string;
  cost: number;
  pct: number;
  accent: "primary" | "muted";
}) {
  const fill =
    accent === "primary"
      ? "bg-primary/80"
      : "bg-muted-foreground/40";
  return (
    <div className="flex items-center gap-2">
      <span className="w-14 shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-muted/40">
        <div
          className={`absolute inset-y-0 left-0 ${fill} transition-[width] duration-500`}
          style={{ width: `${Math.max(pct, cost > 0 ? 4 : 0)}%` }}
        />
      </div>
      <span className="w-14 shrink-0 text-right text-[10px] tabular-nums text-muted-foreground">
        {fmtUsd(cost)}
      </span>
    </div>
  );
}
