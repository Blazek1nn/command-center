"use client";

import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
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
import { api, ApiError } from "@/lib/api";
import { useDialogs } from "@/stores/dialogs";

const PATH_PREFIX = "~/projects/";

export function NewProjectDialog() {
  const open = useDialogs((s) => s.newProjectOpen);
  const close = useDialogs((s) => s.closeNewProject);
  const qc = useQueryClient();

  const [name, setName] = React.useState("");
  const [path, setPath] = React.useState("");
  const [description, setDescription] = React.useState("");

  // Auto-fill path from name
  React.useEffect(() => {
    if (name && !path.startsWith(PATH_PREFIX)) return;
    setPath(name ? `${PATH_PREFIX}${name}` : "");
    // intentionally only react to name
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);

  const reset = () => {
    setName("");
    setPath("");
    setDescription("");
  };

  const handleClose = (next: boolean) => {
    if (!next) {
      reset();
      close();
    }
  };

  const mutation = useMutation({
    mutationFn: () =>
      api.createProject({
        name: name.trim(),
        path: path.trim(),
        description: description.trim() || null,
      }),
    onSuccess: (project) => {
      toast.success(`Projeto "${project.name}" criado`);
      qc.invalidateQueries({ queryKey: ["projects"] });
      reset();
      close();
    },
    onError: (err: unknown) => {
      const msg =
        err instanceof ApiError
          ? err.status === 409
            ? "Já existe um projeto com esse nome"
            : `Falha (${err.status})`
          : "Falha ao criar";
      toast.error(msg);
    },
  });

  const canSubmit = name.trim().length > 0 && path.trim().length > 0 && !mutation.isPending;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Novo projeto</DialogTitle>
          <DialogDescription>
            Registra um repositório para o gerente despachar tasks. O path deve existir no disco.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (canSubmit) mutation.mutate();
          }}
          className="space-y-3"
        >
          <div className="space-y-1.5">
            <Label htmlFor="np-name">Nome</Label>
            <Input
              id="np-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="meu-projeto"
              autoFocus
              required
              maxLength={80}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="np-path">Path</Label>
            <Input
              id="np-path"
              value={path}
              onChange={(e) => setPath(e.target.value)}
              placeholder="~/projects/meu-projeto"
              required
              className="font-mono text-xs"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="np-desc">Descrição (opcional)</Label>
            <Input
              id="np-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="O que esse projeto faz?"
              maxLength={500}
            />
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="ghost" onClick={() => handleClose(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {mutation.isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
              Criar projeto
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
