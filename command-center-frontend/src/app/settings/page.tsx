"use client";

import Link from "next/link";
import { Github, Keyboard, Plug } from "lucide-react";
import { ThreeColumnLayout } from "@/components/layout/ThreeColumnLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ComingSoon } from "@/components/layout/ComingSoon";
import { Button } from "@/components/ui/button";
import { API_URL } from "@/lib/api";

export default function SettingsPage() {
  return (
    <ThreeColumnLayout hideRight>
      <div className="mx-auto w-full max-w-2xl space-y-4 p-6">
        <header>
          <h1 className="text-lg font-semibold">Settings</h1>
          <p className="text-sm text-muted-foreground">
            Configurações do command center.
          </p>
        </header>

        <Card>
          <CardHeader>
            <CardTitle>Backend</CardTitle>
            <CardDescription>URL do backend FastAPI (read-only — defina via .env.local).</CardDescription>
          </CardHeader>
          <CardContent>
            <Label className="text-xs text-muted-foreground">NEXT_PUBLIC_API_URL</Label>
            <Input value={API_URL} readOnly className="font-mono" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plug className="h-4 w-4" />
              Integrações
            </CardTitle>
            <CardDescription>
              GitHub auto-PR e Linear issue updates — fecha o ciclo de dev sem clique manual.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" size="sm">
              <Link href="/settings/integrations">
                <Github className="h-4 w-4" /> Configurar GitHub & Linear
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Keyboard className="h-4 w-4" />
              Atalhos de teclado
            </CardTitle>
            <CardDescription>
              Lista completa de atalhos. Pressione <kbd className="rounded border border-border bg-secondary/60 px-1 py-0.5 font-mono text-[10px]">?</kbd> a qualquer momento.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" size="sm">
              <Link href="/settings/shortcuts">
                <Keyboard className="h-4 w-4" /> Ver todos os atalhos
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            <ComingSoon
              title="Configurações em breve"
              description="Projects root, max workers, modelos default. Por hora, edite o .env do backend."
            />
          </CardContent>
        </Card>
      </div>
    </ThreeColumnLayout>
  );
}
