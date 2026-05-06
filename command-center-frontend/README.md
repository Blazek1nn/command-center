# command-center-frontend

UI do command center pessoal. Conversa com o backend FastAPI em `http://localhost:8000`.

## Stack

- Next.js 15 (App Router) + TypeScript estrito
- shadcn/ui + Tailwind v4 (CSS-first via `@theme`)
- TanStack Query v5 + Zustand
- lucide-react · sonner · recharts · framer-motion · date-fns

## Setup

```bash
pnpm install
cp .env.local.example .env.local
pnpm dev          # http://localhost:3000
```

Por padrão o app espera o backend em `NEXT_PUBLIC_API_URL=http://localhost:8000`.

## Foco

A rota `/chat` é o coração do app — fluxo SSE end-to-end (CEO → Manager → Tasks → Report). As demais (`/projects`, `/tasks`, `/employees`, `/settings`) já estão roteadas e em estado mínimo, prontas para evoluir.

## Comandos

```bash
pnpm dev          # next dev
pnpm build        # next build
pnpm typecheck    # tsc --noEmit
pnpm lint
```
