"use client";

import * as React from "react";
import { Plug, Save, AlertCircle } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

interface McpPanelProps {
  projectId: number;
}

const EXAMPLE_CONFIG = JSON.stringify(
  {
    mcpServers: {
      "my-server": {
        command: "npx",
        args: ["-y", "@my-org/mcp-server"],
        env: {
          API_KEY: "your-key-here",
        },
      },
    },
  },
  null,
  2,
);

export function McpPanel({ projectId }: McpPanelProps) {
  const queryClient = useQueryClient();
  const [rawJson, setRawJson] = React.useState<string | null>(null);
  const [parseError, setParseError] = React.useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["mcps", projectId],
    queryFn: () => api.getMcpConfig(projectId),
  });

  // Initialize editor when data arrives
  React.useEffect(() => {
    if (data && rawJson === null) {
      const isEmpty = !data.config || Object.keys(data.config).length === 0;
      setRawJson(isEmpty ? "" : JSON.stringify(data.config, null, 2));
    }
  }, [data, rawJson]);

  const saveMut = useMutation({
    mutationFn: (config: Record<string, unknown>) => api.saveMcpConfig(projectId, config),
    onSuccess: () => {
      toast.success("mcp.json salvo");
      void queryClient.invalidateQueries({ queryKey: ["mcps", projectId] });
    },
    onError: () => toast.error("Falha ao salvar mcp.json"),
  });

  const handleChange = (value: string) => {
    setRawJson(value);
    if (!value.trim()) {
      setParseError(null);
      return;
    }
    try {
      JSON.parse(value);
      setParseError(null);
    } catch (e) {
      setParseError((e as Error).message);
    }
  };

  const handleSave = () => {
    const text = rawJson?.trim() ?? "";
    if (!text) {
      saveMut.mutate({});
      return;
    }
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>;
      saveMut.mutate(parsed);
    } catch (e) {
      setParseError((e as Error).message);
    }
  };

  const handleLoadExample = () => {
    setRawJson(EXAMPLE_CONFIG);
    setParseError(null);
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-medium">MCP Servers</h2>
        <p className="mt-0.5 text-[13px] text-muted-foreground">
          Configura servidores MCP passados via{" "}
          <code className="font-mono text-[11px]">--mcp-config</code> ao Claude CLI.
          Arquivo fica em{" "}
          <code className="font-mono text-[11px]">.claude/mcp.json</code>
        </p>
      </div>

      {isLoading ? (
        <p className="text-[13px] italic text-muted-foreground">Carregando…</p>
      ) : (
        <>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[12px] text-muted-foreground">
                Edite o JSON diretamente:
              </span>
              <button
                onClick={handleLoadExample}
                className="text-[11px] text-primary/70 hover:text-primary"
              >
                Carregar exemplo
              </button>
            </div>
            <textarea
              value={rawJson ?? ""}
              onChange={(e) => handleChange(e.target.value)}
              rows={18}
              placeholder={EXAMPLE_CONFIG}
              className="w-full resize-y rounded-xl border border-border/60 bg-muted/20 px-4 py-3 font-mono text-[12px] leading-relaxed outline-none focus:border-primary/40"
              spellCheck={false}
            />
            {parseError && (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/8 px-3 py-2 text-[12px] text-destructive">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>JSON inválido: {parseError}</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            <Button
              onClick={handleSave}
              disabled={!!parseError || saveMut.isPending}
              className="gap-1.5"
            >
              <Save className="h-3.5 w-3.5" />
              Salvar mcp.json
            </Button>
            <span className="text-[12px] text-muted-foreground">
              Workers usarão esses MCPs automaticamente.
            </span>
          </div>

          <div className="rounded-xl border border-border/40 bg-muted/20 p-4 text-[12px] text-muted-foreground space-y-1">
            <div className="font-medium text-foreground/70 mb-2 flex items-center gap-1.5">
              <Plug className="h-3.5 w-3.5" />
              Como funciona
            </div>
            <p>O arquivo <code className="font-mono text-[11px]">.claude/mcp.json</code> segue o mesmo formato do Claude Desktop.</p>
            <p>Cada servidor MCP define ferramentas extras disponíveis para os workers (ex: banco de dados, APIs externas, filesystem customizado).</p>
            <p>Reinicialização não necessária — o próximo dispatch já usa o novo config.</p>
          </div>
        </>
      )}
    </div>
  );
}
