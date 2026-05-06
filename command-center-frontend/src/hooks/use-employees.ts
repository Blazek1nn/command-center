"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export function useEmployees() {
  return useQuery({
    queryKey: ["employees"],
    queryFn: () => api.listEmployees(),
    refetchInterval: 4_000,
    refetchIntervalInBackground: false,
    staleTime: 30_000,
  });
}
