import { ThreeColumnLayout } from "@/components/layout/ThreeColumnLayout";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <ThreeColumnLayout>
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex-1 space-y-3 p-6">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-32 w-3/4" />
          <Skeleton className="h-12 w-full" />
        </div>
        <div className="border-t border-border p-4">
          <Skeleton className="h-12 w-full" />
        </div>
      </div>
    </ThreeColumnLayout>
  );
}
