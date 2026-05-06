"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCreateTask } from "@/hooks/use-tasks";
import { useProjects } from "@/hooks/use-projects";
import { useDialogs } from "@/stores/dialogs";
import { ApiError } from "@/lib/api";

const NO_PROJECT = "__none";

export function NewTaskDialog() {
  const open = useDialogs((s) => s.newTaskOpen);
  const close = useDialogs((s) => s.closeNewTask);
  const projects = useProjects();
  const createTask = useCreateTask();

  const [title, setTitle] = React.useState("");
  const [prompt, setPrompt] = React.useState("");
  const [projectId, setProjectId] = React.useState<string>(NO_PROJECT);
  const [model, setModel] = React.useState<string>("sonnet");

  const reset = () => {
    setTitle("");
    setPrompt("");
    setProjectId(NO_PROJECT);
    setModel("sonnet");
  };

  const handleClose = (next: boolean) => {
    if (!next) {
      reset();
      close();
    }
  };

  const canSubmit = title.trim().length > 0 && prompt.trim().length > 0 && !createTask.isPending;

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    createTask.mutate(
      {
        title: title.trim(),
        prompt: prompt.trim(),
        project_id: projectId === NO_PROJECT ? null : Number(projectId),
        model,
      },
      {
        onSuccess: (task) => {
          toast.success(`Task "${task.title}" criada`);
          reset();
          close();
        },
        onError: (err: unknown) => {
          const msg =
            err instanceof ApiError ? `Falha (${err.status})` : "Falha ao criar";
          toast.error(msg);
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nova task</DialogTitle>
          <DialogDescription>
            Cria uma task standalone — bypassa o gerente, enfileira diretamente.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="nt-title">Título</Label>
            <Input
              id="nt-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Resumo curto"
              autoFocus
              required
              maxLength={300}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="nt-prompt">Prompt</Label>
            <textarea
              id="nt-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Instrução completa para o worker"
              required
              rows={5}
              maxLength={20000}
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 font-mono text-xs"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="nt-project">Projeto</Label>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger id="nt-project">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_PROJECT}>— sem projeto —</SelectItem>
                  {(projects.data ?? []).map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nt-model">Modelo</Label>
              <Select value={model} onValueChange={setModel}>
                <SelectTrigger id="nt-model">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="opus">opus</SelectItem>
                  <SelectItem value="sonnet">sonnet</SelectItem>
                  <SelectItem value="haiku">haiku</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="ghost" onClick={() => handleClose(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {createTask.isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
              Criar task
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
