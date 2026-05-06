import { cn } from "@/lib/utils";
import type { TaskStatus } from "@/lib/types";

interface StatusPillProps {
  status: TaskStatus | "idle" | "busy" | "offline" | string;
  className?: string;
  label?: string;
}

/**
 * Status com tons calmos da paleta zen — sem cores neon.
 * - pending/idle/cancelled → cinza-papel
 * - running/busy → terracota suave (com pulso)
 * - done → musgo
 * - failed → terracota profunda
 */
const STATUS_STYLES: Record<
  string,
  { dot: string; text: string; bg: string; border: string; pulse?: boolean }
> = {
  pending: {
    dot: "bg-muted-foreground/60",
    text: "text-muted-foreground",
    bg: "bg-muted/60",
    border: "border-border",
  },
  running: {
    dot: "bg-primary",
    text: "text-primary",
    bg: "bg-primary/8",
    border: "border-primary/30",
    pulse: true,
  },
  done: {
    dot: "bg-success",
    text: "text-success",
    bg: "bg-success/8",
    border: "border-success/25",
  },
  failed: {
    dot: "bg-destructive",
    text: "text-destructive",
    bg: "bg-destructive/8",
    border: "border-destructive/30",
  },
  cancelled: {
    dot: "bg-muted-foreground/40",
    text: "text-muted-foreground",
    bg: "bg-muted/50",
    border: "border-border",
  },
  idle: {
    dot: "bg-muted-foreground/50",
    text: "text-muted-foreground",
    bg: "bg-muted/50",
    border: "border-border",
  },
  busy: {
    dot: "bg-primary",
    text: "text-primary",
    bg: "bg-primary/8",
    border: "border-primary/30",
    pulse: true,
  },
  offline: {
    dot: "bg-muted-foreground/30",
    text: "text-muted-foreground/70",
    bg: "bg-muted/40",
    border: "border-border",
  },
};

export function StatusPill({ status, className, label }: StatusPillProps) {
  const s = STATUS_STYLES[status] ?? STATUS_STYLES.pending!;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium",
        s.bg,
        s.text,
        s.border,
        className,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", s.dot, s.pulse && "pulse-dot")} />
      <span className="capitalize">{label ?? status}</span>
    </span>
  );
}
