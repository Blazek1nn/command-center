"use client";

import Link from "next/link";
import { ThreeColumnLayout } from "@/components/layout/ThreeColumnLayout";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { StatusPill } from "@/components/status-pill";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useTasks } from "@/hooks/use-tasks";
import { formatRelative, formatCost } from "@/lib/utils";
import { TaskRowActions } from "@/components/tasks/TaskRowActions";

export default function TasksPage() {
  const { data, isLoading } = useTasks();

  return (
    <ThreeColumnLayout hideRight>
      <div className="mx-auto w-full max-w-6xl space-y-4 p-6">
        <header>
          <h1 className="text-lg font-semibold">Tasks</h1>
          <p className="text-sm text-muted-foreground">Histórico completo de execuções.</p>
        </header>

        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border bg-card/40">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Título</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Modelo</TableHead>
                  <TableHead>Custo</TableHead>
                  <TableHead className="text-right">Criada</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data ?? []).map((t) => (
                  <TableRow key={t.id}>
                    <TableCell>
                      <Link href={`/tasks/${t.id}`} className="font-medium hover:underline">
                        {t.title}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <StatusPill status={t.status} />
                    </TableCell>
                    <TableCell>
                      {t.model ? (
                        <Badge variant="muted" className="text-[10px]">{t.model}</Badge>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {formatCost(t.cost_estimate)}
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      {formatRelative(t.created_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      <TaskRowActions task={t} />
                    </TableCell>
                  </TableRow>
                ))}
                {(data?.length ?? 0) === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                      Nenhuma task ainda.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </ThreeColumnLayout>
  );
}
