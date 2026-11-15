// Configuração por instalação (vem das variáveis do Worker; ver wrangler.template.jsonc e scripts/setup.mjs)
import type { Env } from "./env";

export const cfg = { repo: "", origens: ["http://localhost:5180"] as string[] };

// chamar no começo de cada entrada (fetch e scheduled)
export function configurar(env: Env) {
  cfg.repo = env.ASSETS_REPO || cfg.repo;
  const o = String(env.HUB_ORIGEM ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  cfg.origens = [...new Set([...o, "http://localhost:5180"])];
}
