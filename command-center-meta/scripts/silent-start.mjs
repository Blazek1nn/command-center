#!/usr/bin/env node
/**
 * silent-start.mjs — Portable launcher for Command Center.
 * Resolves uv and pnpm from PATH; no hardcoded user-specific paths.
 */
import { spawn } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..");

const BACKEND  = resolve(ROOT, "command-center-backend");
const FRONTEND = resolve(ROOT, "command-center-frontend");

/** Resolve a CLI tool from PATH, with optional per-platform fallbacks. */
function resolveBin(name, windowsFallbacks = []) {
  try {
    const result = execSync(
      process.platform === "win32" ? `where ${name}` : `which ${name}`,
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
    ).trim().split("\n")[0].trim();
    if (result) return result;
  } catch { /* not on PATH */ }
  for (const fb of windowsFallbacks) {
    const path = fb.replace("%USERPROFILE%", process.env.USERPROFILE ?? "");
    try {
      const { existsSync } = await import("node:fs");
      if (existsSync(path)) return path;
    } catch { /* skip */ }
  }
  return name; // let the OS resolve it — will error if missing
}

const UV   = await resolveBin("uv",   ["%USERPROFILE%\\.local\\bin\\uv.exe"]);
const PNPM = await resolveBin("pnpm", ["%USERPROFILE%\\.local\\pnpm-shim\\node_modules\\.bin\\pnpm.cmd"]);

function start(bin, args, cwd) {
  const isScript = bin.endsWith(".cmd") || bin.endsWith(".bat");
  const [exe, finalArgs] = isScript
    ? ["cmd.exe", ["/c", bin, ...args]]
    : [bin, args];
  spawn(exe, finalArgs, { cwd, stdio: "ignore", detached: true }).unref();
}

start(UV,   ["run", "uvicorn", "command_center.main:app", "--reload", "--port", "8000"], BACKEND);
start(PNPM, ["dev"], FRONTEND);
