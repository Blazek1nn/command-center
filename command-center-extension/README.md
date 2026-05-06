# Command Center — VS Code Extension

Plan, approve, and dispatch coding tasks to AI agents — without leaving VS Code.

## What this does

- **⌘⇧A** → opens the Command Center chat panel in VS Code
- Type a task → Manager agent creates a plan → you approve → Worker agents execute
- Sidebar shows live task history and agent activity
- Auto-detects your workspace folder as the project context

## Prerequisites

1. The **Command Center backend** must be running locally:

```bash
git clone https://github.com/command-center-dev/command-center.git
cd command-center
just dev        # starts backend on :8000
```

2. **Claude Code CLI** must be installed and authenticated:

```bash
claude --print --model haiku "ok"   # should return a line of text
```

## Quick start

1. Install this extension from the VS Code Marketplace
2. Start the backend (`just dev`)
3. Press **⌘⇧A** (Mac) or **Ctrl+Shift+A** (Windows/Linux)
4. Type your task and hit Enter

## Settings

| Setting | Default | Description |
|---|---|---|
| `commandCenter.backendUrl` | `http://localhost:8000` | Backend URL (change if using a different port) |
| `commandCenter.autoDetectProject` | `true` | Use current workspace as project context |

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| ⌘⇧A / Ctrl+Shift+A | Open Command Center chat |
| Enter | Send message |
| Shift+Enter | New line in message |
| Esc | Cancel in-progress request |

## Status bar

The `CC` indicator in the bottom-right status bar shows backend availability:
- Green pulse → backend online
- Orange slash → backend offline (run `just dev`)

## Architecture

The extension talks to the same backend as the web app. It's a thin WebView wrapper — all agent logic lives in the backend. If you already use the web app, the extension gives you the same features from inside VS Code with automatic workspace detection.

## License

Apache 2.0 — see [LICENSE](../LICENSE)
