"use client";

import * as React from "react";
import { BookOpen, Plus, Trash2, ChevronDown, ChevronUp, Save, X } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import type { SkillInfo } from "@/lib/types";

interface SkillsPanelProps {
  projectId: number;
}

function SkillCard({
  skill,
  onDelete,
}: {
  skill: SkillInfo;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = React.useState(false);

  return (
    <div className="rounded-xl border border-border/60 bg-card/40">
      <div className="flex items-center gap-3 px-4 py-3">
        <BookOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{skill.name}</span>
            <span
              className={cn(
                "rounded px-1.5 py-px text-[10px] uppercase font-mono",
                skill.scope === "project"
                  ? "bg-primary/10 text-primary"
                  : "bg-muted/60 text-muted-foreground",
              )}
            >
              {skill.scope}
            </span>
            <span className="text-[11px] text-muted-foreground">{skill.chars} chars</span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {skill.scope === "project" && (
            <button
              onClick={onDelete}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
              title="Remover skill"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            onClick={() => setExpanded((s) => !s)}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/60"
          >
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>
      {expanded && (
        <div className="border-t border-border/40 px-4 pb-4 pt-3">
          <pre className="max-h-60 overflow-y-auto whitespace-pre-wrap rounded-lg border border-border/40 bg-muted/20 p-3 font-mono text-[12px] leading-relaxed text-foreground/80">
            {skill.preview}
            {skill.chars > 200 && "…"}
          </pre>
        </div>
      )}
    </div>
  );
}

function NewSkillForm({ projectId, onClose }: { projectId: number; onClose: () => void }) {
  const [name, setName] = React.useState("");
  const [content, setContent] = React.useState("");
  const queryClient = useQueryClient();

  const createMut = useMutation({
    mutationFn: () => api.createSkill(projectId, name, content),
    onSuccess: () => {
      toast.success(`Skill "${name}" criada`);
      void queryClient.invalidateQueries({ queryKey: ["skills", projectId] });
      onClose();
    },
    onError: () => toast.error("Falha ao criar skill"),
  });

  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Nova skill</span>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <input
        placeholder="nome-da-skill (ex: tdd-strict, no-console-log)"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full rounded-lg border border-border/60 bg-background/60 px-3 py-2 text-sm outline-none focus:border-primary/40 font-mono"
      />
      <textarea
        placeholder={`# Regra de TDD\n\nSempre escreva testes antes de implementar...\n`}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={8}
        className="w-full resize-y rounded-lg border border-border/60 bg-background/60 px-3 py-2 font-mono text-[12px] leading-relaxed outline-none focus:border-primary/40"
      />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onClose}>Cancelar</Button>
        <Button
          size="sm"
          onClick={() => createMut.mutate()}
          disabled={!name.trim() || !content.trim() || createMut.isPending}
        >
          <Save className="mr-1.5 h-3.5 w-3.5" />
          Salvar
        </Button>
      </div>
    </div>
  );
}

export function SkillsPanel({ projectId }: SkillsPanelProps) {
  const [showNew, setShowNew] = React.useState(false);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["skills", projectId],
    queryFn: () => api.listSkills(projectId),
  });

  const deleteMut = useMutation({
    mutationFn: (name: string) => api.deleteSkill(projectId, name),
    onSuccess: (_, name) => {
      toast.success(`Skill "${name}" removida`);
      void queryClient.invalidateQueries({ queryKey: ["skills", projectId] });
    },
    onError: () => toast.error("Falha ao remover skill"),
  });

  const skills = data?.skills ?? [];
  const projectSkills = skills.filter((s) => s.scope === "project");
  const globalSkills = skills.filter((s) => s.scope === "global");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-medium">Skills do projeto</h2>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            Regras em Markdown injetadas no prompt de cada worker. Ficam em{" "}
            <code className="font-mono text-[11px]">.claude/skills/*.md</code>
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setShowNew(true)}
          disabled={showNew}
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Nova skill
        </Button>
      </div>

      {showNew && (
        <NewSkillForm projectId={projectId} onClose={() => setShowNew(false)} />
      )}

      {isLoading && (
        <p className="text-[13px] italic text-muted-foreground">Carregando…</p>
      )}

      {!isLoading && projectSkills.length === 0 && !showNew && (
        <div className="rounded-xl border border-dashed border-border/60 px-6 py-8 text-center">
          <BookOpen className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">Nenhuma skill neste projeto.</p>
          <p className="mt-1 text-[12px] text-muted-foreground/70">
            Skills são regras em Markdown — ex: "sempre use TDD", "não use console.log".
            Os workers as recebem como instruções obrigatórias.
          </p>
        </div>
      )}

      <div className="space-y-2">
        {projectSkills.map((sk) => (
          <SkillCard
            key={sk.name}
            skill={sk}
            onDelete={() => deleteMut.mutate(sk.name)}
          />
        ))}
      </div>

      {globalSkills.length > 0 && (
        <>
          <div className="border-t border-border/40 pt-4">
            <h3 className="mb-3 text-[12px] font-medium uppercase tracking-wide text-muted-foreground">
              Skills globais ({globalSkills.length})
            </h3>
            <div className="space-y-2">
              {globalSkills.map((sk) => (
                <SkillCard key={sk.name} skill={sk} onDelete={() => {}} />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
