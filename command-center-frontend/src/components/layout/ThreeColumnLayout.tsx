"use client";

import * as React from "react";
import { Topbar } from "@/components/layout/Topbar";
import { Sidebar } from "@/components/layout/Sidebar";
import { WorkerPanel } from "@/components/workers/WorkerPanel";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useDialogs } from "@/stores/dialogs";

interface Props {
  /** Coluna central — geralmente o /chat. */
  children: React.ReactNode;
  /** Se true, esconde o painel direito de workers (ex.: nas páginas de tabela). */
  hideRight?: boolean;
}

export function ThreeColumnLayout({ children, hideRight = false }: Props) {
  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  const [workersOpen, setWorkersOpen] = React.useState(false);
  // Cmd+\ controla isso via useDialogs.toggleSidebar()
  const sidebarCollapsed = useDialogs((s) => s.sidebarCollapsed);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden">
      <Topbar
        onOpenSidebar={() => setSidebarOpen(true)}
        onOpenWorkers={() => setWorkersOpen(true)}
      />

      <div className="flex min-h-0 flex-1">
        {/* Sidebar — desktop (esconde com Cmd+\) */}
        {!sidebarCollapsed && (
          <div className="hidden lg:block">
            <Sidebar />
          </div>
        )}

        {/* Sidebar — mobile (sheet) */}
        <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
          <SheetContent side="left" className="w-72 p-0">
            <SheetHeader className="sr-only">
              <SheetTitle>Menu</SheetTitle>
            </SheetHeader>
            <Sidebar />
          </SheetContent>
        </Sheet>

        {/* Coluna central */}
        <main className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</main>

        {/* Painel direito — desktop */}
        {!hideRight && (
          <div className="hidden w-96 shrink-0 border-l border-border bg-card/40 xl:block">
            <WorkerPanel />
          </div>
        )}

        {/* Painel direito — mobile (sheet) */}
        {!hideRight && (
          <Sheet open={workersOpen} onOpenChange={setWorkersOpen}>
            <SheetContent side="right" className="w-96 p-0">
              <SheetHeader className="sr-only">
                <SheetTitle>Status</SheetTitle>
              </SheetHeader>
              <WorkerPanel />
            </SheetContent>
          </Sheet>
        )}
      </div>
    </div>
  );
}
