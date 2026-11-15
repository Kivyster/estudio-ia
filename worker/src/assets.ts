// Guarda as entregas no repo privado de assets (uma pasta por pedido). Só roda se GITHUB_ASSETS_TOKEN existir.
import type { Env } from "./env";

import { cfg } from "./config";

function b64(u: Uint8Array) { let s = ""; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); }

// lê os arquivos de texto de uma pasta do repo (pro Integrador evoluir o jogo em vez de recomeçar)
export async function lerDoGitHub(env: Env, pasta: string, limite: number): Promise<string> {
  if (!env.GITHUB_ASSETS_TOKEN) return "";
  const h = { authorization: `Bearer ${env.GITHUB_ASSETS_TOKEN}`, accept: "application/vnd.github+json", "user-agent": "estudio-worker" };
  const arv = await fetch(`https://api.github.com/repos/${cfg.repo}/git/trees/HEAD?recursive=1`, { headers: h });
  if (!arv.ok) return "";
  const caminhos = ((await arv.json()) as any).tree.map((x: any) => x.path as string)
    .filter((c: string) => c.startsWith(pasta + "/") && !c.includes("/assets/") && !c.includes("/motor/") && !c.endsWith("/index.html") && /\.(html|js|css|md|json)$/.test(c));
  let out = "";
  for (const c of caminhos) {
    if (out.length > limite) break;
    const r = await fetch(`https://api.github.com/repos/${cfg.repo}/contents/${c}`, { headers: { ...h, accept: "application/vnd.github.raw" } });
    if (r.ok) out += `\n### ${c.slice(pasta.length + 1)}\n\`\`\`\n${(await r.text()).slice(0, 8000)}\n\`\`\`\n`;
  }
  return out.slice(0, limite);
}

export async function salvarNoGitHub(env: Env, pasta: string, arquivos: { nome: string; dados: Uint8Array }[], mensagem: string): Promise<string | null> {
  if (!env.GITHUB_ASSETS_TOKEN || !arquivos.length) return null;
  const h = { authorization: `Bearer ${env.GITHUB_ASSETS_TOKEN}`, accept: "application/vnd.github+json", "user-agent": "estudio-worker", "content-type": "application/json" };
  let ok = 0;
  for (const a of arquivos.slice(0, 40)) {
    const caminho = `${pasta}/${a.nome}`.replace(/[^\w./-]/g, "_");
    const url = `https://api.github.com/repos/${cfg.repo}/contents/${caminho}`;
    // se já existir (reprocessamento), precisa do sha pra sobrescrever
    const ant = await fetch(url, { headers: h });
    const sha = ant.ok ? ((await ant.json()) as any).sha : undefined;
    const r = await fetch(url, { method: "PUT", headers: h, body: JSON.stringify({ message: mensagem, content: b64(a.dados), ...(sha ? { sha } : {}) }) });
    if (r.ok) ok++;
  }
  return ok ? `https://github.com/${cfg.repo}/tree/main/${pasta}` : null;
}

// lê um arquivo do repositório de assets (null se não existir); cache por instância do Worker
const cacheArq = new Map<string, Uint8Array | null>();
export async function lerArquivo(env: Env, caminho: string, usarCache = true): Promise<Uint8Array | null> {
  if (usarCache && cacheArq.has(caminho)) return cacheArq.get(caminho)!;
  if (!env.GITHUB_ASSETS_TOKEN) return null;
  const r = await fetch(`https://api.github.com/repos/${cfg.repo}/contents/${caminho}`, { headers: { authorization: `Bearer ${env.GITHUB_ASSETS_TOKEN}`, accept: "application/vnd.github.raw", "user-agent": "estudio-worker" } });
  const v = r.ok ? new Uint8Array(await r.arrayBuffer()) : null;
  cacheArq.set(caminho, v);
  return v;
}
// manual da API do motor (vai na entrada de quem escreve código do jogo)
export async function apiDoMotor(env: Env): Promise<string> {
  const b = await lerArquivo(env, "motor/API.md");
  return b ? new TextDecoder().decode(b) : "";
}
