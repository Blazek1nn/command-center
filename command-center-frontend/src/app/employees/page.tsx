"use client";

import { ThreeColumnLayout } from "@/components/layout/ThreeColumnLayout";
import { WorkerCard } from "@/components/workers/WorkerCard";
import { Skeleton } from "@/components/ui/skeleton";
import { useEmployees } from "@/hooks/use-employees";

export default function EmployeesPage() {
  const { data, isLoading } = useEmployees();

  return (
    <ThreeColumnLayout hideRight>
      <div className="mx-auto w-full max-w-5xl space-y-4 p-6">
        <header>
          <h1 className="text-lg font-semibold">Workers</h1>
          <p className="text-sm text-muted-foreground">
            Status atual dos funcionários virtuais.
          </p>
        </header>

        {isLoading ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        ) : (data?.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum worker registrado. Eles surgem ao despachar a primeira task.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {data!.map((w) => (
              <WorkerCard key={w.id} worker={w} />
            ))}
          </div>
        )}
      </div>
    </ThreeColumnLayout>
  );
}
