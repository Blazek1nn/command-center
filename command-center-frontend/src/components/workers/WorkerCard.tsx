"use client";

import Image from "next/image";
import { Cpu } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { StatusPill } from "@/components/status-pill";
import type { Employee } from "@/lib/types";

const PORTRAIT_IMAGES = [
  "/assets/dragon-card.png",
  "/assets/fox-card.png",
  "/assets/bamboo-sakura-card.png",
] as const;

interface WorkerCardProps {
  worker: Employee;
  utilization?: number; // 0-100
}

export function WorkerCard({ worker, utilization }: WorkerCardProps) {
  const portraitSrc = PORTRAIT_IMAGES[worker.id % PORTRAIT_IMAGES.length] ?? PORTRAIT_IMAGES[0]!;

  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-card p-3 shadow-zen transition-colors hover:border-primary/30">
      <Image
        src={portraitSrc}
        alt=""
        fill
        className="pointer-events-none object-cover object-top opacity-20"
        sizes="320px"
      />
      <div className="absolute inset-0 bg-gradient-to-r from-card via-card/95 to-card/40" />
      <div className="relative z-10">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Cpu className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="truncate">{worker.name}</span>
            </div>
            <div className="mt-1.5 flex items-center gap-1.5">
              <Badge variant="muted" className="text-[10px]">{worker.model}</Badge>
              <Badge variant="outline" className="text-[10px]">{worker.specialty}</Badge>
            </div>
          </div>
          <StatusPill status={worker.status} />
        </div>
        {typeof utilization === "number" && (
          <div className="mt-2.5">
            <Progress value={utilization} />
            <div className="mt-1 text-right text-[10px] text-muted-foreground">
              {utilization}%
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
