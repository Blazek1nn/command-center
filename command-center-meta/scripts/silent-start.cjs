/**
 * silent-start.cjs — Portable launcher for Command Center (CommonJS version).
 * Resolves uv and pnpm from PATH; no hardcoded user-specific paths.
 */
const { spawn, execSync } = require("child_process");
const path = require("path");
const fs   = require("fs");

const ROOT     = path.resolve(__dirname, "..", "..");
const BACKEND  = path.resolve(ROOT, "command-center-backend");
const FRONTEND = path.resolve(ROOT, "command-center-frontend");

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
    const p = fb.replace("%USERPROFILE%", process.env.USERPROFILE || "");
    if (fs.existsSync(p)) return p;
  }
  return name; // let OS resolve — will error if missing
}

const UV   = resolveBin("uv",   ["%USERPROFILE%\\.local\\bin\\uv.exe"]);
const PNPM = resolveBin("pnpm", ["%USERPROFILE%\\.local\\pnpm-shim\\node_modules\\.bin\\pnpm.cmd"]);

function start(bin, args, cwd) {
  const isScript = bin.endsWith(".cmd") || bin.endsWith(".bat");
  const [exe, finalArgs] = isScript
    ? ["cmd.exe", ["/c", bin, ...args]]
    : [bin, args];
  const p = spawn(exe, finalArgs, { cwd, stdio: "ignore", windowsHide: true });
  p.on("error", () => {});
  p.unref();
}

start(UV,   ["run", "uvicorn", "command_center.main:app", "--reload", "--port", "8000"], BACKEND);
start(PNPM, ["dev"], FRONTEND);
// Daemon global esconde popups de claude.exe
start(UV,   ["run", "python", "-m", "command_center.win_console_hider"], BACKEND);
