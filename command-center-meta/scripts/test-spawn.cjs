const { spawn, spawnSync } = require("child_process");

const UV   = "C:\\Users\\USER\\.local\\bin\\uv.exe";
const PNPM = "C:\\Users\\USER\\.local\\pnpm-shim\\node_modules\\.bin\\pnpm.cmd";
const BACKEND  = "C:\\cc\\command-center-backend";
const FRONTEND = "C:\\cc\\command-center-frontend";

function test(label, bin, args, cwd) {
  return new Promise((resolve) => {
    console.log(`\n[${label}] spawning: ${bin} ${args.slice(0,2).join(" ")} ...`);
    const p = spawn(bin, args, { cwd, stdio: "ignore" });
    const timer = setTimeout(() => {
      console.log(`[${label}] still running after 3s — process alive, no EINVAL`);
      try { p.kill(); } catch {}
      resolve("running");
    }, 3000);
    p.on("error", (e) => {
      clearTimeout(timer);
      console.error(`[${label}] ERROR: ${e.code} — ${e.message}`);
      resolve("error:" + e.code);
    });
    p.on("close", (code) => {
      clearTimeout(timer);
      console.log(`[${label}] closed with code ${code}`);
      resolve("closed:" + code);
    });
  });
}

async function main() {
  // Test 1: uv with full uvicorn args
  await test("uv-full", UV, ["run", "uvicorn", "command_center.main:app", "--reload", "--port", "8000"], BACKEND);

  // Test 2: pnpm.cmd directly
  await test("pnpm-cmd", PNPM, ["dev"], FRONTEND);

  // Test 3: pnpm via cmd.exe /c
  await test("pnpm-via-cmd", "cmd.exe", ["/c", PNPM, "dev"], FRONTEND);

  // Test 4: pnpm via cmd.exe /c with shell:true workaround
  const p4 = spawn("pnpm", ["dev"], { cwd: FRONTEND, stdio: "ignore", shell: true });
  const r4 = await new Promise((resolve) => {
    const t = setTimeout(() => { console.log("[pnpm-shell] still running — OK"); try{p4.kill()}catch{}; resolve("ok"); }, 3000);
    p4.on("error", e => { clearTimeout(t); console.error("[pnpm-shell] ERROR:", e.code); resolve("err"); });
    p4.on("close", c => { clearTimeout(t); console.log("[pnpm-shell] closed:", c); resolve("closed"); });
  });

  console.log("\nDone.");
}

main().catch(console.error);
