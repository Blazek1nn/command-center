"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  BarChart3,
  Briefcase,
  Keyboard,
  ListTodo,
  MessageSquare,
  Plus,
  Settings as SettingsIcon,
  Users,
} from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { useProjects } from "@/hooks/use-projects";
import { useActiveProject } from "@/stores/active-project";
import { useDialogs } from "@/stores/dialogs";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CommandPalette({ open, onOpenChange }: Props) {
  const router = useRouter();
  const projects = useProjects();
  const setActiveProject = useActiveProject((s) => s.setActiveProject);

  const go = (href: string) => {
    onOpenChange(false);
    router.push(href);
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Buscar página, projeto, ação…" />
      <CommandList>
        <CommandEmpty>Nada encontrado.</CommandEmpty>

        <CommandGroup heading="Navegar">
          <CommandItem onSelect={() => go("/chat")}>
            <MessageSquare className="h-4 w-4 text-muted-foreground" /> Chat
          </CommandItem>
          <CommandItem onSelect={() => go("/projects")}>
            <Briefcase className="h-4 w-4 text-muted-foreground" /> Projects
          </CommandItem>
          <CommandItem onSelect={() => go("/tasks")}>
            <ListTodo className="h-4 w-4 text-muted-foreground" /> Tasks
          </CommandItem>
          <CommandItem onSelect={() => go("/metrics")}>
            <BarChart3 className="h-4 w-4 text-muted-foreground" /> Metrics
          </CommandItem>
          <CommandItem onSelect={() => go("/employees")}>
            <Users className="h-4 w-4 text-muted-foreground" /> Workers
          </CommandItem>
          <CommandItem onSelect={() => go("/settings")}>
            <SettingsIcon className="h-4 w-4 text-muted-foreground" /> Settings
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Ações">
          <CommandItem
            onSelect={() => {
              onOpenChange(false);
              useDialogs.getState().openNewProject();
            }}
          >
            <Plus className="h-4 w-4 text-muted-foreground" /> Criar projeto
            <kbd className="ml-auto rounded border border-border bg-secondary/60 px-1.5 py-0.5 font-mono text-[10px]">
              ⌘N
            </kbd>
          </CommandItem>
          <CommandItem
            onSelect={() => {
              onOpenChange(false);
              useDialogs.getState().openNewTask();
            }}
          >
            <ListTodo className="h-4 w-4 text-muted-foreground" /> Criar task
            <kbd className="ml-auto rounded border border-border bg-secondary/60 px-1.5 py-0.5 font-mono text-[10px]">
              ⌘T
            </kbd>
          </CommandItem>
          <CommandItem
            onSelect={() => {
              onOpenChange(false);
              useDialogs.getState().openShortcuts();
            }}
          >
            <Keyboard className="h-4 w-4 text-muted-foreground" /> Ver todos os atalhos
            <kbd className="ml-auto rounded border border-border bg-secondary/60 px-1.5 py-0.5 font-mono text-[10px]">
              ?
            </kbd>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Projetos">
          {(projects.data ?? []).map((p) => (
            <CommandItem
              key={p.id}
              onSelect={() => {
                setActiveProject(p.id, p.name);
                go(`/projects/${p.id}`);
              }}
            >
              <Briefcase className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{p.name}</span>
              <span className="ml-2 truncate text-xs text-muted-foreground">
                {p.path}
              </span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
