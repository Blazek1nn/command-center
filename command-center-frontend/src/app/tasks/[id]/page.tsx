"use client";

import { use } from "react";
import { ThreeColumnLayout } from "@/components/layout/ThreeColumnLayout";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusPill } from "@/components/status-pill";
import { useTask, useCancelTask } from "@/hooks/use-tasks";
import { Button } from "@/components/ui/button";
import { formatCost, formatDuration, formatRelative } from "@/lib/utils";
import { toast } from "sonner";

export default function TaskDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const taskId = Number(id);
  const { data, isLoading } = useTask(taskId);
  const cancel = useCancelTask();

  return (
    <ThreeColumnLayout hideRight>
      <div className="mx-auto w-full max-w-3xl space-y-4 p-6">
        {isLoading || !data ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <>
            <header className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="truncate text-lg font-semibold">{data.title}</h1>
                <div className="mt-1 flex items-center gap-2">
                  <StatusPill status={data.status} />
                  {data.model && <Badge variant="muted">{data.model}</Badge>}
                  <span className="text-xs text-muted-foreground">
                    criada {formatRelative(data.created_at)}
                  </span>
                </div>
              </div>
              {(data.status === "pending" || data.status === "running") && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() =>
                    cancel
                      .mutateAsync(taskId)
                      .then(() => toast.success("Task cancelada."))
                      .catch((e) => toast.error(`Falha: ${(e as Error).message}`))
                  }
                  disabled={cancel.isPending}
                >
                  Cancelar
                </Button>
              )}
            </header>

            <Card>
              <CardHeader>
                <CardTitle>Prompt</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="whitespace-pre-wrap font-mono text-xs">
                  {data.prompt || "—"}
                </pre>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Output</CardTitle>
              </CardHeader>
              <CardContent>
                {data.output ? (
                  <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded bg-background/60 p-3 font-mono text-xs leading-relaxed text-foreground/90 scrollbar-thin">
                    {data.output}
                  </pre>
                ) : (
                  <p className="text-sm text-muted-foreground">Sem output ainda.</p>
                )}
              </CardContent>
            </Card>

            {data.error && (
              <Card className="border-red-500/30">
                <CardHeader>
                  <CardTitle className="text-red-300">Erro</CardTitle>
                </CardHeader>
                <CardContent>
                  <pre className="whitespace-pre-wrap font-mono text-xs text-red-300">
                    {data.error}
                  </pre>
                </CardContent>
              </Card>
            )}

            <div className="grid grid-cols-3 gap-3 text-xs">
              <Card>
                <CardContent className="p-3">
                  <div className="text-muted-foreground">Custo</div>
                  <div className="mt-1 font-mono">{formatCost(data.cost_estimate)}</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3">
                  <div className="text-muted-foreground">Iniciada</div>
                  <div className="mt-1">{formatRelative(data.started_at)}</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3">
                  <div className="text-muted-foreground">Duração</div>
                  <div className="mt-1 font-mono">
                    {data.started_at && data.completed_at
                      ? formatDuration(
                          new Date(data.completed_at).getTime() -
                            new Date(data.started_at).getTime(),
                        )
                      : "—"}
                  </div>
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>
    </ThreeColumnLayout>
  );
}
