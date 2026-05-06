"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export function useConversations() {
  return useQuery({
    queryKey: ["conversations"],
    queryFn: () => api.listConversations(),
    staleTime: 10_000,
    refetchOnMount: true,
  });
}

export function useConversation(id: number | null | undefined) {
  return useQuery({
    queryKey: ["conversations", id],
    queryFn: () => api.getConversation(id!),
    enabled: id != null,
    staleTime: 30_000,
  });
}

export function useDeleteConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.deleteConversation(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["conversations"] }),
  });
}
