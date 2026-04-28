#!/usr/bin/env node
/**
 * Sobe backend (FastAPI/uv) + frontend (Next.js/pnpm) em paralelo.
 * Usa child_process.spawn com windowsHide:true — nenhuma janela CMD aparece.
 *
 * Env overrides:
 *   BACKEND_DIR=/path/to/command-center-backend
 *   FRONTEND_DIR=/path/to/command-center-frontend
 */
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";

const IS_WIN = process.platform === "win32";

// Resolve relative to this script: meta/scripts/dev.mjs → meta/../command-center-*
const META_ROOT = path.resolve(import.meta.dirname, "..");
const REPO_ROOT = path.resolve(META_ROOT, "..");

const BACKEND =
  process.env.BACKEND_DIR ??
  path.join(REPO_ROOT, "command-center-backend");
const FRONTEND =
  process.env.FRONTEND_DIR ??
  path.join(REPO_ROOT, "command-center-frontend");

for (const [name, dir] of [
  ["backend", BACKEND],
  ["frontend", FRONTEND],
]) {
  if (!fs.existsSync(dir)) {
    console.error(
      `[meta] diretório do ${name} não encontrado: ${dir}\n` +
        `  defina ${name.toUpperCase()}_DIR no env ou ajuste o caminho.`,
    );
    process.exit(1);
  }
}

const RESET = "\x1b[0m";

/** No Windows, ferramentas npm precisam do sufixo .cmd para serem achadas. */
function winCmd(name) {
  return IS_WIN ? `${name}.cmd` : name;
}

const processes = [];

function startProcess(label, bin, args, cwd, color) {
  const prefix = `${color}[${label}]${RESET} `;

  const proc = spawn(bin, args, {
    cwd,
    stdio: "pipe",
    windowsHide: true, // ← suprime janelas CMD no Windows
  });

  proc.stdout.on("data", (chunk) => {
    chunk
      .toString()
      .split("\n")
      .forEach((line) => {
        if (line.trim()) process.stdout.write(prefix + line + "\n");
      });
  });

  proc.stderr.on("data", (chunk) => {
    chunk
      .toString()
      .split("\n")
      .forEach((line) => {
        if (line.trim()) process.stderr.write(prefix + line + "\n");
      });
  });

  proc.on("close", (code) => {
    console.log(`${prefix}encerrado (código ${code ?? "?"}).`);
    // Quando um processo morre, encerra o outro também
    processes.forEach((p) => {
      try {
        p.kill("SIGTERM");
      } catch {}
    });
    setTimeout(() => process.exit(code ?? 1), 400);
  });

  proc.on("error", (err) => {
    console.error(`${prefix}falha ao iniciar: ${err.message}`);
  });

  processes.push(proc);
  return proc;
}

startProcess(
  "backend",
  "uv",
  ["run", "uvicorn", "command_center.main:app", "--reload", "--port", "8000"],
  BACKEND,
  "\x1b[35m", // magenta
);

startProcess(
  "frontend",
  winCmd("pnpm"),
  ["dev"],
  FRONTEND,
  "\x1b[36m", // cyan
);

// Ctrl+C encerra tudo limpo
process.on("SIGINT", () => {
  processes.forEach((p) => {
    try {
      p.kill("SIGTERM");
    } catch {}
  });
  process.exit(0);
});
