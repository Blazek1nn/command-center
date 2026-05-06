$node  = "C:\Program Files\nodejs\node.exe"
$uv    = "C:\Users\USER\.local\bin\uv.exe"
$pnpm  = "C:\Users\USER\.local\pnpm-shim\node_modules\.bin"
$script = "C:\Users\USER\Desktop\hub- agentes\command-center-meta\scripts\dev.mjs"
$cwd   = "C:\Users\USER\Desktop\hub- agentes\command-center-meta"

# Build full PATH so uv, pnpm and node are all resolvable
$extraPaths = @(
    "C:\Program Files\nodejs",
    "C:\Users\USER\.local\bin",
    $pnpm,
    "C:\Users\USER\.cargo\bin",
    "C:\Program Files\Git\cmd"
)
$env:PATH = ($extraPaths + ($env:PATH -split ";") | Select-Object -Unique) -join ";"

Start-Process -FilePath $node `
    -ArgumentList "`"$script`"" `
    -WorkingDirectory $cwd `
    -WindowStyle Hidden `
    -NoNewWindow:$false
