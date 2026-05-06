"use client";

import { useEffect } from "react";
import { useDialogs } from "@/stores/dialogs";

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return (
    el.tagName === "INPUT" ||
    el.tagName === "TEXTAREA" ||
    el.isContentEditable
  );
}

export function useGlobalKeyboard() {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey;
      const typing = isTypingTarget(e.target);

      // Esc — cancela request SSE em andamento. Funciona mesmo dentro de
      // input/textarea pra dar uma escape hatch consistente.
      if (e.key === "Escape") {
        const cancel = useDialogs.getState().cancelHandler;
        if (cancel) {
          cancel();
          // Não preventDefault — Esc também fecha dialogs nativos do shadcn.
        }
        return;
      }

      // ? — abre o dialog de atalhos. Só dispara FORA de campos de texto
      // (senão atrapalha digitação normal).
      if (e.key === "?" && !typing && !meta) {
        e.preventDefault();
        useDialogs.getState().openShortcuts();
        return;
      }

      if (!meta) return;

      // Cmd+\ — toggle sidebar. Funciona mesmo digitando (atalho útil
      // pra dar mais espaço de escrita rápido).
      if (e.key === "\\") {
        e.preventDefault();
        useDialogs.getState().toggleSidebar();
        return;
      }

      if (typing) return;

      if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        useDialogs.getState().openNewProject();
      } else if (e.key === "t" || e.key === "T") {
        e.preventDefault();
        useDialogs.getState().openNewTask();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
