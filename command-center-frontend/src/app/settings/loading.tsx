import { ThreeColumnLayout } from "@/components/layout/ThreeColumnLayout";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <ThreeColumnLayout hideRight>
      <div className="mx-auto w-full max-w-2xl space-y-4 p-6">
        <header>
          <Skeleton className="h-6 w-24" />
          <Skeleton className="mt-2 h-4 w-64" />
        </header>
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    </ThreeColumnLayout>
  );
}
