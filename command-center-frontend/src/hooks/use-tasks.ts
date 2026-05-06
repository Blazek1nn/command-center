"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { TaskInput, TaskStatus } from "@/lib/types";

export function useTasks(filters: { project_id?: number; status?: TaskStatus } = {}) {
  return useQuery({
    queryKey: ["tasks", filters],
    queryFn: () => api.listTasks(filters),
    refetchInterval: 5_000,
    refetchIntervalInBackground: false,
    staleTime: 30_000,
  });
}

export function useTask(id: number | null | undefined) {
  return useQuery({
    queryKey: ["tasks", id],
    queryFn: () => api.getTask(id!),
    enabled: id != null,
    refetchInterval: 3_000,
    refetchIntervalInBackground: false,
    staleTime: 10_000,
  });
}

export function useCancelTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.cancelTask(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
  });
}

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: TaskInput) => api.createTask(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
  });
}

export function useRetryTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.retryTask(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
  });
}
