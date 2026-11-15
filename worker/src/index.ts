// Escritório de agentes — Worker principal (API + webhook do Telegram + Cron)
import type { Env } from "./env";
import { aprovarPedido, arquivosDaTarefa, cancelarPedido, ciclo, estado, novaTarefa, novoPedido, resumoDiario, tarefa, usoHoje } from "./office";
import { AJUDA, enviar, enviarArquivos, segredoWebhook } from "./telegram";
import { chamar, geminiComAudio } from "./providers";
import { renderizar } from "./render";
import { hub, iguais } from "./hub";
import { configurar } from "./config";
import { servirAssinado } from "./entregas";
import { criarProjeto, resultadoTeste } from "./projetos";

const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d, null, 2), { status: s, headers: { "content-type": "application/json; charset=utf-8" } });

function autorizado(req: Request, env: Env) {
  const h = req.headers.get("authorization") || "";
  return !!env.ESTUDIO_KEY && iguais(h, `Bearer ${env.ESTUDIO_KEY}`);
}

async function telegram(req: Request, env: Env): Promise<Response> {
  if (req.headers.get("x-telegram-bot-api-secret-token") !== (await segredoWebhook(env))) return new Response("nao", { status: 403 });
  const up: any = await req.json();
  const msg = up.message;
  if (!msg?.text || String(msg.chat?.id) !== String(env.TELEGRAM_CHAT_ID)) return new Response("ok");

  const texto: string = msg.text.trim();
  const [cmd, ...resto] = texto.split(/\s+/);
  const arg = resto.join(" ");
  try {
    switch (cmd.split("@")[0]) {
      case "/start":
      case "/ajuda":
        await enviar(env, AJUDA);
        break;
      case "/pedido": {
        if (!arg) { await enviar(env, "Uso: /pedido <o que você quer>"); break; }
        const id = await novoPedido(env, arg, "telegram");
        await enviar(env, `📥 Pedido #${id} recebido. O gerente monta o plano no próximo minuto e te mostra aqui antes de executar.`);
        break;
      }
      case "/ok": {
        const id = Number(resto[0]);
        if (!id) { await enviar(env, "Uso: /ok <número do pedido>"); break; }
        await enviar(env, await aprovarPedido(env, id));
        break;
      }
      case "/cancelar": {
        const id = Number(resto[0]);
        if (!id) { await enviar(env, "Uso: /cancelar <número do pedido>"); break; }
        await enviar(env, await cancelarPedido(env, id));
        break;
      }
      case "/ok_selecao": {
        const prop = await env.DB.prepare("SELECT valor FROM config WHERE chave='selecao_proposta'").first<{ valor: string }>();
        if (!prop) { await enviar(env, "Nenhuma reseleção esperando aprovação."); break; }
        const b = JSON.parse(prop.valor);
        await aplicarSelecao(env, b);
        await env.DB.prepare("DELETE FROM config WHERE chave='selecao_proposta'").run();
        await enviar(env, `✅ Equipes da seleção ${b.rodada} aplicadas (${Object.keys(b.cadeias).length} cargos). Veja em /cargos`);
        break;
      }
      case "/tarefa": {
        const [cargo, ...t] = resto;
        if (!cargo || !t.length) { await enviar(env, "Uso: /tarefa <cargo> <texto>. Veja /cargos"); break; }
        const id = await novaTarefa(env, cargo, t.join(" "));
        await enviar(env, `📥 Tarefa #${id} na fila para ${cargo}.`);
        break;
      }
      case "/cargos": {
        const r = await env.DB.prepare("SELECT id, nome, cadeia FROM cargos ORDER BY id").all<any>();
        await enviar(env, r.results.map((c) => `• ${c.id} — ${c.nome}\n  equipe: ${JSON.parse(c.cadeia).join(" → ")}`).join("\n"));
        break;
      }
      case "/status": {
        const e: any = await estado(env);
        const uso = await usoHoje(env);
        const icone: Record<string, string> = { ocioso: "💤", trabalhando: "⚙️", pausado: "⏸️" };
        const barra = (fr: number | null) => fr === null ? "cota ?" : `${"▰".repeat(Math.min(5, Math.round(fr * 5)))}${"▱".repeat(5 - Math.min(5, Math.round(fr * 5)))} ${Math.round(fr * 100)}%`;
        const f = e.funcionarios.map((x: any) => {
          const u = uso[x.id];
          return `${icone[x.status] ?? "?"} ${x.nome}\n    hoje: ${u?.pedidos ?? 0} pedidos · ${barra(u?.fracao ?? null)}${x.pausado_ate ? ` · volta ${x.pausado_ate.slice(11, 16)} UTC` : ""}`;
        }).join("\n");
        const fila = e.fila.map((x: any) => `${x.status}: ${x.n}`).join(" · ") || "vazia";
        await enviar(env, `👥 Equipe (cota do dia, renova 21h)\n${f}\n\n📦 Fila: ${fila}`);
        break;
      }
      case "/pedidos": {
        const r = await env.DB.prepare("SELECT id, texto, status FROM pedidos ORDER BY id DESC LIMIT 10").all<any>();
        await enviar(env, r.results.map((p) => `#${p.id} [${p.status}] ${String(p.texto).slice(0, 60)}`).join("\n") || "Nenhum pedido ainda.");
        break;
      }
      case "/resultado": {
        const t = await tarefa(env, Number(arg));
        if (!t) { await enviar(env, "Tarefa não encontrada."); break; }
        const corpo = t.resultado ?? (t.erro ? `Erro: ${t.erro}` : "(ainda sem resultado)");
        await enviar(env, `#${t.id} ${t.cargo} [${t.status}] por ${t.funcionario ?? "-"}\n\n${corpo}`);
        const arqs = await arquivosDaTarefa(env, [t.id]);
        if (arqs.length) await enviarArquivos(env, arqs, `#${t.id}`);
        break;
      }
      default:
        await enviar(env, AJUDA);
    }
  } catch (e: any) {
    await enviar(env, `Erro: ${e.message || e}`);
  }
  return new Response("ok");
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    configurar(env);
    const url = new URL(req.url);
    if (url.pathname === "/telegram" && req.method === "POST") return telegram(req, env);
    if (url.pathname === "/") return new Response("Escritório online.");
    if (url.pathname.startsWith("/hub/")) return hub(req, env, url);
    // links assinados do hub: prévias/áudios das entregas e o jogo jogável de cada projeto
    if (url.pathname.startsWith("/arq/") || url.pathname.startsWith("/jogo/")) { const r = await servirAssinado(env, url); if (r) return r; }

    if (!url.pathname.startsWith("/api/")) return new Response("não encontrado", { status: 404 });
    if (!autorizado(req, env)) return json({ erro: "não autorizado" }, 401);

    if (url.pathname === "/api/estado") return json(await estado(env));
    if (url.pathname === "/api/pedidos" && req.method === "POST") {
      const b: any = await req.json();
      return json({ pedido: await novoPedido(env, String(b.texto), "api") }, 201);
    }
    // diagnóstico: roda um renderizador com uma especificação e devolve tempo e arquivos (sem salvar nada)
    if (url.pathname === "/api/render-teste" && req.method === "POST") {
      const b: any = await req.json();
      const t0 = Date.now();
      try {
        const arqs = await renderizar(env, String(b.tipo), typeof b.texto === "string" ? b.texto : JSON.stringify(b.texto), b.estilo ?? null);
        const prev = b.previa ? arqs.find((a) => a.preview) : null; let pb = ""; if (prev) for (let i = 0; i < prev.dados.length; i += 0x8000) pb += String.fromCharCode(...prev.dados.subarray(i, i + 0x8000));
        return json({ ok: true, ms: Date.now() - t0, arquivos: arqs.map((a) => [a.nome, a.dados.length]), previa: prev ? btoa(pb) : undefined, analise: arqs.filter((a) => a.nome.endsWith("_analise.json")).map((a) => new TextDecoder().decode(a.dados)).join("") });
      } catch (e: any) { return json({ ok: false, ms: Date.now() - t0, erro: String(e?.message ?? e) }); }
    }
    if (url.pathname === "/api/teste-jogo" && req.method === "POST") {
      const b: any = await req.json();
      return json({ resultado: await resultadoTeste(env, String(b.slug), !!b.ok, String(b.erros ?? ""), String(b.relatorio ?? "")) });
    }
    if (url.pathname === "/api/projetos" && req.method === "POST") {
      const b: any = await req.json();
      const pedido = await criarProjeto(env, String(b.nome), String(b.gdd));
      if (b.max_marcos) await env.DB.prepare("UPDATE projetos SET max_marcos=? WHERE id=(SELECT projeto_id FROM pedidos WHERE id=?)").bind(Number(b.max_marcos), pedido).run();
      return json({ pedido }, 201);
    }
    if (url.pathname === "/api/tarefas" && req.method === "POST") {
      const b: any = await req.json();
      return json({ tarefa: await novaTarefa(env, String(b.cargo), String(b.texto)) }, 201);
    }
    const m = url.pathname.match(/^\/api\/tarefas\/(\d+)$/);
    if (m) {
      const t = await tarefa(env, Number(m[1]));
      if (!t) return json({ erro: "não encontrada" }, 404);
      const arqs = await env.DB.prepare("SELECT id, nome, mime, preview FROM arquivos WHERE tarefa_id=?").bind(t.id).all();
      return json({ ...t, arquivos: arqs.results });
    }
    const ma = url.pathname.match(/^\/api\/arquivos\/(\d+)$/);
    if (ma) {
      const a = await env.DB.prepare("SELECT nome, mime, dados FROM arquivos WHERE id=?").bind(Number(ma[1])).first<any>();
      if (!a) return json({ erro: "não encontrado" }, 404);
      return new Response(Uint8Array.from(atob(a.dados), (c) => c.charCodeAt(0)), {
        headers: { "content-type": a.mime, "content-disposition": `inline; filename="${a.nome}"` },
      });
    }
    if (url.pathname === "/api/ciclo" && req.method === "POST") {
      await ciclo(env); // roda um ciclo na hora (aguarda: waitUntil em requisição HTTP morre em 30s)
      return json({ ok: true });
    }
    // Processo seletivo: roda 1 funcionário numa prova, sem mexer na fila nem no status dele
    if (url.pathname === "/api/prova" && req.method === "POST") {
      const b: any = await req.json();
      const f = await env.DB.prepare("SELECT * FROM funcionarios WHERE id=?").bind(b.funcionario).first<any>();
      if (!f) return json({ ok: false, erro: "funcionário inexistente" }, 404);
      const t0 = Date.now();
      // imagem opcional (data URI) para juiz com visão
      const user = b.imagem
        ? [{ type: "text", text: String(b.user ?? "") }, { type: "image_url", image_url: { url: String(b.imagem) } }]
        : String(b.user ?? "");
      let r;
      try {
        // juiz que ouve: áudio vai pela API nativa do Gemini; cargos de arquivo grande ganham mais saída
        r = Array.isArray(b.audio) && b.audio.length && f.provedor === "gemini"
          ? await geminiComAudio(env, f.modelo, String(b.system ?? ""), String(b.user ?? ""), b.audio.map((x: string) => Uint8Array.from(atob(x), (c) => c.charCodeAt(0))))
          : await chamar(env, f.provedor, f.modelo, [{ role: "system", content: String(b.system ?? "") }, { role: "user", content: user }], b.grande ? { max_tokens: 16384, _timeout: 150_000 } : {});
      } catch (e: any) {
        return json({ ok: false, erro: String(e.message || e).slice(0, 400), ms: Date.now() - t0 });
      }
      const ms = Date.now() - t0;
      // render opcional: valida a especificação e devolve o preview (imagem) em base64
      if (b.render) {
        try {
          const arqs = await renderizar(env, String(b.render), r.texto);
          const prev = arqs.find((a) => a.preview) ?? arqs[0];
          let s = ""; for (let i = 0; i < prev.dados.length; i += 0x8000) s += String.fromCharCode(...prev.dados.subarray(i, i + 0x8000));
          const b64 = (u: Uint8Array) => { let x = ""; for (let i = 0; i < u.length; i += 0x8000) x += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(x); };
          const audio = arqs.filter((a) => a.mime === "audio/wav").slice(0, 5).filter((a, i, l) => l.slice(0, i + 1).reduce((t, x) => t + x.dados.length, 0) < 1_500_000).map((a) => b64(a.dados));
          return json({ ok: true, texto: r.texto, ms, render_ok: true, arquivos: arqs.map((a) => a.nome), preview_mime: prev.mime, preview_b64: prev.mime.startsWith("image/") ? btoa(s) : null, audio_b64: audio });
        } catch (e: any) {
          return json({ ok: true, texto: r.texto, ms, render_ok: false, render_erro: String(e.message || e).slice(0, 300) });
        }
      }
      return json({ ok: true, texto: r.texto, tokens: r.tokens, modelo: r.modelo, ms });
    }
    // Processo seletivo: grava notas e aplica as cadeias novas de cada cargo
    if (url.pathname === "/api/selecao" && req.method === "POST") {
      return json({ ok: true, gravados: await aplicarSelecao(env, await req.json()) });
    }
    // Reseleção automática: guarda a proposta e espera /ok_selecao no Telegram
    if (url.pathname === "/api/selecao/proposta" && req.method === "POST") {
      const b: any = await req.json();
      await env.DB.prepare("INSERT OR REPLACE INTO config (chave, valor) VALUES ('selecao_proposta', ?)").bind(JSON.stringify(b)).run();
      await enviar(env, `🗳️ Reseleção ${b.rodada} pronta. O resumo chegou acima.\n👉 /ok_selecao para aplicar as equipes novas (até lá, nada muda).`);
      return json({ ok: true });
    }
    // leitura para scripts (reseleção sem depender do wrangler)
    if (url.pathname === "/api/funcionarios") return json((await env.DB.prepare("SELECT id, nome, provedor, modelo, cota, pesado, ativo, limite_req_dia, limite_descoberto FROM funcionarios").all()).results);
    if (url.pathname === "/api/cargos") return json((await env.DB.prepare("SELECT id, nome, tipo, skill, cadeia FROM cargos").all()).results);
    if (url.pathname === "/api/telegram/registrar" && req.method === "POST") {
      const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/setWebhook`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: `${url.origin}/telegram`, secret_token: await segredoWebhook(env), allowed_updates: ["message"] }),
      });
      return json(await r.json());
    }
    return json({ erro: "rota desconhecida" }, 404);
  },

  async scheduled(ev: ScheduledController, env: Env, ctx: ExecutionContext) {
    configurar(env);
    if (ev.cron === "0 0 * * *") ctx.waitUntil(resumoDiario(env)); // 21h de Brasília
    ctx.waitUntil(ciclo(env));
  },
};

async function aplicarSelecao(env: Env, b: any): Promise<number> {
  const stmts: D1PreparedStatement[] = [];
  for (const a of b.avaliacoes ?? [])
    stmts.push(env.DB.prepare("INSERT INTO avaliacoes (rodada, funcionario, prova, nota, ms, detalhe) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(b.rodada, a.funcionario, a.prova, a.nota, a.ms ?? null, String(a.detalhe ?? "").slice(0, 500)));
  for (const [cargo, cadeia] of Object.entries(b.cadeias ?? {}))
    stmts.push(env.DB.prepare("UPDATE cargos SET cadeia=? WHERE id=?").bind(JSON.stringify(cadeia), cargo));
  for (let i = 0; i < stmts.length; i += 90) await env.DB.batch(stmts.slice(i, i + 90));
  await env.DB.prepare("INSERT INTO eventos (tipo, texto) VALUES ('selecao', ?)").bind(`Processo seletivo ${b.rodada}: ${Object.keys(b.cadeias ?? {}).length} cargos atualizados`).run();
  return stmts.length;
}
