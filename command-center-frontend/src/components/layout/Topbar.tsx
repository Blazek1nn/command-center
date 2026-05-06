"use client";

import * as React from "react";
import Link from "next/link";
import { Command as CommandIcon, Menu, Activity, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useActiveProject } from "@/stores/active-project";
import { useDialogs } from "@/stores/dialogs";
import { useHealth } from "@/hooks/use-health";
import { CommandPalette } from "@/components/command-palette";
import { EnsoLogo } from "@/components/sumi";

interface TopbarProps {
  onOpenSidebar?: () => void;
  onOpenWorkers?: () => void;
}

export function Topbar({ onOpenSidebar, onOpenWorkers }: TopbarProps) {
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const activeName = useActiveProject((s) => s.activeProjectName);
  const health = useHealth();

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const isOnline = health.data?.status === "ok";

  return (
    <header className="relative flex h-16 shrink-0 items-center gap-4 border-b border-border bg-card/60 px-6 backdrop-blur-md">
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        onClick={onOpenSidebar}
        aria-label="Abrir menu"
      >
        <Menu className="h-4 w-4" />
      </Button>

      <Link
        href="/chat"
        className="flex items-center gap-3 font-display tracking-tight"
      >
        <EnsoLogo label="令" size={36} />
        <span className="text-lg font-medium">Command Center</span>
      </Link>

      <Separator orientation="vertical" className="h-5 bg-border" />

      <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
        <span className="hidden sm:inline">projeto ativo</span>
        <span className="truncate font-medium text-foreground">
          {activeName ?? "—"}
        </span>
      </div>

      <div className="flex-1" />

      <Button
        size="sm"
        variant="outline"
        className="h-9 gap-1.5"
        onClick={() => useDialogs.getState().openNewProject()}
        aria-label="Novo projeto"
      >
        <Plus className="h-4 w-4" />
        <span className="hidden sm:inline">Novo</span>
      </Button>

      <button
        type="button"
        onClick={() => setPaletteOpen(true)}
        className="hidden h-9 items-center gap-2 rounded-full border border-border bg-card/70 px-3 text-xs text-muted-foreground transition-all hover:border-primary/40 hover:text-foreground md:inline-flex"
      >
        <CommandIcon className="h-3.5 w-3.5" />
        <span>buscar...</span>
        <kbd className="ml-2 rounded-md border border-border bg-secondary/60 px-1.5 py-0.5 font-mono text-[10px]">
          ⌘K
        </kbd>
      </button>

      <span
        className={
          "hidden items-center gap-1.5 rounded-full border px-3 py-1 text-xs sm:inline-flex " +
          (isOnline
            ? "border-success/30 bg-success/10 text-success"
            : "border-destructive/30 bg-destructive/10 text-destructive")
        }
      >
        {health.isFetching ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <span
            className={
              "h-1.5 w-1.5 rounded-full " +
              (isOnline ? "bg-success" : "bg-destructive")
            }
          />
        )}
        {isOnline ? "online" : "offline"}
      </span>

      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        onClick={onOpenWorkers}
        aria-label="Abrir painel de workers"
      >
        <Activity className="h-4 w-4" />
      </Button>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </header>
  );
}
