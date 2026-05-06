"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export function useMetricsSession() {
  return useQuery({
    queryKey: ["metrics", "session"],
    queryFn: () => api.getMetricsSession(),
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    staleTime: 30_000,
  });
}
