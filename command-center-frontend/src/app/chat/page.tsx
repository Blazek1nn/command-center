import { ThreeColumnLayout } from "@/components/layout/ThreeColumnLayout";
import { ChatStream } from "@/components/chat/ChatStream";

export default function ChatPage() {
  return (
    <ThreeColumnLayout>
      <ChatStream />
    </ThreeColumnLayout>
  );
}
