// API do hub (escritório pixel art). Protegida pela senha simples HUB_SENHA, enviada no cabeçalho x-hub-senha.
import type { Env } from "./env";
import { cfg } from "./config";
import { aprovarPedido, cancelarPedido, usoHoje } from "./office";
import { criarProjeto } from "./projetos";
import { listarEntregas } from "./entregas";

// só o próprio hub (e a prévia local) podem chamar esta API pelo navegador
let CORS: Record<string, string> = {
  "access-control-allow-origin": "", "vary": "origin",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type, x-hub-senha",
};
const resp = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { "content-type": "application/json; charset=utf-8", ...CORS } });

// comparação em tempo constante (não vaza quantos caracteres acertaram)
export function iguais(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let d = x.length ^ y.length; for (let i = 0; i < Math.max(x.length, y.length); i++) d |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return d === 0;
}
const MAX_ERROS_HORA = 8;

export async function hub(req: Request, env: Env, url: URL): Promise<Response> {
  const origem = req.headers.get("origin") ?? "";
  CORS = { ...CORS, "access-control-allow-origin": cfg.origens.includes(origem) ? origem : cfg.origens[0] };
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  // bloqueio por IP depois de muitas senhas erradas na mesma hora
  const ip = req.headers.get("cf-connecting-ip") ?? "?", hora = new Date().toISOString().slice(0, 13);
  const t = await env.DB.prepare("SELECT n FROM tentativas WHERE ip=? AND hora=?").bind(ip, hora).first<{ n: number }>();
  if ((t?.n ?? 0) >= MAX_ERROS_HORA) return resp({ erro: "muitas tentativas erradas; espere a próxima hora" }, 429);
  if (!env.HUB_SENHA || !iguais(req.headers.get("x-hub-senha") ?? "", env.HUB_SENHA)) {
    await env.DB.prepare("INSERT INTO tentativas (ip, hora, n) VALUES (?, ?, 1) ON CONFLICT(ip, hora) DO UPDATE SET n = n + 1").bind(ip, hora).run();
    return resp({ erro: "senha incorreta" }, 401);
  }

  if (url.pathname === "/hub/estado") {
    const [func, uso, eventos, fila, esperando] = await Promise.all([
      env.DB.prepare("SELECT id, nome, provedor, status, pausado_ate, tarefa_atual, cargo_atual, tarefas_feitas, cota FROM funcionarios WHERE ativo=1 ORDER BY provedor, id").all<any>(),
      usoHoje(env),
      env.DB.prepare("SELECT id, em, funcionario, tipo, texto FROM eventos ORDER BY id DESC LIMIT 25").all<any>(),
      env.DB.prepare("SELECT status, COUNT(*) n FROM tarefas GROUP BY status").all<any>(),
      env.DB.prepare("SELECT id, texto, criado_em FROM pedidos WHERE status='aguardando_ok' ORDER BY id").all<any>(),
    ]);
    const planos = await Promise.all(esperando.results.map(async (p) => ({
      ...p,
      tarefas: (await env.DB.prepare("SELECT cargo, substr(entrada,1,160) entrada FROM tarefas WHERE pedido_id=? AND status='aguardando' ORDER BY id").bind(p.id).all<any>()).results,
    })));
    return resp({
      agora: new Date().toISOString(),
      funcionarios: func.results.map((f) => ({ ...f, uso: uso[f.id] ?? null })),
      eventos: eventos.results,
      fila: Object.fromEntries(fila.results.map((x) => [x.status, x.n])),
      esperando_ok: planos,
    });
  }
  if (url.pathname === "/hub/entregas") return resp(await listarEntregas(env, url.origin));
  if (url.pathname === "/hub/aprovar" && req.method === "POST") {
    const { id } = (await req.json()) as any;
    return resp({ mensagem: await aprovarPedido(env, Number(id)) });
  }
  if (url.pathname === "/hub/cancelar" && req.method === "POST") {
    const { id } = (await req.json()) as any;
    return resp({ mensagem: await cancelarPedido(env, Number(id)) });
  }
  // GDD em PDF: envio (substitui o atual) e leitura
  if (url.pathname === "/hub/gdd" && req.method === "POST") {
    const fd = await req.formData();
    const f = fd.get("pdf") as unknown as File | null;
    if (!f || typeof f === "string") return resp({ erro: "Nenhum arquivo enviado." }, 400);
    const b = new Uint8Array(await f.arrayBuffer());
    if (String.fromCharCode(...b.subarray(0, 5)) !== "%PDF-") return resp({ erro: "O arquivo não é um PDF." }, 400);
    if (b.length > 90_000_000) return resp({ erro: "PDF acima de 90 MB (limite de envio da Cloudflare)." }, 413);
    // divide em partes de ~1 MB (cada linha do banco aceita até ~2 MB)
    const PARTE = 1_000_000;
    await env.DB.batch([env.DB.prepare("DELETE FROM gdd_partes"), env.DB.prepare("DELETE FROM gdd")]);
    const g = await env.DB.prepare("INSERT INTO gdd (nome, dados) VALUES (?, '') RETURNING id").bind(String(f.name).slice(0, 120)).first<{ id: number }>();
    const stmts: D1PreparedStatement[] = [];
    for (let o = 0, i = 0; o < b.length; o += PARTE, i++) {
      const pedaco = b.subarray(o, o + PARTE); let s = ""; for (let k = 0; k < pedaco.length; k += 0x8000) s += String.fromCharCode(...pedaco.subarray(k, k + 0x8000));
      stmts.push(env.DB.prepare("INSERT INTO gdd_partes (gdd_id, ordem, dados) VALUES (?, ?, ?)").bind(g!.id, i, btoa(s)));
    }
    for (let i = 0; i < stmts.length; i += 10) await env.DB.batch(stmts.slice(i, i + 10));
    await env.DB.prepare("INSERT INTO eventos (tipo, texto) VALUES ('gdd', ?)").bind(`GDD enviado: ${f.name}`).run();
    // aciona a equipe: o gerente planeja a partir do GDD e o plano é executado sem esperar /ok
    const texto = String(fd.get("texto") ?? "").replace(/\s+/g, " ").trim().slice(0, 60000);
    let pedido: number | null = null;
    if (texto.length > 80) pedido = await criarProjeto(env, String(f.name).replace(/\.pdf$/i, ""), texto);
    return resp({ ok: true, nome: f.name, pedido });
  }
  if (url.pathname === "/hub/gdd" && req.method === "GET") {
    const g = await env.DB.prepare("SELECT id, nome, dados, criado_em FROM gdd ORDER BY id DESC LIMIT 1").first<any>();
    if (!g) return resp({ erro: "sem GDD" }, 404);
    const partes = (await env.DB.prepare("SELECT dados FROM gdd_partes WHERE gdd_id=? ORDER BY ordem").bind(g.id).all<any>()).results.map((p) => p.dados);
    const pedacos = (partes.length ? partes : [g.dados]).map((d: string) => Uint8Array.from(atob(d), (c) => c.charCodeAt(0)));
    const total = new Uint8Array(pedacos.reduce((a: number, p: Uint8Array) => a + p.length, 0)); let o = 0; for (const p of pedacos) { total.set(p, o); o += p.length; }
    return new Response(total, {
      headers: { "content-type": "application/pdf", "x-gdd-nome": encodeURIComponent(g.nome), "x-gdd-em": g.criado_em, "access-control-expose-headers": "x-gdd-nome, x-gdd-em", ...CORS },
    });
  }
  return resp({ erro: "rota desconhecida" }, 404);
}
