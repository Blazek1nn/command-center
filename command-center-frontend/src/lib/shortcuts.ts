/**
 * Definição central de todos os atalhos. Single source of truth — usado pelo
 * ShortcutsDialog, pela página /settings/shortcuts e (futuramente) por
 * customização de bindings.
 *
 * As implementações ficam em hooks/use-keyboard.ts e em handlers locais
 * (ex: ChatInput pra Enter/Shift+Enter).
 */

const isMac =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
const Mod = isMac ? "⌘" : "Ctrl";

export interface ShortcutItem {
  label: string;
  keys: string[];
}

export interface ShortcutGroup {
  title: string;
  items: ShortcutItem[];
}

export const SHORTCUTS: ShortcutGroup[] = [
  {
    title: "Sistema",
    items: [
      { label: "Abrir esta lista de atalhos", keys: ["?"] },
      { label: "Abrir paleta de comandos", keys: [Mod, "K"] },
      { label: "Cancelar request em andamento", keys: ["Esc"] },
      { label: "Esconder/mostrar sidebar", keys: [Mod, "\\"] },
    ],
  },
  {
    title: "Criar",
    items: [
      { label: "Novo projeto", keys: [Mod, "N"] },
      { label: "Nova task", keys: [Mod, "T"] },
    ],
  },
  {
    title: "Chat",
    items: [
      { label: "Enviar mensagem", keys: ["Enter"] },
      { label: "Quebrar linha sem enviar", keys: ["Shift", "Enter"] },
      { label: "Slash commands", keys: ["/"] },
    ],
  },
  {
    title: "Navegação",
    items: [
      { label: "Ir pro chat", keys: [Mod, "K", "→ Chat"] },
      { label: "Ir pra projects", keys: [Mod, "K", "→ Projects"] },
      { label: "Ir pra metrics", keys: [Mod, "K", "→ Metrics"] },
    ],
  },
];
