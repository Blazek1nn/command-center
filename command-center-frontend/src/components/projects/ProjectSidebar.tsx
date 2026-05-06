"use client";

import Link from "next/link";
import { Folder } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Project } from "@/lib/types";

interface ProjectSidebarProps {
  projects: Project[];
  activeId: number | null;
  onSelect: (p: Project) => void;
}

// Cores discretas pra badges do stack — permite reconhecer a tecnologia
// no canto do olho sem competir com o nome do projeto.
const STACK_COLORS: Record<string, string> = {
  Python: "bg-blue-500/15 text-blue-600 dark:text-blue-300",
  FastAPI: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300",
  Django: "bg-emerald-700/15 text-emerald-700 dark:text-emerald-300",
  Flask: "bg-slate-500/15 text-slate-600 dark:text-slate-300",
  "Next.js": "bg-foreground/12 text-foreground/80",
  Vite: "bg-purple-500/15 text-purple-600 dark:text-purple-300",
  "Node.js": "bg-green-500/15 text-green-600 dark:text-green-300",
  Rust: "bg-orange-600/15 text-orange-600 dark:text-orange-300",
  Go: "bg-cyan-500/15 text-cyan-600 dark:text-cyan-300",
  Docker: "bg-blue-400/15 text-blue-500 dark:text-blue-300",
};

function stackColor(label: string): string {
  return STACK_COLORS[label] ?? "bg-muted/40 text-muted-foreground";
}

export function ProjectSidebar({ projects, activeId, onSelect }: ProjectSidebarProps) {
  if (projects.length === 0) {
    return (
      <div className="px-3 py-2 text-xs text-muted-foreground">
        Nenhum projeto ainda.
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-0.5 px-2 pb-2">
      {projects.map((p) => (
        <li key={p.id}>
          <Link
            href={`/projects/${p.id}`}
            onClick={() => onSelect(p)}
            className={cn(
              "flex flex-col gap-1 rounded-lg px-2.5 py-2 text-[13px] transition-colors",
              activeId === p.id
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
            )}
          >
            <div className="flex items-center gap-2.5">
              <Folder className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{p.name}</span>
            </div>
            {p.tech_stack && p.tech_stack.length > 0 && (
              <div className="ml-6 flex flex-wrap gap-1">
                {p.tech_stack.slice(0, 3).map((label) => (
                  <span
                    key={label}
                    className={cn(
                      "rounded px-1.5 py-px text-[9px] font-medium uppercase tracking-wide",
                      stackColor(label),
                    )}
                  >
                    {label}
                  </span>
                ))}
              </div>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}
