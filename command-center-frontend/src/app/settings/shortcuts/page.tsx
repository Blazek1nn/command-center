"use client";

import { Keyboard } from "lucide-react";
import { ThreeColumnLayout } from "@/components/layout/ThreeColumnLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { SHORTCUTS } from "@/lib/shortcuts";

export default function ShortcutsPage() {
  return (
    <ThreeColumnLayout hideRight>
      <div className="mx-auto w-full max-w-3xl space-y-4 p-6">
        <header>
          <h1 className="flex items-center gap-2 text-lg font-semibold">
            <Keyboard className="h-5 w-5" />
            Atalhos de teclado
          </h1>
          <p className="text-sm text-muted-foreground">
            Tudo o que você pode fazer sem mouse. Pressione{" "}
            <kbd className="rounded border border-border bg-secondary/60 px-1 py-0.5 font-mono text-[10px]">
              ?
            </kbd>{" "}
            em qualquer página pra abrir esta lista em dialog.
          </p>
        </header>

        <div className="grid gap-4 md:grid-cols-2">
          {SHORTCUTS.map((group) => (
            <Card key={group.title}>
              <CardHeader>
                <CardTitle className="text-sm">{group.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {group.items.map((item) => (
                    <li
                      key={item.label}
                      className="flex items-center justify-between gap-3 text-[13px]"
                    >
                      <span className="text-foreground/85">{item.label}</span>
                      <span className="flex shrink-0 items-center gap-1">
                        {item.keys.map((k, i) => (
                          <span key={i} className="flex items-center gap-1">
                            <kbd className="rounded border border-border bg-secondary/60 px-1.5 py-0.5 font-mono text-[10px] tabular-nums">
                              {k}
                            </kbd>
                            {i < item.keys.length - 1 && (
                              <span className="text-[10px] text-muted-foreground">
                                +
                              </span>
                            )}
                          </span>
                        ))}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Customização</CardTitle>
            <CardDescription>
              Bindings customizados estão no roadmap (v4). Por hora, os atalhos são fixos.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    </ThreeColumnLayout>
  );
}
