# Command Center — orchestration helper
# Requer: just (https://github.com/casey/just), uv (Python), node + pnpm
# Uso: `just dev`, `just test`, `just lint`, `just typecheck`

set windows-shell := ["powershell.exe", "-NoLogo", "-Command"]

backend_dir := "command-center-backend"
frontend_dir := "command-center-frontend"

# Default: lista comandos disponíveis
default:
    @just --list

# Sobe backend (porta 8000) e frontend (porta 3000) em paralelo.
# No Windows, abre 2 janelas; em Unix usa concurrently nativo do shell.
dev:
    @echo "▶ Backend em http://localhost:8000  ·  Frontend em http://localhost:3000"
    @echo "  (Ctrl+C em cada janela pra parar)"
    just dev-backend &
    just dev-frontend

dev-backend:
    cd {{backend_dir}}/src && uv run uvicorn command_center.main:app --reload --host 0.0.0.0 --port 8000

dev-frontend:
    cd {{frontend_dir}} && pnpm dev --port 3000

# Roda testes dos dois lados
test:
    just test-backend
    just test-frontend

test-backend:
    cd {{backend_dir}} && uv run pytest -q

test-frontend:
    cd {{frontend_dir}} && pnpm test --run

# Type-check sem build
typecheck:
    cd {{backend_dir}} && uv run mypy src/command_center
    cd {{frontend_dir}} && pnpm exec tsc --noEmit

# Lint + format check
lint:
    cd {{backend_dir}} && uv run ruff check src/
    cd {{frontend_dir}} && pnpm lint

format:
    cd {{backend_dir}} && uv run ruff format src/
    cd {{frontend_dir}} && pnpm exec prettier --write "src/**/*.{ts,tsx,css}"

# Health check do backend rodando
health:
    @curl -sS http://localhost:8000/health/deep | python -m json.tool

# Reset do DB (cuidado!)
reset-db:
    @echo "⚠ Apagando command_center.db…"
    cd {{backend_dir}}/src && rm -f command_center.db
    @echo "✓ Removido. Backend recria no próximo start."
