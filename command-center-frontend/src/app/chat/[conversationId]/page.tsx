"use client";

import * as React from "react";
import { use } from "react";
import { ThreeColumnLayout } from "@/components/layout/ThreeColumnLayout";
import { ChatStream } from "@/components/chat/ChatStream";
import { useConversation } from "@/hooks/use-conversations";
import { useChatStore } from "@/stores/chat-store";

function newId(): string {
  return Math.random().toString(36).slice(2, 11);
}

export default function ChatByConversation({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = use(params);
  const id = Number(conversationId);
  const { data, isLoading } = useConversation(id);
  const setConversationId = useChatStore((s) => s.setConversationId);
  const hydrateMessages = useChatStore((s) => s.hydrateMessages);
  const reset = useChatStore((s) => s.reset);

  React.useEffect(() => {
    if (Number.isNaN(id)) return;
    if (!data) return;
    reset();
    setConversationId(id);
    hydrateMessages(
      data.messages.map((m) => ({
        id: newId(),
        role: m.role === "manager" ? "manager" : m.role === "ceo" ? "ceo" : "system",
        content: m.content,
        createdAt: new Date(m.created_at).getTime(),
      })),
    );
  }, [id, data, reset, setConversationId, hydrateMessages]);

  void isLoading;

  return (
    <ThreeColumnLayout>
      <ChatStream />
    </ThreeColumnLayout>
  );
}
