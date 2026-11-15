// Entregas no hub: lista do que a equipe produziu (prévias, áudios) e o jogo de cada projeto jogável no navegador.
// Imagens, áudios e o jogo abrem por link assinado (HMAC da senha do hub): o navegador não manda cabeçalho em <img>/<audio>/<iframe>,
// e o link nunca carrega a senha em si.
import type { Env } from "./env";
import { cfg } from "./config";

const MIMES: Record<string, string> = { html: "text/html; charset=utf-8", js: "text/javascript; charset=utf-8", css: "text/css", json: "application/json", tmj: "application/json", png: "image/png", jpg: "image/jpeg", wav: "audio/wav", md: "text/markdown; charset=utf-8" };

export async function assinatura(env: Env, oque: string): Promise<string> {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.HUB_SENHA ?? "sem-senha"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const s = new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(oque)));
  return [...s.slice(0, 12)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function confere(env: Env, oque: string, tok: string) {
  const certo = await assinatura(env, oque); let d = certo.length ^ tok.length;
  for (let i = 0; i < certo.length; i++) d |= certo.charCodeAt(i) ^ (tok.charCodeAt(i) || 0);
  return d === 0;
}

// GET /hub/entregas (já autenticado pelo hub)
export async function listarEntregas(env: Env, base: string) {
  const tarefas = (await env.DB.prepare(`SELECT t.id, t.cargo, t.funcionario, t.concluida_em, t.pedido_id FROM tarefas t
    WHERE t.status='concluida' AND EXISTS (SELECT 1 FROM arquivos a WHERE a.tarefa_id=t.id) ORDER BY t.id DESC LIMIT 16`).all<any>()).results;
  const arqs = tarefas.length ? (await env.DB.prepare(`SELECT id, tarefa_id, nome, mime, preview FROM arquivos WHERE tarefa_id IN (${tarefas.map(() => "?").join(",")}) ORDER BY id`).bind(...tarefas.map((t) => t.id)).all<any>()).results : [];
  const comLink = await Promise.all(arqs.map(async (a) => ({ ...a, url: `${base}/arq/${a.id}/${await assinatura(env, "arq:" + a.id)}/${encodeURIComponent(a.nome)}` })));
  const projetos = (await env.DB.prepare("SELECT id, nome, slug, status, marco, max_marcos, ultimo_teste FROM projetos ORDER BY id DESC LIMIT 8").all<any>()).results;
  return {
    entregas: tarefas.map((t) => ({ ...t, arquivos: comLink.filter((a) => a.tarefa_id === t.id).filter((a) => a.preview || a.mime.startsWith("audio/")).slice(0, 4) })),
    projetos: await Promise.all(projetos.map(async (p) => ({ ...p, jogo: `${base}/jogo/${p.slug}/${await assinatura(env, "jogo:" + p.slug)}/index.html` }))),
  };
}

// GET /arq/<id>/<tok>/<nome>  e  GET /jogo/<slug>/<tok>/<caminho>
export async function servirAssinado(env: Env, url: URL): Promise<Response | null> {
  const p = url.pathname.split("/").filter(Boolean);
  if (p[0] === "arq" && p.length >= 3) {
    if (!(await confere(env, "arq:" + p[1], p[2]))) return new Response("link inválido", { status: 403 });
    const a = await env.DB.prepare("SELECT nome, mime, dados FROM arquivos WHERE id=?").bind(Number(p[1])).first<any>();
    if (!a) return new Response("não encontrado", { status: 404 });
    return new Response(Uint8Array.from(atob(a.dados), (c) => c.charCodeAt(0)), { headers: { "content-type": a.mime, "cache-control": "private, max-age=86400" } });
  }
  if (p[0] === "jogo" && p.length >= 3) {
    const slug = p[1].replace(/[^\w-]/g, "");
    if (!(await confere(env, "jogo:" + slug, p[2]))) return new Response("link inválido", { status: 403 });
    const caminho = p.slice(3).map(decodeURIComponent).join("/") || "index.html";
    if (caminho.includes("..")) return new Response("caminho inválido", { status: 400 });
    const r = await fetch(`https://api.github.com/repos/${cfg.repo}/contents/projetos/${slug}/jogo/${caminho}`, { headers: { authorization: `Bearer ${env.GITHUB_ASSETS_TOKEN}`, accept: "application/vnd.github.raw", "user-agent": "estudio-worker" } });
    if (!r.ok) return new Response("não encontrado", { status: 404 });
    const ext = caminho.split(".").pop() ?? "";
    return new Response(r.body, { headers: { "content-type": MIMES[ext] ?? "application/octet-stream", "cache-control": "private, max-age=60", "x-frame-options": "SAMEORIGIN", "content-security-policy": `frame-ancestors ${cfg.origens.join(" ")}` } });
  }
  return null;
}
