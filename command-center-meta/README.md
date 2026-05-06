# command-center-meta

Repositório guarda-chuva. Sobe **backend + frontend** do command center pessoal em um único comando, com logs lado a lado.

```
~/projects/
├── command-center-backend     ← FastAPI + Claude CLI orchestrator
├── command-center-frontend    ← Next.js 15 (App Router)
└── command-center-meta        ← (este repo)
```

---

## 1. Pré-requisitos

| Ferramenta            | Versão  | Para quê                                |
| --------------------- | ------- | --------------------------------------- |
| Node.js               | ≥ 20    | rodar este orquestrador + frontend Next |
| pnpm                  | ≥ 9     | gerenciar deps do frontend              |
| Python                | 3.13    | backend FastAPI                         |
| uv                    | recente | gerenciador Python (substitui pip/venv) |
| Claude Code CLI       | recente | os agentes rodam via `claude --print`   |

Instalações rápidas (Linux/macOS):

```bash
# uv
curl -LsSf https://astral.sh/uv/install.sh | sh

# pnpm
corepack enable && corepack prepare pnpm@latest --activate

# Claude Code CLI — instruções oficiais:
# https://docs.claude.com/en/docs/claude-code/setup
```

No Windows, use os instaladores nativos ou WSL2.

---

## 2. Setup inicial

```bash
# Clone os 3 repos lado a lado
cd ~/projects
git clone <url> command-center-backend
git clone <url> command-center-frontend
git clone <url> command-center-meta

# Backend
cd ~/projects/command-center-backend
uv sync --extra dev
cp .env.example .env

# Frontend
cd ~/projects/command-center-frontend
pnpm install
cp .env.local.example .env.local

# Meta (este repo)
cd ~/projects/command-center-meta
npm install
```

> Os caminhos default do `dev.mjs` apontam para `~/projects/command-center-{backend,frontend}`. Para outro layout, exporte `BACKEND_DIR` e `FRONTEND_DIR` antes de rodar.

---

## 3. Como rodar

Da raiz deste repo:

```bash
npm run dev
```

Resultado:

- **backend** em `http://localhost:8000` (logs em `magenta`)
- **frontend** em `http://localhost:3000` (logs em `cyan`)
- `Ctrl+C` derruba os dois (`killOthers: ["failure", "success"]`)
- Cada serviço reinicia até **2 vezes** se cair (`restartTries: 2`)

Abra `http://localhost:3000/chat` e converse com o gerente.

---

## 4. Verificar autenticação do Claude Code

Os agentes consomem **créditos da sua conta Pro/Max via OAuth** — não usam `ANTHROPIC_API_KEY`. Antes de tudo, confirme que o CLI está logado:

```bash
claude --print --model haiku "ok"
```

Saída esperada: uma linha de texto. Se pedir login:

```bash
claude login
```

Inspecione `~/.claude.json` (ou equivalente no Windows) para ver a sessão ativa.

---

## 5. Troubleshooting

| Sintoma                                              | Causa provável                                                   | Resolução                                                                                              |
| ---------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `claude: command not found`                          | CLI não instalado / fora do `PATH`                               | Instale o Claude Code CLI; reabra o terminal.                                                          |
| Backend sobe mas todas as tasks falham com `RunnerError: claude CLI exit code 1` | Não logado / token expirado                                      | Rode `claude login` e teste com `claude --print --model haiku "ok"`. Inspecione `~/.claude.json`.       |
| Backend não conecta no Claude (timeouts)             | Firewall / proxy bloqueando `api.anthropic.com`                  | Verifique conectividade do host; cheque variáveis de proxy do sistema.                                  |
| SSE não funciona no frontend (eventos não chegam)    | CORS / URL errada                                                | Confirme `NEXT_PUBLIC_API_URL=http://localhost:8000` no `.env.local`. O backend já libera CORS `*`.     |
| `[backend] Address already in use 8000`              | Outro processo na 8000                                           | `lsof -i :8000` (ou `netstat -ano \| findstr 8000` no Windows) → mate o processo.                      |
| `pnpm: command not found`                            | pnpm fora do PATH (Corepack não ativado)                         | `corepack enable && corepack prepare pnpm@latest --activate`.                                          |
| `uv: command not found`                              | uv não instalado                                                 | `curl -LsSf https://astral.sh/uv/install.sh \| sh`.                                                    |
| `diretório do backend não encontrado`                | Repos em outro lugar                                             | Exporte `BACKEND_DIR=/abs/path` e/ou `FRONTEND_DIR=/abs/path` antes do `npm run dev`.                  |

---

## Comandos

```bash
npm run dev      # sobe backend + frontend em paralelo
npm run setup    # placeholder — adicione um setup.mjs se quiser automatizar instalação
```
