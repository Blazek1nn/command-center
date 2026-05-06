"use client";

import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import { useActiveProject } from "@/stores/active-project";

export type SlashResult =
  | { kind: "consumed"; replaceInput?: string }
  | { kind: "passthrough" };

interface Ctx {
  /** Set this to mutate the chat input box's text (e.g., prepend file content). */
  setInputText?: (text: string) => void;
}

const RE = /^\/(\w+)(?:\s+([\s\S]*))?$/;

/**
 * Parses a chat input. If it's a slash command, executes it and returns
 * { kind: "consumed", replaceInput?: string }. Otherwise returns passthrough.
 *
 * "consumed" means: do NOT send to /api/chat. The input box should be cleared
 * unless replaceInput is given (used by /file to prepend content).
 */
export async function handleSlashCommand(
  raw: string,
  ctx: Ctx = {},
): Promise<SlashResult> {
  const trimmed = raw.trimStart();
  if (!trimmed.startsWith("/")) return { kind: "passthrough" };

  const m = trimmed.match(RE);
  if (!m) return { kind: "passthrough" };

  const cmd = m[1]!.toLowerCase();
  const arg = (m[2] ?? "").trim();

  switch (cmd) {
    case "project": {
      if (!arg) {
        toast.error("Uso: /project <nome>");
        return { kind: "consumed" };
      }
      // Find by name in cache
      const projects = await api.listProjects();
      const found = projects.find((p) => p.name === arg);
      if (!found) {
        toast.error(`Projeto "${arg}" não encontrado`);
        return { kind: "consumed" };
      }
      useActiveProject.getState().setActiveProject(found.id, found.name);
      toast.success(`Active project: ${found.name}`);
      return { kind: "consumed" };
    }

    case "run": {
      if (!arg) {
        toast.error("Uso: /run <comando>");
        return { kind: "consumed" };
      }
      const active = useActiveProject.getState();
      try {
        const task = await api.createTask({
          title: `/run ${arg.slice(0, 60)}`,
          prompt: `Execute o seguinte comando shell e reporte o resultado:\n\n\`\`\`bash\n${arg}\n\`\`\``,
          project_id: active.activeProjectId,
          model: "sonnet",
        });
        toast.success(`Task #${task.id} criada`);
      } catch (err) {
        const msg =
          err instanceof ApiError ? `Falha (${err.status})` : "Falha ao criar task";
        toast.error(msg);
      }
      return { kind: "consumed" };
    }

    case "file": {
      if (!arg) {
        toast.error("Uso: /file <path-relativo>");
        return { kind: "consumed" };
      }
      const active = useActiveProject.getState();
      if (!active.activeProjectName) {
        toast.error("Defina o projeto ativo primeiro: /project <nome>");
        return { kind: "consumed" };
      }
      try {
        const file = await api.readFile(active.activeProjectName, arg);
        const fence = "```";
        const block = `${fence}${guessLang(arg)}\n// ${arg}${file.truncated ? " (truncated)" : ""}\n${file.content}\n${fence}\n\n`;
        toast.success(
          `${arg} (${file.bytes} bytes${file.truncated ? ", truncado" : ""}) injetado`,
        );
        return { kind: "consumed", replaceInput: block };
      } catch (err) {
        const msg =
          err instanceof ApiError
            ? err.status === 400
              ? "Path inválido ou fora do projeto"
              : err.status === 404
              ? "Arquivo ou projeto não encontrado"
              : `Falha (${err.status})`
            : "Falha ao ler arquivo";
        toast.error(msg);
        return { kind: "consumed" };
      }
    }

    default:
      toast.error(`Comando desconhecido: /${cmd}`);
      return { kind: "consumed" };
  }
}

function guessLang(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    ts: "ts",
    tsx: "tsx",
    js: "js",
    jsx: "jsx",
    py: "python",
    md: "markdown",
    json: "json",
    yml: "yaml",
    yaml: "yaml",
    sh: "bash",
    go: "go",
    rs: "rust",
    sql: "sql",
    html: "html",
    css: "css",
  };
  return map[ext] ?? "";
}
