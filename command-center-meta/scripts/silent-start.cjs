const { spawn } = require("child_process");

const UV   = "C:\\Users\\USER\\.local\\bin\\uv.exe";
const PNPM = "C:\\Users\\USER\\.local\\pnpm-shim\\node_modules\\.bin\\pnpm.cmd";

const BACKEND  = "C:\\cc\\command-center-backend";
const FRONTEND = "C:\\cc\\command-center-frontend";

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
// Daemon global esconde popups de claude.exe (Command Center + Claude Code CLI)
start(UV,   ["run", "python", "-m", "command_center.win_console_hider"], BACKEND);
