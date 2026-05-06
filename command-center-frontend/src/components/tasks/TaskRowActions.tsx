"use client";

import * as React from "react";
import { MoreHorizontal, X, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCancelTask, useRetryTask } from "@/hooks/use-tasks";
import type { Task } from "@/lib/types";

interface Props {
  task: Task;
}

export function TaskRowActions({ task }: Props) {
  const cancel = useCancelTask();
  const retry = useRetryTask();
  const canCancel = task.status === "pending" || task.status === "running";
  const canRetry = task.status === "failed" || task.status === "cancelled";

  if (!canCancel && !canRetry) {
    return <span className="text-muted-foreground">—</span>;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-7 w-7">
          <MoreHorizontal className="h-4 w-4" />
          <span className="sr-only">Ações</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {canCancel && (
          <DropdownMenuItem
            onClick={() =>
              cancel.mutate(task.id, {
                onSuccess: () => toast.success(`Task #${task.id} cancelada`),
                onError: () => toast.error("Falha ao cancelar"),
              })
            }
            disabled={cancel.isPending}
          >
            <X className="h-4 w-4" /> Cancelar
          </DropdownMenuItem>
        )}
        {canRetry && (
          <DropdownMenuItem
            onClick={() =>
              retry.mutate(task.id, {
                onSuccess: (newTask) =>
                  toast.success(`Refeita como #${newTask.id}`),
                onError: () => toast.error("Falha ao refazer"),
              })
            }
            disabled={retry.isPending}
          >
            <RotateCcw className="h-4 w-4" /> Refazer
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
