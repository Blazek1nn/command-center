"use client";

import Image from "next/image";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { useEmployees } from "@/hooks/use-employees";
import { WorkerCard } from "@/components/workers/WorkerCard";
import { ActivityFeed } from "@/components/workers/ActivityFeed";
import { ProjectInsightsPanel } from "@/components/projects/ProjectInsightsPanel";
import { CostPanel } from "@/components/dashboard/CostPanel";

export function WorkerPanel() {
  const { data: workers, isLoading } = useEmployees();
  const list = workers ?? [];
  const busy = list.filter((w) => w.status === "busy").length;
  const total = list.length;
  const utilization = total > 0 ? Math.round((busy / total) * 100) : 0;

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden">
      {/* Kitsune portrait — full panel height */}
      <div className="pointer-events-none absolute inset-0 z-0">
        <Image
          src="/assets/fox-card.png"
          alt=""
          fill
          className="object-cover object-top opacity-[0.18]"
          sizes="384px"
        />
        {/* Right-edge overlay keeps text readable */}
        <div className="absolute inset-0 bg-gradient-to-l from-card/50 via-transparent to-transparent" />
        {/* Bottom fade */}
        <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-card/90 to-transparent" />
      </div>

      {/* ── 0) Cost dashboard (session) ── */}
      <div className="relative z-10 flex-shrink-0">
        <CostPanel />
      </div>

      {/* ── 1) Projects insights ── */}
      <div className="relative z-10 min-h-0 flex-[1.2] overflow-hidden">
        <ProjectInsightsPanel />
      </div>

      <Separator />

      {/* ── 2) Workers ── */}
      <div className="relative z-10 flex min-h-0 flex-1 flex-col">
        <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Workers
          </div>
          <div className="text-[10px] text-muted-foreground">
            {busy}/{total} · {utilization}%
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-2 scrollbar-thin">
          {isLoading ? (
            <div className="space-y-2 p-1">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : list.length === 0 ? (
            <div className="px-2 py-4 text-center text-xs text-muted-foreground">
              Nenhum worker ainda. Eles surgem na primeira task.
            </div>
          ) : (
            <div className="space-y-1.5 pt-1.5">
              {list.map((w) => (
                <WorkerCard
                  key={w.id}
                  worker={w}
                  utilization={
                    w.status === "busy" ? 78 : w.status === "idle" ? 0 : undefined
                  }
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <Separator />

      {/* ── 3) Activity ── */}
      <div className="relative z-10 min-h-0 max-h-[35%] flex-shrink-0">
        <ActivityFeed />
      </div>
    </div>
  );
}
