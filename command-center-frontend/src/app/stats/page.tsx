"use client";

/**
 * /stats — Public metrics dashboard.
 *
 * Shows aggregate, anonymized data about Command Center usage.
 * Designed to be linkable publicly as proof of traction.
 *
 * Data sources: /api/metrics/session + /api/tasks (local backend).
 * No PII. Shows counts, costs, model distribution, task success rate.
 */

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  PieChart,
  Pie,
  Legend,
} from "recharts";
import { ThreeColumnLayout } from "@/components/layout/ThreeColumnLayout";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import type { Task } from "@/lib/types";

// ── Helpers ──────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  color = "text-foreground",
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/60 px-5 py-4">
      <p className="mb-1 text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className={`text-2xl font-semibold tabular-nums ${color}`}>{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

function Skel() {
  return <Skeleton className="h-[72px] rounded-xl" />;
}

const MODEL_COLORS: Record<string, string> = {
  opus: "hsl(var(--primary))",
  sonnet: "#f59e0b",
  haiku: "#10b981",
};

// ── Page ─────────────────────────────────────────────────────────────────────

export default function StatsPage() {
  const { data: sessionMetrics, isLoading: loadingMetrics } = useQuery({
    queryKey: ["stats-metrics"],
    queryFn: () => api.getMetricsSession(),
    staleTime: 60_000,
  });

  const { data: recentTasks, isLoading: loadingTasks } = useQuery({
    queryKey: ["stats-tasks"],
    queryFn: () => api.listTasks({ limit: 200 }),
    staleTime: 60_000,
  });

  // Derived stats from tasks list
  const derived = React.useMemo(() => {
    if (!recentTasks) return null;
    const tasks: Task[] = Array.isArray(recentTasks) ? recentTasks : [];
    const total = tasks.length;
    const succeeded = tasks.filter((t) => t.status === "done").length;
    const failed = tasks.filter((t) => t.status === "failed").length;
    const cancelled = tasks.filter((t) => t.status === "cancelled").length;
    const successRate = total > 0 ? Math.round((succeeded / total) * 100) : 0;
    const totalCost = tasks.reduce((s, t) => s + (t.cost_estimate ?? 0), 0);
    const avgCost = succeeded > 0 ? totalCost / succeeded : 0;
    // duration_ms not tracked server-side yet — placeholder for future field
    const avgDuration = 0;

    // Model distribution
    const modelCounts: Record<string, number> = {};
    for (const t of tasks) {
      if (t.model) modelCounts[t.model] = (modelCounts[t.model] ?? 0) + 1;
    }
    const modelPie = Object.entries(modelCounts).map(([name, value]) => ({
      name,
      value,
      fill: MODEL_COLORS[name] ?? "hsl(var(--muted-foreground))",
    }));

    // Status distribution for bar chart
    const statusBar = [
      { status: "succeeded", count: succeeded, fill: "#10b981" },
      { status: "failed", count: failed, fill: "#ef4444" },
      { status: "cancelled", count: cancelled, fill: "#6b7280" },
    ].filter((d) => d.count > 0);

    return { total, succeeded, failed, successRate, totalCost, avgCost, avgDuration, modelPie, statusBar };
  }, [recentTasks]);

  const loading = loadingMetrics || loadingTasks;

  return (
    <ThreeColumnLayout>
      <div className="mx-auto max-w-3xl space-y-8 px-4 py-8">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Live metrics</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Aggregate, anonymized data from this Command Center installation.
            No PII. Updated every 60s.
          </p>
        </div>

        {/* Top stats */}
        <section>
          <h2 className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            All time
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => <Skel key={i} />)
            ) : (
              <>
                <StatCard
                  label="Tasks executed"
                  value={derived?.total ?? 0}
                />
                <StatCard
                  label="Success rate"
                  value={`${derived?.successRate ?? 0}%`}
                  color={
                    (derived?.successRate ?? 0) >= 80
                      ? "text-emerald-500"
                      : (derived?.successRate ?? 0) >= 60
                        ? "text-amber-500"
                        : "text-rose-500"
                  }
                />
                <StatCard
                  label="Total cost"
                  value={`$${(derived?.totalCost ?? 0).toFixed(2)}`}
                  sub="across all tasks"
                />
                <StatCard
                  label="Avg cost / task"
                  value={`$${(derived?.avgCost ?? 0).toFixed(3)}`}
                  sub="succeeded tasks"
                />
              </>
            )}
          </div>
        </section>

        {/* Session metrics */}
        {sessionMetrics && (
          <section>
            <h2 className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Current session
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard
                label="Tokens in"
                value={(sessionMetrics.total_input_tokens ?? 0).toLocaleString()}
              />
              <StatCard
                label="Tasks run"
                value={sessionMetrics.task_count ?? 0}
              />
              <StatCard
                label="Session cost"
                value={`$${(sessionMetrics.total_cost_usd ?? 0).toFixed(4)}`}
              />
              <StatCard
                label="Avg duration"
                value={
                  derived?.avgDuration
                    ? `${Math.round(derived.avgDuration / 1000)}s`
                    : "—"
                }
                sub="per task"
              />
            </div>
          </section>
        )}

        {/* Model distribution */}
        {derived && derived.modelPie.length > 0 && (
          <section>
            <h2 className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Model distribution
            </h2>
            <div className="rounded-xl border border-border/60 bg-card/60 p-4">
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie
                    data={derived.modelPie}
                    cx="50%"
                    cy="50%"
                    outerRadius={70}
                    dataKey="value"
                    label={({ name, percent }) =>
                      `${name} ${Math.round((percent ?? 0) * 100)}%`
                    }
                    labelLine={false}
                  >
                    {derived.modelPie.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v: number) => [`${v} tasks`, "count"]}
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "6px",
                      fontSize: "12px",
                    }}
                  />
                  <Legend
                    iconType="circle"
                    iconSize={8}
                    wrapperStyle={{ fontSize: "11px" }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </section>
        )}

        {/* Status breakdown */}
        {derived && derived.statusBar.length > 0 && (
          <section>
            <h2 className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Outcome breakdown
            </h2>
            <div className="rounded-xl border border-border/60 bg-card/60 p-4">
              <ResponsiveContainer width="100%" height={120}>
                <BarChart data={derived.statusBar} layout="vertical">
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="status" width={70} tick={{ fontSize: 11 }} />
                  <Tooltip
                    formatter={(v: number) => [`${v} tasks`]}
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "6px",
                      fontSize: "12px",
                    }}
                  />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                    {derived.statusBar.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
        )}

        {/* Footer note */}
        <p className="text-center text-[11px] text-muted-foreground">
          Data from local SQLite database. No data leaves your machine unless PostHog is configured.
          <br />
          <a
            href="https://github.com/command-center-dev/command-center"
            className="underline hover:text-foreground"
            target="_blank"
            rel="noopener noreferrer"
          >
            command-center-dev/command-center
          </a>
        </p>
      </div>
    </ThreeColumnLayout>
  );
}
