"use client";

import * as React from "react";
import { Keyboard } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useDialogs } from "@/stores/dialogs";
import { SHORTCUTS, type ShortcutGroup } from "@/lib/shortcuts";

export function ShortcutsDialog() {
  const open = useDialogs((s) => s.shortcutsOpen);
  const setOpen = useDialogs((s) =>
    s.shortcutsOpen ? s.closeShortcuts : s.openShortcuts,
  );

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? null : setOpen())}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="h-4 w-4" />
            Atalhos de teclado
          </DialogTitle>
          <DialogDescription>
            Tudo que você pode fazer sem tocar no mouse. Pressione{" "}
            <kbd className="rounded border border-border bg-secondary/60 px-1 py-0.5 font-mono text-[10px]">
              ?
            </kbd>{" "}
            a qualquer momento pra abrir esta tela.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 sm:grid-cols-2">
          {SHORTCUTS.map((group) => (
            <ShortcutGroupView key={group.title} group={group} />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ShortcutGroupView({ group }: { group: ShortcutGroup }) {
  return (
    <div>
      <h3 className="mb-2 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
        {group.title}
      </h3>
      <ul className="space-y-1.5">
        {group.items.map((item) => (
          <li
            key={item.label}
            className="flex items-center justify-between gap-3 text-sm"
          >
            <span className="text-foreground/85">{item.label}</span>
            <ShortcutKeys keys={item.keys} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function ShortcutKeys({ keys }: { keys: string[] }) {
  return (
    <span className="flex items-center gap-1">
      {keys.map((k, i) => (
        <React.Fragment key={i}>
          <kbd className="rounded border border-border bg-secondary/60 px-1.5 py-0.5 font-mono text-[10px] tabular-nums">
            {k}
          </kbd>
          {i < keys.length - 1 && (
            <span className="text-[10px] text-muted-foreground">+</span>
          )}
        </React.Fragment>
      ))}
    </span>
  );
}
