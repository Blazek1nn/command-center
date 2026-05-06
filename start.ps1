# start.ps1 — Launch Command Center (backend + frontend) on Windows.
# Resolves uv/pnpm/node from PATH automatically; no hardcoded user paths.

$root   = Split-Path -Parent $MyInvocation.MyCommand.Path
$script = Join-Path $root "command-center-meta\scripts\dev.mjs"
$cwd    = Join-Path $root "command-center-meta"

# Find node: prefer PATH, fall back to common install locations
$node = Get-Command node -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source
if (-not $node) {
    $fallbacks = @(
        "C:\Program Files\nodejs\node.exe",
        "$env:ProgramFiles\nodejs\node.exe"
    )
    $node = $fallbacks | Where-Object { Test-Path $_ } | Select-Object -First 1
}
if (-not $node) { Write-Error "node not found. Install Node.js first."; exit 1 }

# Augment PATH so uv, pnpm, cargo tools are resolvable by child processes
$extraPaths = @(
    "$env:USERPROFILE\.local\bin",
    "$env:USERPROFILE\.local\pnpm-shim\node_modules\.bin",
    "$env:USERPROFILE\.cargo\bin",
    "C:\Program Files\nodejs",
    "C:\Program Files\Git\cmd"
) | Where-Object { Test-Path $_ }

$env:PATH = ($extraPaths + ($env:PATH -split ";") | Select-Object -Unique) -join ";"

Start-Process -FilePath $node `
    -ArgumentList "`"$script`"" `
    -WorkingDirectory $cwd `
    -WindowStyle Hidden `
    -NoNewWindow:$false
