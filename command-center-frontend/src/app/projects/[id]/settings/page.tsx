"use client";

import { use, useState } from "react";
import Link from "next/link";
import { ArrowLeft, BookOpen, Plug } from "lucide-react";
import { ThreeColumnLayout } from "@/components/layout/ThreeColumnLayout";
import { Button } from "@/components/ui/button";
import { useProject } from "@/hooks/use-projects";
import { SkillsPanel } from "@/components/skills/SkillsPanel";
import { McpPanel } from "@/components/skills/McpPanel";
import { cn } from "@/lib/utils";

type Tab = "skills" | "mcps";

export default function ProjectSettingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const projectId = parseInt(id, 10);
  const { data: project } = useProject(projectId);
  const [tab, setTab] = useState<Tab>("skills");

  return (
    <ThreeColumnLayout>
      <div className="mx-auto w-full max-w-3xl px-6 py-10">
        {/* Header */}
        <div className="mb-8 flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild className="h-8 px-2">
            <Link href={`/projects/${id}`}>
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="font-display text-2xl font-medium tracking-tight">
              {project?.name ?? "Projeto"} — Configurações
            </h1>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              Skills e MCPs ficam em{" "}
              <code className="rounded bg-muted/60 px-1 font-mono text-[11px]">
                {project?.path ?? "…"}/.claude/
              </code>
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="mb-6 flex gap-1 rounded-xl border border-border/60 bg-muted/30 p-1">
          {(
            [
              { id: "skills", label: "Skills", icon: BookOpen },
              { id: "mcps", label: "MCPs", icon: Plug },
            ] as const
          ).map(({ id: tabId, label, icon: Icon }) => (
            <button
              key={tabId}
              onClick={() => setTab(tabId)}
              className={cn(
                "flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition-all",
                tab === tabId
                  ? "bg-background text-foreground shadow-zen"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>

        {/* Content */}
        {tab === "skills" && <SkillsPanel projectId={projectId} />}
        {tab === "mcps" && <McpPanel projectId={projectId} />}
      </div>
    </ThreeColumnLayout>
  );
}
