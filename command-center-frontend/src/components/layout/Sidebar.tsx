"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Briefcase,
  ListTodo,
  MessageSquare,
  Plus,
  Settings as SettingsIcon,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useProjects } from "@/hooks/use-projects";
import { useActiveProject } from "@/stores/active-project";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ProjectSidebar } from "@/components/projects/ProjectSidebar";
import { ConversationSidebar } from "@/components/chat/ConversationSidebar";
import { MemoryPanel } from "@/components/memory/MemoryPanel";
import { OrnamentalDivider } from "@/components/sumi";
import { useDialogs } from "@/stores/dialogs";

const NAV: { href: string; label: string; icon: React.ComponentType<{ className?: string }> }[] =
  [
    { href: "/chat", label: "Chat", icon: MessageSquare },
    { href: "/projects", label: "Projects", icon: Briefcase },
    { href: "/tasks", label: "Tasks", icon: ListTodo },
    { href: "/metrics", label: "Metrics", icon: BarChart3 },
    { href: "/employees", label: "Workers", icon: Users },
    { href: "/settings", label: "Settings", icon: SettingsIcon },
  ];

export function Sidebar() {
  const pathname = usePathname();
  const { data: projects, isLoading } = useProjects();
  const { activeProjectId, setActiveProject } = useActiveProject();

  return (
    <aside className="relative flex h-full w-64 shrink-0 flex-col overflow-hidden border-r border-border bg-card/40">
      {/* Dragon portrait — full sidebar height */}
      <div className="pointer-events-none absolute inset-0 z-0">
        <Image
          src="/assets/dragon-card.png"
          alt=""
          fill
          className="object-cover object-top opacity-[0.18]"
          sizes="256px"
        />
        {/* Left-edge overlay keeps text readable */}
        <div className="absolute inset-0 bg-gradient-to-r from-card/50 via-transparent to-transparent" />
        {/* Bottom fade behind the footer button */}
        <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-card/90 to-transparent" />
      </div>

      <nav className="relative z-10 flex flex-col gap-1 p-3">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-all",
                active
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="relative z-10 border-t border-border/30">
        <ConversationSidebar />
      </div>

      <div className="relative z-10 flex items-center justify-between gap-2 px-4 pb-2 pt-4">
        <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
          Projetos
        </span>
        <button
          onClick={() => useDialogs.getState().openNewProject()}
          className="flex h-6 w-6 items-center justify-center rounded-md border border-border/50 bg-background/40 text-muted-foreground transition-all hover:border-primary/40 hover:bg-primary/10 hover:text-primary"
          aria-label="Novo projeto"
          title="Novo projeto"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="relative z-10 flex-1 overflow-y-auto px-1.5 scrollbar-thin">
        {isLoading ? (
          <div className="space-y-1.5 p-1.5">
            <Skeleton className="h-7 w-full" />
            <Skeleton className="h-7 w-full" />
            <Skeleton className="h-7 w-full" />
          </div>
        ) : (
          <ProjectSidebar
            projects={projects ?? []}
            activeId={activeProjectId}
            onSelect={(p) => setActiveProject(p.id, p.name)}
          />
        )}
      </div>

      <div className="relative z-10">
        <MemoryPanel projectId={activeProjectId} />
      </div>

      <div className="relative z-10 border-t border-border/60 px-2 pb-2 pt-3">
        <OrnamentalDivider className="mb-2.5" />
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start"
          onClick={() => useDialogs.getState().openNewProject()}
        >
          <Plus className="h-4 w-4" /> Novo projeto
        </Button>
      </div>
    </aside>
  );
}
