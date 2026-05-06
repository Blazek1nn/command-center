"use client";

import * as React from "react";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ThreeColumnLayout } from "@/components/layout/ThreeColumnLayout";
import { Skeleton } from "@/components/ui/skeleton";
import { useMetricsSession } from "@/hooks/use-metrics";
import { formatCost } from "@/lib/utils";

const MODEL_COLORS: Record<string, string> = {
  opus: "hsl(var(--primary))",
  sonnet: "hsl(var(--primary) / 0.6)",
  haiku: "hsl(var(--primary) / 0.35)",
};

export default function MetricsPage() {
  const { data, isLoading } = useMetricsSession();

  const chartData = React.useMemo(() => {
    if (!data) return [];
    return Object.entries(data.by_model)
      .map(([model, breakdown]) => ({
        model,
        cost: breakdown.cost_usd,
        count: breakdown.count,
        fill: MODEL_COLORS[model] ?? "hsl(var(--muted-foreground))",
      }))
      .sort((a, b) => b.cost - a.cost);
  }, [data]);

  const avgCostPerTask = data && data.task_count > 0 ? data.total_cost_usd / data.task_count : 0;

  return (
    <ThreeColumnLayout hideRight>
      <div className="mx-auto w-full max-w-5xl space-y-5 p-6">
        <header>
          <h1 className="text-lg font-semibold">Métricas</h1>
          <p className="text-sm text-muted-foreground">
            Custos agregados das tasks finalizadas hoje (UTC).
          </p>
        </header>

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : !data ? (
          <p className="text-sm text-muted-foreground">Sem métricas disponíveis.</p>
        ) : (
          <>
            <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <Kpi label="Custo de hoje" value={formatCost(data.total_cost_usd)} mono />
              <Kpi label="Tasks executadas" value={String(data.task_count)} />
              <Kpi label="Custo médio/task" value={formatCost(avgCostPerTask || null)} mono />
            </section>

            <section className="rounded-lg border border-border bg-card/40 p-4">
              <h2 className="mb-3 text-sm font-medium">Custo por modelo</h2>
              {chartData.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Nenhuma task concluída hoje.
                </p>
              ) : (
                <div className="h-56 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
                      <XAxis
                        dataKey="model"
                        tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        tickFormatter={(v) => `$${v.toFixed(2)}`}
                        tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                        axisLine={false}
                        tickLine={false}
                        width={56}
                      />
                      <Tooltip
                        formatter={(v: number) => [formatCost(v), "Custo"]}
                        contentStyle={{
                          background: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          fontSize: 12,
                        }}
                      />
                      <Bar dataKey="cost" radius={[4, 4, 0, 0]}>
                        {chartData.map((entry) => (
                          <Cell key={entry.model} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </section>

            <section className="rounded-lg border border-border bg-card/40 p-4">
              <h2 className="mb-3 text-sm font-medium">Detalhamento</h2>
              <div className="space-y-1.5">
                {chartData.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sem dados.</p>
                ) : (
                  chartData.map((row) => (
                    <div
                      key={row.model}
                      className="flex items-center justify-between text-sm tabular-nums"
                    >
                      <span className="font-medium">{row.model}</span>
                      <span className="text-muted-foreground">
                        {row.count} {row.count === 1 ? "task" : "tasks"} ·{" "}
                        <span className="font-mono text-foreground">{formatCost(row.cost)}</span>
                      </span>
                    </div>
                  ))
                )}
              </div>
            </section>
          </>
        )}
      </div>
    </ThreeColumnLayout>
  );
}

function Kpi({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-card/40 p-4">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className={`mt-1 text-2xl font-medium ${mono ? "font-mono tabular-nums" : ""}`}>
        {value}
      </div>
    </div>
  );
}
