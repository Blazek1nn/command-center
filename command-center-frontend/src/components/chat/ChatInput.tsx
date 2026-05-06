"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowUp, BookOpen, Square } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { handleSlashCommand } from "@/lib/slash-commands";
import { ModelPicker, loadPreferredModel, savePreferredModel } from "./ModelPicker";
import { useActiveProject } from "@/stores/active-project";
import { api } from "@/lib/api";
import type { ModelAlias } from "@/lib/types";

export type ModelChoice = ModelAlias | "auto";

interface ChatInputProps {
  onSend: (message: string, model: ModelChoice) => void;
  onCancel?: () => void;
  busy: boolean;
  disabled?: boolean;
}

export function ChatInput({ onSend, onCancel, busy, disabled }: ChatInputProps) {
  const [value, setValue] = React.useState("");
  const [model, setModel] = React.useState<ModelChoice>("auto");
  const ref = React.useRef<HTMLTextAreaElement>(null);

  // Hidrata preferência salva no localStorage uma vez, no client
  React.useEffect(() => {
    setModel(loadPreferredModel());
  }, []);

  React.useEffect(() => {
    const t = ref.current;
    if (!t) return;
    t.style.height = "auto";
    t.style.height = Math.min(t.scrollHeight, 240) + "px";
  }, [value]);

  const handleModelChange = React.useCallback((m: ModelChoice) => {
    setModel(m);
    savePreferredModel(m);
  }, []);

  const submit = async () => {
    const text = value.trim();
    if (!text || busy) return;

    // Slash command interception
    if (text.startsWith("/")) {
      const result = await handleSlashCommand(text);
      if (result.kind === "consumed") {
        setValue(result.replaceInput ?? "");
        return;
      }
    }

    onSend(value, model);
    setValue("");
  };

  const { activeProjectId } = useActiveProject();
  const { data: skillsData } = useQuery({
    queryKey: ["skills", activeProjectId],
    queryFn: () => api.listSkills(activeProjectId!),
    enabled: activeProjectId != null,
    staleTime: 1000 * 60 * 5,
  });
  const skillCount = skillsData?.skills.filter((s) => s.scope === "project").length ?? 0;

  return (
    <div className="border-t border-border bg-card/50 px-6 py-5 backdrop-blur">
      <div
        className={cn(
          "flex items-end gap-2.5 rounded-2xl border border-border bg-card p-2.5 shadow-zen transition-colors focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/15",
        )}
      >
        <div className="flex shrink-0 items-end pb-0.5">
          <ModelPicker value={model} onChange={handleModelChange} disabled={busy} />
        </div>
        <Textarea
          ref={ref}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void submit();
            }
          }}
          rows={1}
          placeholder="O que precisa ser feito?  (Enter envia · Shift+Enter quebra linha · /project /run /file)"
          disabled={disabled}
          className="min-h-11 resize-none border-0 bg-transparent p-2.5 text-base leading-relaxed shadow-none focus-visible:ring-0"
        />
        {busy && onCancel ? (
          <Button
            onClick={onCancel}
            variant="destructive"
            size="icon"
            className="rounded-full"
            aria-label="Cancelar"
          >
            <Square className="h-3.5 w-3.5" />
          </Button>
        ) : (
          <Button
            onClick={() => void submit()}
            disabled={!value.trim() || disabled}
            size="icon"
            className="rounded-full"
            aria-label="Enviar"
          >
            <ArrowUp className="h-4 w-4" />
          </Button>
        )}
      </div>
      <div className="mt-3 flex items-center justify-between px-1">
        <p className="text-[11px] italic text-muted-foreground">
          <span className="not-italic font-mono text-muted-foreground/80">Enter</span> envia ·{" "}
          <span className="not-italic font-mono text-muted-foreground/80">Shift+Enter</span> quebra linha ·{" "}
          <span className="not-italic font-mono text-muted-foreground/80">⌘K</span> paleta ·{" "}
          <span className="not-italic font-mono text-muted-foreground/80">?</span> ajuda ·{" "}
          <code className="font-mono">/project</code> <code className="font-mono">/run</code> <code className="font-mono">/file</code>
        </p>
        {activeProjectId != null && (
          <Link
            href={`/projects/${activeProjectId}/settings`}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] transition-colors",
              skillCount > 0
                ? "border border-primary/30 bg-primary/8 text-primary hover:bg-primary/15"
                : "text-muted-foreground/60 hover:text-muted-foreground",
            )}
            title="Configurar skills e MCPs do projeto"
          >
            <BookOpen className="h-3 w-3" />
            {skillCount > 0 ? `${skillCount} skill${skillCount !== 1 ? "s" : ""}` : "Skills"}
          </Link>
        )}
      </div>
    </div>
  );
}
