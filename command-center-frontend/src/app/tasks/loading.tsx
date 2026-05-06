import { ThreeColumnLayout } from "@/components/layout/ThreeColumnLayout";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <ThreeColumnLayout hideRight>
      <div className="mx-auto w-full max-w-6xl space-y-4 p-6">
        <header>
          <Skeleton className="h-6 w-24" />
          <Skeleton className="mt-2 h-4 w-64" />
        </header>
        <div className="space-y-2">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      </div>
    </ThreeColumnLayout>
  );
}
