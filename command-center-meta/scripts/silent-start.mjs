#!/usr/bin/env node
import { spawn } from "node:child_process";

const UV   = "C:\\Users\\USER\\.local\\bin\\uv.exe";
const PNPM = "C:\\Users\\USER\\.local\\pnpm-shim\\node_modules\\.bin\\pnpm.cmd";
const NODE = "C:\\Program Files\\nodejs\\node.exe";

const BACKEND  = "C:\\cc\\command-center-backend";
const FRONTEND = "C:\\cc\\command-center-frontend";

function start(bin, args, cwd) {
  spawn(bin, args, { cwd, stdio: "ignore", detached: true }).unref();
}

start(UV,   ["run", "uvicorn", "command_center.main:app", "--reload", "--port", "8000"], BACKEND);
start(PNPM, ["dev"], FRONTEND);
