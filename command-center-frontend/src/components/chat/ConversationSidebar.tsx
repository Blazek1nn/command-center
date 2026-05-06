"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Trash2, Plus, MessageSquareText } from "lucide-react";
import { useConversations, useDeleteConversation } from "@/hooks/use-conversations";
import { useChatStore } from "@/stores/chat-store";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, formatRelative } from "@/lib/utils";
import { toast } from "sonner";

export function ConversationSidebar() {
  const { data, isLoading } = useConversations();
  const del = useDeleteConversation();
  const pathname = usePathname();
  const reset = useChatStore((s) => s.reset);
  const setConversationId = useChatStore((s) => s.setConversationId);

  const onNew = () => {
    reset();
    setConversationId(null);
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", "/chat");
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between px-2 pt-2">
        <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
          Conversas
        </span>
        <Button
          asChild
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={onNew}
          aria-label="Nova conversa"
        >
          <Link href="/chat">
            <Plus className="h-3.5 w-3.5" />
          </Link>
        </Button>
      </div>

      <div className="px-1.5">
        {isLoading ? (
          <div className="space-y-1.5 p-1">
            <Skeleton className="h-7 w-full" />
            <Skeleton className="h-7 w-full" />
          </div>
        ) : (data?.length ?? 0) === 0 ? (
          <p className="px-2 py-2 text-[11px] italic text-muted-foreground">
            Sem conversas ainda.
          </p>
        ) : (
          (data ?? []).map((c) => {
            const href = `/chat/${c.id}`;
            const isActive = pathname === href;
            return (
              <div
                key={c.id}
                className={cn(
                  "group flex items-center gap-1 rounded-lg px-1",
                  isActive && "bg-secondary/50",
                )}
              >
                <Link
                  href={href}
                  onClick={() => setConversationId(c.id)}
                  className="flex min-w-0 flex-1 items-center gap-2 px-1.5 py-1.5 text-xs hover:text-foreground"
                >
                  <MessageSquareText className="h-3 w-3 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">
                    {c.title || `Conversa #${c.id}`}
                  </span>
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    {formatRelative(c.updated_at)}
                  </span>
                </Link>
                <button
                  type="button"
                  onClick={() =>
                    del.mutate(c.id, {
                      onSuccess: () => toast.success("Conversa removida"),
                      onError: () => toast.error("Falha ao remover"),
                    })
                  }
                  className="opacity-0 group-hover:opacity-100"
                  aria-label="Remover conversa"
                >
                  <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
