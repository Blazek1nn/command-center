"use client";

import * as React from "react";
import { Github, CheckCircle2, XCircle, Loader2, Trash2, ExternalLink } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ThreeColumnLayout } from "@/components/layout/ThreeColumnLayout";
import { api } from "@/lib/api";
import type { IntegrationOut, IntegrationTestResult } from "@/lib/types";
import { cn } from "@/lib/utils";

// Linear SVG icon (sem lucide)
function LinearIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} fill="currentColor">
      <path d="M1.22541 61.5228c-.2225-.9485.90748-1.5459 1.59638-.857L39.3342 97.1782c.6889.6889.0915 1.8189-.857 1.5964C20.0515 94.4522 5.54779 79.9485 1.22541 61.5228ZM.00189135 46.8891c-.01764375 1.2233.28024865 2.4347.8563975 3.5059L49.6148 99.1419c1.0712.5761 2.2826.8738 3.5059.8562L.00189135 46.8891ZM5.69803 29.2347c-.2569.8507.1563 1.7433.9262 2.1049L67.7901 94.3088c.3616.7699 1.2542 1.1831 2.1049.9262C94.8658 87.4439 110.016 61.3047 104.29 36.7701 98.5639 12.2354 72.4247-2.91492 47.89 2.81109 23.3553 8.5371 8.20517 34.6763 13.9312 59.2109ZM23.5088 9.5543c1.3287-.5636 2.8029-.0556 3.5791 1.1219l61.2547 61.2547c1.1775.7762 1.6855 2.2504 1.1219 3.5791C82.4208 83.994 72.4149 90 61.2547 90c-11.1603 0-21.1662-6.006-28.2099-14.6457L9.62487 51.9277C3.0054 44.884-2.99991 34.8781-2.99991 23.7179c0-11.1603 6.0054-21.1662 14.6457-28.2099Z" />
    </svg>
  );
}

interface IntegrationCardProps {
  type: "github" | "linear";
  icon: React.ReactNode;
  title: string;
  description: string;
  docsUrl: string;
  tokenPlaceholder: string;
  existing?: IntegrationOut;
  onSave: (token: string) => void;
  onDelete: () => void;
  onTest: () => Promise<IntegrationTestResult>;
  saving: boolean;
}

function IntegrationCard({
  type,
  icon,
  title,
  description,
  docsUrl,
  tokenPlaceholder,
  existing,
  onSave,
  onDelete,
  onTest,
  saving,
}: IntegrationCardProps) {
  const [token, setToken] = React.useState("");
  const [testResult, setTestResult] = React.useState<IntegrationTestResult | null>(null);
  const [testing, setTesting] = React.useState(false);

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await onTest();
      setTestResult(result);
    } finally {
      setTesting(false);
    }
  };

  const connected = !!existing;

  return (
    <div className={cn(
      "rounded-2xl border bg-card/60 p-6 transition-colors",
      connected ? "border-primary/30" : "border-border/60",
    )}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className={cn(
            "flex h-10 w-10 items-center justify-center rounded-xl",
            connected ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
          )}>
            {icon}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-medium">{title}</h3>
              {connected && (
                <span className="flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-2.5 w-2.5" /> Conectado
                </span>
              )}
            </div>
            <p className="mt-0.5 text-[13px] text-muted-foreground">{description}</p>
          </div>
        </div>
        <a
          href={docsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-0.5"
        >
          Docs <ExternalLink className="h-2.5 w-2.5" />
        </a>
      </div>

      {connected && (
        <div className="mt-4 rounded-lg border border-border/40 bg-muted/20 px-3 py-2 text-[12px] text-muted-foreground">
          Token: <code className="font-mono">{existing.token_hint}</code>
          {existing.extra_config && Object.keys(existing.extra_config).length > 0 && (
            <span className="ml-3">Config: {JSON.stringify(existing.extra_config)}</span>
          )}
        </div>
      )}

      <div className="mt-4 space-y-3">
        <div>
          <label className="mb-1 block text-[11px] uppercase tracking-wide text-muted-foreground">
            {connected ? "Atualizar token" : "Token de acesso"}
          </label>
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder={tokenPlaceholder}
            className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 font-mono text-[13px] outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/15"
          />
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={() => { if (token.trim()) { onSave(token.trim()); setToken(""); } }}
            disabled={!token.trim() || saving}
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {connected ? "Atualizar" : "Conectar"}
          </Button>

          {connected && (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={handleTest}
                disabled={testing}
              >
                {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Testar
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={onDelete}
                className="ml-auto text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
        </div>

        {testResult && (
          <div className={cn(
            "flex items-start gap-2 rounded-lg border px-3 py-2 text-[12px]",
            testResult.ok
              ? "border-emerald-500/30 bg-emerald-500/8 text-emerald-700 dark:text-emerald-300"
              : "border-destructive/30 bg-destructive/8 text-destructive",
          )}>
            {testResult.ok
              ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              : <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            }
            <span>
              {testResult.ok
                ? `OK — ${testResult.user ?? ""} ${testResult.email ? `(${testResult.email})` : ""} ${testResult.message ?? ""}`
                : testResult.message ?? "Falha ao conectar"}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function IntegrationsPage() {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ["integrations"],
    queryFn: () => api.listIntegrations(),
  });

  const upsertMut = useMutation({
    mutationFn: ({ type, token }: { type: string; token: string }) =>
      api.upsertIntegration(type, token),
    onSuccess: (_, { type }) => {
      toast.success(`${type} conectado`);
      void queryClient.invalidateQueries({ queryKey: ["integrations"] });
    },
    onError: () => toast.error("Falha ao salvar integração"),
  });

  const deleteMut = useMutation({
    mutationFn: (type: string) => api.deleteIntegration(type),
    onSuccess: (_, type) => {
      toast.success(`${type} desconectado`);
      void queryClient.invalidateQueries({ queryKey: ["integrations"] });
    },
  });

  const integrations = data?.integrations ?? [];
  const github = integrations.find((i) => i.integration_type === "github");
  const linear = integrations.find((i) => i.integration_type === "linear");

  return (
    <ThreeColumnLayout hideRight>
      <div className="mx-auto w-full max-w-2xl px-6 py-10">
        <div className="mb-8">
          <h1 className="font-display text-2xl font-medium tracking-tight">Integrações</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Conecte GitHub e Linear para fechar o ciclo de dev automaticamente —
            auto-PR após task concluída, atualização de issues sem clique.
          </p>
        </div>

        <div className="space-y-4">
          <IntegrationCard
            type="github"
            icon={<Github className="h-5 w-5" />}
            title="GitHub"
            description="Auto-PR ao completar tasks que tocam um repositório git. Usa o gh CLI já autenticado."
            docsUrl="https://cli.github.com/manual/gh_auth_login"
            tokenPlaceholder="ghp_... (Personal Access Token)"
            existing={github}
            onSave={(token) => upsertMut.mutate({ type: "github", token })}
            onDelete={() => deleteMut.mutate("github")}
            onTest={() => api.testIntegration("github")}
            saving={upsertMut.isPending}
          />

          <IntegrationCard
            type="linear"
            icon={<LinearIcon className="h-4 w-4" />}
            title="Linear"
            description="Comenta e atualiza issues do Linear quando uma task é concluída. Requer Personal API Key."
            docsUrl="https://linear.app/settings/api"
            tokenPlaceholder="lin_api_... (Personal API Key)"
            existing={linear}
            onSave={(token) => upsertMut.mutate({ type: "linear", token })}
            onDelete={() => deleteMut.mutate("linear")}
            onTest={() => api.testIntegration("linear")}
            saving={upsertMut.isPending}
          />
        </div>

        <div className="mt-8 rounded-xl border border-border/40 bg-muted/20 p-4 text-[12px] text-muted-foreground space-y-2">
          <p className="font-medium text-foreground/70">Como usar auto-PR</p>
          <ol className="list-decimal space-y-1 pl-4">
            <li>Conecte o GitHub acima (ou verifique que <code className="font-mono">gh auth status</code> está OK)</li>
            <li>No PlanEditor, abra uma task e marque "Auto-PR ao concluir"</li>
            <li>Despache — ao término, um PR é criado automaticamente com as mudanças da task</li>
            <li>O badge 🔗 PR aparece no card da task com link direto</li>
          </ol>
        </div>
      </div>
    </ThreeColumnLayout>
  );
}
