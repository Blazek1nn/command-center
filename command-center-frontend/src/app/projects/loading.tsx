import { ThreeColumnLayout } from "@/components/layout/ThreeColumnLayout";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <ThreeColumnLayout hideRight>
      <div className="mx-auto w-full max-w-5xl space-y-4 p-6">
        <header>
          <Skeleton className="h-6 w-32" />
          <Skeleton className="mt-2 h-4 w-64" />
        </header>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      </div>
    </ThreeColumnLayout>
  );
}
