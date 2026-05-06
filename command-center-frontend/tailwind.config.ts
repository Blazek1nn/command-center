/**
 * Tailwind v4 é CSS-first — a configuração canônica está em
 * `src/app/globals.css` dentro do bloco `@theme inline { ... }`.
 *
 * Este arquivo existe apenas para que ferramentas (IDE, plugins) que
 * ainda esperam um config TS continuem funcionando. Não adicione
 * tokens de design aqui — adicione-os no globals.css.
 */
import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx,mdx}"],
};

export default config;
