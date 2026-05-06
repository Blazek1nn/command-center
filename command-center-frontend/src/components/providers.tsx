"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { NewProjectDialog } from "@/components/projects/NewProjectDialog";
import { NewTaskDialog } from "@/components/tasks/NewTaskDialog";
import { ShortcutsDialog } from "@/components/shortcuts/ShortcutsDialog";
import { useGlobalKeyboard } from "@/hooks/use-keyboard";
import { useActiveProject } from "@/stores/active-project";
import { analytics } from "@/lib/analytics";

function GlobalDialogs() {
  useGlobalKeyboard();
  return (
    <>
      <NewProjectDialog />
      <NewTaskDialog />
      <ShortcutsDialog />
    </>
  );
}

function PostHogPageView() {
  const pathname = usePathname();
  const lastPath = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (pathname && pathname !== lastPath.current) {
      lastPath.current = pathname;
      analytics.page(pathname);
    }
  }, [pathname]);

  return null;
}

function ZustandHydration() {
  // Stores que usam `skipHydration: true` precisam ser rehidratados no client
  // pra evitar SSR mismatch. Roda 1x após mount.
  React.useEffect(() => {
    void useActiveProject.persist.rehydrate();
  }, []);
  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // 30s: balanço entre frescor e custo. Invalidações explícitas
            // (queryClient.invalidateQueries) cobrem os pontos críticos.
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={client}>
      <TooltipProvider delayDuration={250}>
        <ZustandHydration />
        <PostHogPageView />
        {children}
        <GlobalDialogs />
        <Toaster richColors position="bottom-right" />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
