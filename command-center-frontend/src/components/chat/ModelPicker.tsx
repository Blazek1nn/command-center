"use client";

import * as React from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown, Sparkles, Zap, Brain } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ModelAlias } from "@/lib/types";

interface ModelPickerProps {
  value: ModelAlias | "auto";
  onChange: (value: ModelAlias | "auto") => void;
  disabled?: boolean;
}

interface ModelMeta {
  label: string;
  short: string;
  icon: React.ElementType;
  hint: string;
  costColor: string;
}

const MODEL_META: Record<ModelAlias | "auto", ModelMeta> = {
  auto: {
    label: "Auto",
    short: "Auto",
    icon: Sparkles,
    hint: "Detecta small-talk → Haiku, planejamento → Sonnet",
    costColor: "text-emerald-500",
  },
  haiku: {
    label: "Haiku 4.5",
    short: "Haiku",
    icon: Zap,
    hint: "Mais rápido e barato. Ideal pra perguntas simples ($0.80/M)",
    costColor: "text-emerald-500",
  },
  sonnet: {
    label: "Sonnet 4.6",
    short: "Sonnet",
    icon: Brain,
    hint: "Equilibrado. Bom pra planejamento ($3/M)",
    costColor: "text-amber-500",
  },
  opus: {
    label: "Opus 4.7",
    short: "Opus",
    icon: Sparkles,
    hint: "Mais inteligente, mais caro. Use só pra tarefas complexas ($15/M)",
    costColor: "text-rose-500",
  },
};

export function ModelPicker({ value, onChange, disabled }: ModelPickerProps) {
  const meta = MODEL_META[value];
  const Icon = meta.icon;

  return (
    <SelectPrimitive.Root
      value={value}
      onValueChange={(v) => onChange(v as ModelAlias | "auto")}
      disabled={disabled}
    >
      <SelectPrimitive.Trigger
        className={cn(
          "flex h-9 items-center gap-1.5 rounded-lg border border-border/50 bg-background/60 px-2.5 py-1 text-xs font-medium",
          "hover:bg-background hover:border-border transition-colors",
          "focus:outline-none focus:ring-1 focus:ring-primary/30",
          "disabled:cursor-not-allowed disabled:opacity-50",
        )}
        aria-label="Escolher modelo"
      >
        <Icon className={cn("h-3.5 w-3.5", meta.costColor)} />
        <SelectPrimitive.Value>{meta.short}</SelectPrimitive.Value>
        <SelectPrimitive.Icon>
          <ChevronDown className="h-3 w-3 opacity-50" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>

      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          side="top"
          align="start"
          sideOffset={6}
          className={cn(
            "z-50 min-w-[260px] overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-lg",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
          )}
        >
          <SelectPrimitive.Viewport className="p-1">
            {(["auto", "haiku", "sonnet", "opus"] as const).map((id) => {
              const m = MODEL_META[id];
              const ItemIcon = m.icon;
              return (
                <SelectPrimitive.Item
                  key={id}
                  value={id}
                  className={cn(
                    "relative flex cursor-pointer select-none items-start gap-2 rounded-md px-2 py-2 text-sm outline-none",
                    "focus:bg-accent focus:text-accent-foreground",
                    "data-[state=checked]:bg-accent/50",
                  )}
                >
                  <ItemIcon className={cn("mt-0.5 h-4 w-4 shrink-0", m.costColor)} />
                  <div className="flex-1">
                    <div className="flex items-center gap-1.5">
                      <SelectPrimitive.ItemText>
                        <span className="font-medium">{m.label}</span>
                      </SelectPrimitive.ItemText>
                      <SelectPrimitive.ItemIndicator>
                        <Check className="h-3.5 w-3.5 text-primary" />
                      </SelectPrimitive.ItemIndicator>
                    </div>
                    <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground">
                      {m.hint}
                    </p>
                  </div>
                </SelectPrimitive.Item>
              );
            })}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}

// localStorage helper — preferência por projeto/global
const STORAGE_KEY = "cc.preferred_model";

export function loadPreferredModel(): ModelAlias | "auto" {
  if (typeof window === "undefined") return "auto";
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v === "auto" || v === "haiku" || v === "sonnet" || v === "opus") return v;
  } catch {
    // ignore
  }
  return "auto";
}

export function savePreferredModel(value: ModelAlias | "auto"): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // ignore
  }
}
