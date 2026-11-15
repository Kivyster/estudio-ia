// Lógica do escritório: pedidos, fila de tarefas, execução com fallback entre funcionários.
import type { Env } from "./env";
import { buscaWeb, chamar, ErroProvedor, geminiComAudio, type Msg } from "./providers";
import { avisar, enviarArquivos } from "./telegram";
import { ErroInfra, renderizar, type Arquivo } from "./render";
import { apiDoMotor, salvarNoGitHub } from "./assets";
import { concluirProjeto, entradaIntegrador, fecharMarco } from "./projetos";
import { catalogoParaArtista } from "./biblioteca";
import { armadilhas, blocosJS, checarSintaxe } from "./codigo";
import { textoDoEstilo, validarEstilo, type Estilo } from "./estilo";

const POR_CICLO = 3;          // tarefas em paralelo a cada minuto
const MAX_TENTATIVAS = 5;
const PAUSA_COTA_MIN = 15;    // funcionário sem cota descansa isso
const PAUSA_FALHAS_MIN = 5;   // 3 falhas seguidas = pausa curta
const MAX_CONTEXTO = 12_000;  // caracteres de resultados anteriores passados adiante
const MAX_CONTEXTO_EDITOR = 40_000;
const AUTOMATICOS = new Set(["gerente", "editor", "critico", "integrador", "diretor_arte"]); // cargos que o gerente não distribui

const TETO_COTA = 0.8; // acima de 80% da cota conhecida do dia, o funcionário vira só reserva
const hojeUTC = () => new Date().toISOString().slice(0, 10);

// ---------- medidor de cota ----------
export async function registrarUso(env: Env, fid: string, tokens: number, erroCota = false) {
  const dia = hojeUTC();
  await env.DB.prepare(`INSERT INTO uso (dia, funcionario, pedidos, tokens, erros_cota) VALUES (?, ?, 1, ?, ?)
    ON CONFLICT(dia, funcionario) DO UPDATE SET pedidos = pedidos + 1, tokens = tokens + excluded.tokens, erros_cota = erros_cota + excluded.erros_cota`)
    .bind(dia, fid, tokens, erroCota ? 1 : 0).run();
  if (erroCota) {
    // estourou: grava quantos pedidos ele aguentou hoje (vira o limite descoberto, se não havia limite conhecido)
    const u = await env.DB.prepare("SELECT pedidos FROM uso WHERE dia=? AND funcionario=?").bind(dia, fid).first<{ pedidos: number }>();
    await env.DB.prepare("UPDATE funcionarios SET limite_descoberto=?, descoberto_em=? WHERE id=? AND (limite_descoberto IS NULL OR limite_descoberto < ?)")
      .bind(u?.pedidos ?? 0, dia, fid, u?.pedidos ?? 0).run();
  }
}

// fração da cota do dia já usada (null = limite desconhecido)
export async function usoHoje(env: Env): Promise<Record<string, { pedidos: number; tokens: number; fracao: number | null; limite: number | null }>> {
  const r = await env.DB.prepare(`SELECT f.id, f.limite_req_dia, f.limite_tok_dia, f.limite_descoberto, COALESCE(u.pedidos,0) pedidos, COALESCE(u.tokens,0) tokens
    FROM funcionarios f LEFT JOIN uso u ON u.funcionario = f.id AND u.dia = ? WHERE f.ativo = 1`).bind(hojeUTC()).all<any>();
  const out: any = {};
  for (const x of r.results) {
    const limReq = x.limite_req_dia ?? x.limite_descoberto ?? null;
    const fr = [limReq ? x.pedidos / limReq : null, x.limite_tok_dia ? x.tokens / x.limite_tok_dia : null].filter((v) => v !== null) as number[];
    out[x.id] = { pedidos: x.pedidos, tokens: x.tokens, fracao: fr.length ? Math.max(...fr) : null, limite: limReq };
  }
  return out;
}

function b64(u: Uint8Array) { let s = ""; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); }
function deB64(s: string) { return Uint8Array.from(atob(s), (c) => c.charCodeAt(0)); }

export async function arquivosDaTarefa(env: Env, ids: number[]): Promise<(Arquivo & { id: number })[]> {
  if (!ids.length) return [];
  const r = await env.DB.prepare(`SELECT id, nome, mime, dados, preview FROM arquivos WHERE tarefa_id IN (${ids.map(() => "?").join(",")}) ORDER BY id`).bind(...ids).all<any>();
  return r.results.map((a) => ({ id: a.id, nome: a.nome, mime: a.mime, dados: deB64(a.dados), preview: !!a.preview }));
}

const agora = () => new Date().toISOString().replace("T", " ").slice(0, 19);
const daquiMin = (m: number) => new Date(Date.now() + m * 60_000).toISOString().replace("T", " ").slice(0, 19);

export async function evento(env: Env, tipo: string, texto: string, funcionario: string | null = null) {
  await env.DB.prepare("INSERT INTO eventos (tipo, texto, funcionario) VALUES (?, ?, ?)")
    .bind(tipo, texto.slice(0, 500), funcionario).run();
}

export async function novoPedido(env: Env, texto: string, origem: string): Promise<number> {
  const p = await env.DB.prepare("INSERT INTO pedidos (texto, origem) VALUES (?, ?) RETURNING id").bind(texto, origem).first<{ id: number }>();
  await env.DB.prepare("INSERT INTO tarefas (pedido_id, cargo, entrada) VALUES (?, 'gerente', ?)").bind(p!.id, texto).run();
  await evento(env, "pedido", `Pedido #${p!.id}: ${texto}`);
  return p!.id;
}

export async function novaTarefa(env: Env, cargo: string, texto: string): Promise<number> {
  const c = await env.DB.prepare("SELECT id FROM cargos WHERE id = ?").bind(cargo).first();
  if (!c) throw new Error(`cargo inexistente: ${cargo}`);
  const t = await env.DB.prepare("INSERT INTO tarefas (cargo, entrada) VALUES (?, ?) RETURNING id").bind(cargo, texto).first<{ id: number }>();
  await evento(env, "tarefa", `Tarefa avulsa #${t!.id} para ${cargo}`);
  return t!.id;
}

// ---------- ciclo (Cron, a cada minuto) ----------

export async function ciclo(env: Env) {
  await env.DB.prepare("UPDATE funcionarios SET status='ocioso', pausado_ate=NULL WHERE status='pausado' AND pausado_ate <= ?").bind(agora()).run();
  // tarefas presas em "rodando" há mais de 10 min (execução morreu): voltam pra fila
  await env.DB.prepare("UPDATE tarefas SET status='pendente' WHERE status='rodando' AND iniciada_em < ?").bind(daquiMin(-10)).run();
  await env.DB.prepare("UPDATE funcionarios SET status='ocioso' WHERE status='trabalhando' AND ultima_atividade < ?").bind(daquiMin(-10)).run();
  // tarefas esperando gerador de imagem: tenta de novo a cada 10 min; desiste depois de 24h
  await env.DB.prepare("UPDATE tarefas SET status='pendente' WHERE status='aguardando_gerador' AND iniciada_em < ? AND criada_em >= ?").bind(daquiMin(-10), daquiMin(-1440)).run();
  await env.DB.prepare("UPDATE tarefas SET status='falhou' WHERE status='aguardando_gerador' AND criada_em < ?").bind(daquiMin(-1440)).run();

  const pendentes = await env.DB.prepare("SELECT * FROM tarefas WHERE status='pendente' ORDER BY id LIMIT 30").all<any>();
  const prontas: any[] = [];
  for (const t of pendentes.results) {
    const deps: number[] = JSON.parse(t.depende_de || "[]");
    if (deps.length) {
      const ok = await env.DB.prepare(`SELECT COUNT(*) n FROM tarefas WHERE id IN (${deps.map(() => "?").join(",")}) AND status IN ('concluida','falhou')`).bind(...deps).first<{ n: number }>();
      if ((ok?.n ?? 0) < deps.length) continue;
    }
    prontas.push(t);
    if (prontas.length >= POR_CICLO) break;
  }
  // trava as escolhidas antes de executar (evita dois ciclos pegarem a mesma)
  const minhas: any[] = [];
  for (const t of prontas) {
    const r = await env.DB.prepare("UPDATE tarefas SET status='rodando', iniciada_em=? WHERE id=? AND status='pendente'").bind(agora(), t.id).run();
    if (r.meta.changes) minhas.push(t);
  }
  await Promise.all(minhas.map((t) => executar(env, t)));
  await fecharPedidos(env);
}

async function contextoDependencias(env: Env, t: any): Promise<string> {
  const deps: number[] = JSON.parse(t.depende_de || "[]");
  if (!deps.length) return "";
  const r = await env.DB.prepare(`SELECT id, cargo, resultado FROM tarefas WHERE id IN (${deps.map(() => "?").join(",")})`).bind(...deps).all<any>();
  const r2 = await env.DB.prepare(`SELECT id, status FROM tarefas WHERE id IN (${deps.map(() => "?").join(",")})`).bind(...deps).all<any>();
  const falhou = new Set(r2.results.filter((x) => x.status === "falhou").map((x) => x.id));
  let txt = r.results.map((d) => falhou.has(d.id)
    ? `### Tarefa #${d.id} (${d.cargo}) FALHOU\nNão há entrega desta parte: use placeholder (forma colorida / Motor.sprite(null, {cor}) / sem som) e siga.`
    : `### Resultado da tarefa #${d.id} (${d.cargo})\n${d.resultado}`).join("\n\n");
  const max = t.cargo === "editor" ? MAX_CONTEXTO_EDITOR : MAX_CONTEXTO;
  if (txt.length > max) txt = txt.slice(0, max) + "\n[...cortado]";
  return txt;
}

async function executar(env: Env, t: any) {
  const cargo = await env.DB.prepare("SELECT * FROM cargos WHERE id=?").bind(t.cargo).first<any>();
  if (!cargo) return falhar(env, t, `cargo inexistente: ${t.cargo}`, true);

  let entrada = t.entrada as string;
  const ctx = await contextoDependencias(env, t);
  if (ctx) entrada = `${ctx}\n\n### Sua tarefa\n${entrada}`;
  if (cargo.pesquisa_web) {
    const achados = await buscaWeb(env, t.entrada);
    if (achados) entrada = `### Resultados de busca na web\n${achados}\n\n${entrada}`;
  }
  // bíblia de estilo do projeto: vale pra todo cargo que produz arte, som, fase ou código do jogo
  const pj = t.pedido_id ? await env.DB.prepare("SELECT pr.id, pr.estilo, pr.dados, pr.ultimo_teste FROM pedidos pe JOIN projetos pr ON pr.id = pe.projeto_id WHERE pe.id=?").bind(t.pedido_id).first<any>() : null;
  let estilo: Estilo | null = null;
  try { estilo = pj?.estilo ? JSON.parse(pj.estilo) : null; } catch { estilo = null; }
  if (estilo && USA_ESTILO.has(t.cargo)) entrada += `

${textoDoEstilo(estilo)}`;
  // física do jogador definida pelo game designer: o level designer desenha os saltos com esses números
  if (pj?.dados && t.cargo === "level_designer") { try { const d = JSON.parse(pj.dados); if (d.pulo_tiles) entrada += `

## Física do jogador (config do game designer)
Pulo alcança ${d.pulo_tiles.altura} tiles de altura e ${d.pulo_tiles.distancia} de distância: use "pulo":{"altura":${Math.floor(d.pulo_tiles.altura)},"distancia":${Math.floor(d.pulo_tiles.distancia)}}.`; } catch {} }
  // QA recebe o que o robô viu jogando o jogo de verdade
  if (t.cargo === "qa" && pj?.ultimo_teste) entrada += `\n\n## Último teste automático no navegador (robô jogou o jogo)\n${pj.ultimo_teste}\nUse isso como evidência: aponte a causa provável no código/fase e a correção.`;
  if (cargo.id === "programador") { const api = await apiDoMotor(env); if (api) entrada += `\n\n${api}`; }
  // level designer: tiles prontos da biblioteca (chão, parede, plataforma, água, perigo, escada, porta, decoração, itens)
  if (t.cargo === "level_designer") entrada += `\n\n### Tiles disponíveis na biblioteca (campo "peca" na legenda)\n${await catalogoParaArtista(env, String(t.entrada), 80, ["chao", "parede", "plataforma", "teto", "agua", "perigo", "porta", "escada", "construcao", "natureza", "arvore", "planta", "pedra", "decoracao", "moeda", "item", "movel"])}`;
  if (cargo.tipo === "sprite_kit") entrada += `

### Peças disponíveis na biblioteca (campo "base")
${await catalogoParaArtista(env, String(t.entrada))}`;
  const msgs: Msg[] = [{ role: "system", content: cargo.skill }, { role: "user", content: entrada }];

  // teto de cota: quem passou de 80% hoje vai pro fim da fila (só trabalha se ninguém mais puder)
  const uso = await usoHoje(env);
  const cadeiaOriginal: string[] = JSON.parse(cargo.cadeia);
  const cadeia = [...cadeiaOriginal.filter((f) => (uso[f]?.fracao ?? 0) < TETO_COTA), ...cadeiaOriginal.filter((f) => (uso[f]?.fracao ?? 0) >= TETO_COTA)];
  const erros: string[] = [];
  for (const fid of cadeia) {
    const f = await env.DB.prepare("SELECT * FROM funcionarios WHERE id=? AND ativo=1").bind(fid).first<any>();
    if (!f || f.status === "pausado") continue;
    await env.DB.prepare("UPDATE funcionarios SET status='trabalhando', ultima_atividade=?, tarefa_atual=?, cargo_atual=? WHERE id=?").bind(agora(), t.id, t.cargo, fid).run();
    await evento(env, "inicio", `${f.nome} pegou a tarefa #${t.id} (${cargo.nome})`, fid);
    try {
      // mega-skill do cargo + adaptador da família do modelo (boas práticas oficiais do fabricante)
      const ad = await env.DB.prepare("SELECT texto, params FROM adaptadores WHERE familia=?").bind(f.familia ?? "generico").first<any>()
        ?? await env.DB.prepare("SELECT texto, params FROM adaptadores WHERE familia='generico'").first<any>();
      msgs[0] = { role: "system", content: ad ? `${cargo.skill}

${ad.texto}` : cargo.skill };
      // cargos que entregam arquivo grande (código do jogo, fase, design, música) ganham mais saída e mais tempo
      const grande = SAIDA_GRANDE.has(t.cargo) ? { max_tokens: 16384, _timeout: 150_000 } : {};
      const r = await chamar(env, f.provedor, f.modelo, msgs, { ...(ad ? JSON.parse(ad.params || "{}") : {}), ...grande });
      await registrarUso(env, fid, r.tokens);
      // cargos visuais/sonoros: o texto é uma especificação; o renderizador valida e gera o arquivo.
      // especificação quebrada = falha deste funcionário, passa pro próximo da cadeia.
      const tipo = cargo.tipo ?? "texto";
      const arquivos = tipo === "texto" ? [] : await renderizar(env, tipo, r.texto, estilo);
      if (tipo === "repo") {
        // Integrador só pode citar assets que existem (lista vem na entrada); citar inventado = resposta recusada
        const permitidos = new Set([...String(t.entrada).matchAll(/^- assets\/([\w.\-]+)$/gm)].map((m) => m[1]));
        const citados = new Set(arquivos.flatMap((a) => [...new TextDecoder().decode(a.dados).matchAll(/assets\/([\w.\-]+\.(?:png|jpg|jpeg|wav|json|tmj|mp3|ogg))/g)].map((m) => m[1])));
        // chamadas do motor sem o prefixo assets/: Motor.sprite("x") → x.json, mapa → .tmj, som/musica → .wav, imagem/parallax → nome do arquivo
        for (const a of arquivos) {
          const cod = new TextDecoder().decode(a.dados);
          for (const [, fn, nome] of cod.matchAll(/Motor\.(sprite|mapa|som|musica|imagem|desenharImagem)\(\s*["'`]([\w.\-]+)["'`]/g)) {
            const alvo = fn === "sprite" ? `${nome}.json` : fn === "mapa" ? `${nome}.tmj` : (fn === "som" || fn === "musica") && !/\.\w+$/.test(nome) ? `${nome}.wav` : nome;
            citados.add(alvo);
          }
          for (const [, nome] of cod.matchAll(/img\s*:\s*["'`]([\w.\-]+\.png)["'`]/g)) citados.add(nome);
        }
        // código do jogo precisa compilar: erro de sintaxe volta na hora (não espera o teste no navegador)
        for (const a of arquivos.filter((x) => x.nome.endsWith(".js"))) {
          const cod = new TextDecoder().decode(a.dados), erro = checarSintaxe(a.nome, cod);
          if (erro) throw new Error(erro);
          const av = armadilhas(cod); if (av.length) throw new Error(`${a.nome}: ${av.join("; ")}`);
        }
        const inventados = [...citados].filter((c) => !permitidos.has(c));
        if (inventados.length) throw new Error(`integrador citou assets que não existem: ${inventados.join(", ")}`);
        if (!arquivos.some((a) => a.nome === "js/jogo.js") && !String(t.entrada).includes("### js/jogo.js")) throw new Error("integrador não entregou js/jogo.js (o jogo inteiro fica nele)");
      }
      // programador: todo bloco de código precisa compilar
      if (t.cargo === "programador") {
        const erros = blocosJS(r.texto).map((b, i) => checarSintaxe(`bloco ${i + 1}`, b)).filter(Boolean);
        if (erros.length) throw new Error(`código com erro de sintaxe — ${erros.slice(0, 3).join(" | ")}`);
      }
      // crítico: outro modelo dá nota com a régua do cargo; abaixo de NOTA_MIN volta pra refazer (até MAX_REVISOES)
      const crit = await criticar(env, t, cargo, fid, r.texto, arquivos);
      if (crit && crit.nota < NOTA_MIN) {
        const original = String(t.entrada).split(MARCA_REVISAO)[0];
        const nova = `${original}${MARCA_REVISAO} ${(t.revisoes ?? 0) + 1} — nota ${crit.nota}/10)
Sua entrega anterior foi recusada pelo diretor de qualidade. Refaça corrigindo TODOS os pontos:
${crit.texto}

### Sua entrega anterior (não repita os erros)
${r.texto.slice(0, 5000)}`;
        await env.DB.batch([
          env.DB.prepare("UPDATE tarefas SET status='pendente', revisoes=revisoes+1, entrada=?, iniciada_em=NULL WHERE id=?").bind(nova, t.id),
          env.DB.prepare("UPDATE funcionarios SET status='ocioso', tarefa_atual=NULL, cargo_atual=NULL, ultima_atividade=? WHERE id=?").bind(agora(), fid),
        ]);
        await evento(env, "revisao", `Tarefa #${t.id} voltou pra refazer (nota ${crit.nota}/10): ${crit.texto.slice(0, 200)}`, fid);
        return;
      }
      // diretor de arte aprovado: a bíblia vira lei do projeto
      if (tipo === "design" && pj) {
        const an = arquivos.find((a) => a.nome === "design_analise.json");
        if (an) await env.DB.prepare("UPDATE projetos SET dados=? WHERE id=?").bind(new TextDecoder().decode(an.dados), pj.id).run();
      }
      if (t.cargo === "diretor_arte" && pj) {
        const js = arquivos.find((a) => a.nome === "estilo.json");
        if (js) await env.DB.prepare("UPDATE projetos SET estilo=? WHERE id=?").bind(JSON.stringify(validarEstilo(JSON.parse(new TextDecoder().decode(js.dados)))), pj.id).run();
      }
      // design e roteiro: o texto inteiro segue pra equipe (é documento), com a análise do código no fim
      const analise = arquivos.filter((a) => a.nome.endsWith("_analise.json")).map((a) => new TextDecoder().decode(a.dados)).join("\n");
      const lista = `Arquivos gerados: ${arquivos.map((a) => a.nome).join(", ")}`;
      const resultado = !arquivos.length ? r.texto
        : tipo === "design" || tipo === "roteiro" ? `${lista}\n\n${r.texto}${analise ? `\n\nAnálise do código:\n${analise}` : ""}`
        : `${lista}\n\nEspecificação:\n${r.texto.slice(0, 3000)}${analise ? `\n\nAnálise do código:\n${analise.slice(0, 1500)}` : ""}`;
      await env.DB.batch([
        ...arquivos.map((a) => env.DB.prepare("INSERT INTO arquivos (tarefa_id, nome, mime, dados, preview) VALUES (?, ?, ?, ?, ?)")
          .bind(t.id, a.nome, a.mime, b64(a.dados), a.preview ? 1 : 0)),
        env.DB.prepare("UPDATE tarefas SET status='concluida', funcionario=?, resultado=?, tokens=?, concluida_em=?, erro=NULL WHERE id=?")
          .bind(fid, resultado, r.tokens, agora(), t.id),
        env.DB.prepare("UPDATE funcionarios SET status='ocioso', tarefa_atual=NULL, cargo_atual=NULL, falhas_seguidas=0, tarefas_feitas=tarefas_feitas+1, tokens_usados=tokens_usados+?, ultima_atividade=? WHERE id=?")
          .bind(r.tokens, agora(), fid),
      ]);
      await evento(env, "fim", `${f.nome} entregou a tarefa #${t.id}`, fid);
      if (t.cargo === "gerente" && t.pedido_id) await planejar(env, t, r.texto);
      if (!t.pedido_id) {
        await avisar(env, `✅ Tarefa #${t.id} (${cargo.nome}) pronta por ${f.nome}.\nVer: /resultado ${t.id}`);
        if (arquivos.length) {
          await enviarArquivos(env, arquivos, `#${t.id} ${cargo.nome}`);
          await salvarNoGitHub(env, `avulsas/tarefa-${t.id}_${cargo.id}`, arquivos, `Tarefa #${t.id} (${cargo.nome})`);
        }
      }
      return;
    } catch (e: any) {
      if (e instanceof ErroInfra) {
        // gerador fora do ar: libera o funcionário sem punir e devolve a tarefa pra fila (tenta de novo depois)
        await env.DB.prepare("UPDATE funcionarios SET status='ocioso', tarefa_atual=NULL, cargo_atual=NULL WHERE id=?").bind(fid).run();
        await evento(env, "infra", `Tarefa #${t.id} aguardando gerador: ${String(e.message).slice(0, 200)}`, fid);
        // até 3 esperas (~30 min) pelo gerador; depois segue com placeholder pra não travar o resto da equipe
        const esperas = (t.tentativas ?? 0) + 1;
        if (esperas >= 3) {
          const aviso = `ARTE PENDENTE (placeholder): o gerador de imagem ficou indisponível. Especificação pedida: ${String(t.entrada).slice(0, 600)}\nQuem depender desta arte: use formas coloridas no lugar (retângulo/círculo com a cor principal descrita) e mantenha o nome de arquivo previsto, pra trocar quando a arte existir.`;
          await env.DB.prepare("UPDATE tarefas SET status='concluida', funcionario=?, resultado=?, erro=?, tentativas=?, concluida_em=? WHERE id=?").bind(fid, aviso, String(e.message).slice(0, 300), esperas, agora(), t.id).run();
          await evento(env, "placeholder", `Tarefa #${t.id}: gerador fora do ar há ~30 min, seguindo com placeholder`, fid);
          return;
        }
        await env.DB.prepare("UPDATE tarefas SET status='aguardando_gerador', erro=?, iniciada_em=?, tentativas=? WHERE id=?").bind(String(e.message).slice(0, 500), agora(), esperas, t.id).run();
        return;
      }
      const cota = e instanceof ErroProvedor && e.cota;
      if (e instanceof ErroProvedor) await registrarUso(env, fid, 0, cota);
      const falhas = (f.falhas_seguidas ?? 0) + 1;
      const pausa = cota ? PAUSA_COTA_MIN : falhas >= 3 ? PAUSA_FALHAS_MIN : 0;
      await env.DB.prepare("UPDATE funcionarios SET status=?, pausado_ate=?, falhas_seguidas=?, tarefa_atual=NULL, cargo_atual=NULL WHERE id=?")
        .bind(pausa ? "pausado" : "ocioso", pausa ? daquiMin(pausa) : null, falhas, fid).run();
      erros.push(String(e.message || e).slice(0, 200));
      await evento(env, cota ? "cota" : "erro", `${f.nome}: ${String(e.message || e).slice(0, 200)}`, fid);
    }
  }
  await falhar(env, t, erros.join(" | ") || "nenhum funcionário disponível na cadeia", false);
}

const USA_ESTILO = new Set(["artista_sprite", "concept_artist", "level_designer", "sound_designer", "integrador", "programador", "game_designer", "roteirista", "gerente"]);
const SAIDA_GRANDE = new Set(["integrador", "programador", "level_designer", "game_designer", "compositor", "roteirista", "editor", "artista_sprite", "concept_artist", "diretor_arte"]);
const NOTA_MIN = 7, MAX_REVISOES = 2, MARCA_REVISAO = "\n\n## Revisão do crítico (rodada";
const SEM_CRITICA = new Set(["gerente", "editor", "integrador"]); // integrador já passa pelo teste no navegador

async function criticar(env: Env, t: any, cargo: any, autor: string, saida: string, arquivos: Arquivo[]): Promise<{ nota: number; texto: string } | null> {
  if (SEM_CRITICA.has(cargo.id) || (t.revisoes ?? 0) >= MAX_REVISOES) return null;
  const critico = await env.DB.prepare("SELECT skill, cadeia FROM cargos WHERE id='critico'").first<any>();
  if (!critico) return null;
  const analise = arquivos.filter((a) => a.nome.endsWith(".json")).map((a) => new TextDecoder().decode(a.dados).slice(0, 1500)).join("\n");
  const tarefa = String(t.entrada).split(MARCA_REVISAO)[0].slice(-5000);
  const msgs: Msg[] = [
    { role: "system", content: `${critico.skill}

## Régua do cargo ${cargo.nome}
${cargo.critica || "Atende a tarefa por completo, com qualidade de jogo indie lançado, sem nada genérico ou vago."}` },
    { role: "user", content: `## Tarefa pedida
${tarefa}

## Entrega
${saida.slice(0, 9000)}${analise ? `

## Análise automática do arquivo gerado
${analise}` : ""}` },
  ];
  for (const fid of JSON.parse(critico.cadeia) as string[]) {
    if (fid === autor) continue; // ninguém revisa o próprio trabalho
    const f = await env.DB.prepare("SELECT * FROM funcionarios WHERE id=? AND ativo=1 AND status!='pausado'").bind(fid).first<any>();
    if (!f) continue;
    try {
      // crítico com visão (Gemini, Nemotron VL) recebe a prévia da arte: julga o que VÊ, não só as coordenadas
      const previa = arquivos.find((a) => a.preview && a.mime === "image/png" && a.dados.length < 1_500_000);
      const comVisao = previa && (f.provedor === "gemini" || /-vl|vision/i.test(f.modelo));
      // crítico Gemini também OUVE: efeitos e música vão como áudio anexo (até 4 arquivos, ~1,5 MB no total)
      const sons: Arquivo[] = []; let soma = 0;
      for (const a of arquivos.filter((x) => x.mime === "audio/wav")) { if (sons.length >= 4 || soma + a.dados.length > 1_500_000) break; sons.push(a); soma += a.dados.length; }
      const comAudio = !previa && sons.length && f.provedor === "gemini";
      const m2: Msg[] = comVisao ? [msgs[0], { role: "user", content: [
        { type: "text", text: `${msgs[1].content}\n\n## Prévia da arte (imagem anexa)\nAvalie o que você vê: legibilidade, silhueta, proporção, cor, profundidade, se parece jogo de verdade.` },
        { type: "image_url", image_url: { url: `data:image/png;base64,${b64(previa!.dados)}` } },
      ] }] : msgs;
      const r = comAudio
        ? await geminiComAudio(env, f.modelo, String(msgs[0].content), `${msgs[1].content}\n\n## Áudio anexo (${sons.map((s) => s.nome).join(", ")}, nessa ordem)\nOuça e avalie: cada som comunica a função? soa agradável e coerente com o jogo? a música tem motivo marcante, ritmo e loop sem costura? tem estalo, chiado ou volume ruim?`, sons.map((s) => s.dados))
        : await chamar(env, f.provedor, f.modelo, m2, { temperature: 0.2 });
      await registrarUso(env, fid, r.tokens);
      const m = r.texto.match(/\{[\s\S]*\}/); if (!m) continue;
      const j = JSON.parse(m[0]); const nota = Number(j.nota);
      if (!Number.isFinite(nota)) continue;
      const texto = [...(Array.isArray(j.problemas) ? j.problemas : []).map((p: any) => `- ${p}`), j.como_melhorar ? `Como melhorar: ${j.como_melhorar}` : ""].filter(Boolean).join("\n");
      await evento(env, "critica", `${f.nome} deu nota ${nota}/10 na tarefa #${t.id}`, fid);
      return { nota, texto: texto || "sem detalhes" };
    } catch (e: any) { if (e instanceof ErroProvedor) await registrarUso(env, fid, 0, e.cota); }
  }
  return null; // crítico indisponível: não trava a equipe
}

async function falhar(env: Env, t: any, erro: string, definitivo: boolean) {
  const tent = (t.tentativas ?? 0) + 1;
  const fim = definitivo || tent >= MAX_TENTATIVAS;
  await env.DB.prepare("UPDATE tarefas SET status=?, tentativas=?, erro=? WHERE id=?")
    .bind(fim ? "falhou" : "pendente", tent, erro.slice(0, 1000), t.id).run();
  if (fim) await avisar(env, `❌ Tarefa #${t.id} (${t.cargo}) falhou depois de ${tent} tentativas.\n${erro.slice(0, 500)}`);
}

// Gerente devolveu o plano: vira tarefas na fila
async function planejar(env: Env, t: any, texto: string) {
  let plano: any;
  try {
    const json = texto.slice(texto.indexOf("{"), texto.lastIndexOf("}") + 1);
    plano = JSON.parse(json);
  } catch {
    plano = null;
  }
  const lista: any[] = Array.isArray(plano?.tarefas) ? plano.tarefas.slice(0, 8) : [];
  const validos = new Set((await env.DB.prepare("SELECT id FROM cargos").all<any>()).results.map((c) => c.id).filter((c) => !AUTOMATICOS.has(c)));
  const ids: number[] = [];
  for (const item of lista) {
    const cargo = validos.has(item.cargo) ? item.cargo : "game_designer";
    const deps = (Array.isArray(item.depende_de) ? item.depende_de : [])
      .map((i: number) => ids[i]).filter((x: number | undefined) => x !== undefined);
    // tarefas nascem "aguardando": só entram na fila depois do /ok do dono
    const r = await env.DB.prepare("INSERT INTO tarefas (pedido_id, cargo, entrada, depende_de, status) VALUES (?, ?, ?, ?, 'aguardando') RETURNING id")
      .bind(t.pedido_id, cargo, String(item.tarefa || ""), JSON.stringify(deps)).first<{ id: number }>();
    ids.push(r!.id);
  }
  await env.DB.prepare("UPDATE pedidos SET status=? WHERE id=?").bind(ids.length ? "aguardando_ok" : "concluido", t.pedido_id).run();
  const pj = (await env.DB.prepare("SELECT projeto_id FROM pedidos WHERE id=?").bind(t.pedido_id).first<{ projeto_id: number | null }>())?.projeto_id;
  if (pj && !ids.length) { await concluirProjeto(env, pj, plano?.projeto_concluido ? "o gerente considerou o GDD coberto" : "o gerente não devolveu um plano válido"); return; }
  // pedido nascido do envio de GDD: o dono já autorizou ao enviar, então executa direto
  const origem = (await env.DB.prepare("SELECT origem FROM pedidos WHERE id=?").bind(t.pedido_id).first<{ origem: string }>())?.origem;
  if (ids.length && origem === "gdd") {
    await aprovarPedido(env, t.pedido_id);
    const resumoGdd = lista.map((x, i) => `${i + 1}. [${x.cargo}] ${String(x.tarefa).slice(0, 140)}`).join("\n");
    await avisar(env, `📘 GDD recebido — pedido #${t.pedido_id} planejado e já em execução (${ids.length} tarefas):\n${resumoGdd}\n\n✋ /cancelar ${t.pedido_id} para parar`);
    return;
  }
  const resumo = lista.map((x, i) => `${i + 1}. [${x.cargo}] ${String(x.tarefa).slice(0, 140)}`).join("\n");
  await evento(env, "plano", `Pedido #${t.pedido_id} planejado em ${ids.length} tarefas, aguardando /ok`);
  await avisar(env, ids.length
    ? `📋 Pedido #${t.pedido_id} — plano do gerente (${ids.length} tarefas):\n${resumo}\n\n👉 /ok ${t.pedido_id} para executar\n✋ /cancelar ${t.pedido_id} para descartar`
    : `⚠️ Pedido #${t.pedido_id}: o gerente não devolveu um plano válido. Resposta dele: /resultado ${t.id}`);
}

export async function aprovarPedido(env: Env, id: number): Promise<string> {
  const p = await env.DB.prepare("SELECT status FROM pedidos WHERE id=?").bind(id).first<{ status: string }>();
  if (!p) return "Pedido não encontrado.";
  if (p.status !== "aguardando_ok") return `Pedido #${id} não está esperando aprovação (status: ${p.status}).`;
  const r = await env.DB.prepare("UPDATE tarefas SET status='pendente' WHERE pedido_id=? AND status='aguardando'").bind(id).run();
  await env.DB.prepare("UPDATE pedidos SET status='em_andamento' WHERE id=?").bind(id).run();
  await evento(env, "aprovado", `Pedido #${id} aprovado: ${r.meta.changes} tarefas na fila`);
  return `▶️ Pedido #${id} aprovado. ${r.meta.changes} tarefas entraram na fila; a equipe começa no próximo minuto.`;
}

export async function cancelarPedido(env: Env, id: number): Promise<string> {
  const r = await env.DB.prepare("UPDATE tarefas SET status='cancelada' WHERE pedido_id=? AND status IN ('aguardando','pendente')").bind(id).run();
  const p = await env.DB.prepare("UPDATE pedidos SET status='cancelado', concluido_em=? WHERE id=? AND status NOT IN ('concluido','falhou')").bind(agora(), id).run();
  if (!p.meta.changes) return `Pedido #${id} não encontrado ou já terminado.`;
  await evento(env, "cancelado", `Pedido #${id} cancelado`);
  return `🗑️ Pedido #${id} cancelado (${r.meta.changes} tarefas descartadas).`;
}

// ---------- resumo diário (Cron 00:00 UTC = 21h de Brasília) ----------
export async function resumoDiario(env: Env) {
  const dia = new Date(Date.now() - 5 * 60_000).toISOString().slice(0, 10); // o dia que acabou de terminar
  const [ped, tar, uso, img] = await Promise.all([
    env.DB.prepare("SELECT id, texto, status FROM pedidos WHERE substr(concluido_em,1,10)=? ORDER BY id").bind(dia).all<any>(),
    env.DB.prepare("SELECT status, COUNT(*) n FROM tarefas WHERE substr(COALESCE(concluida_em, iniciada_em, criada_em),1,10)=? GROUP BY status").bind(dia).all<any>(),
    env.DB.prepare(`SELECT u.funcionario, u.pedidos, u.tokens, u.erros_cota, f.nome, COALESCE(f.limite_req_dia, f.limite_descoberto) lim
      FROM uso u JOIN funcionarios f ON f.id = u.funcionario WHERE u.dia=? ORDER BY u.tokens DESC`).bind(dia).all<any>(),
    env.DB.prepare("SELECT COUNT(*) n FROM arquivos WHERE substr(criado_em,1,10)=? AND mime LIKE 'image/%' AND preview=1").bind(dia).first<{ n: number }>(),
  ]);
  const totTok = uso.results.reduce((a, x) => a + x.tokens, 0);
  let t = `🌙 RESUMO DO DIA ${dia.split("-").reverse().join("/")}\n\n`;
  t += `📦 Pedidos encerrados: ${ped.results.length}\n` + ped.results.map((p) => `  #${p.id} [${p.status}] ${String(p.texto).slice(0, 60)}`).join("\n");
  t += `\n\n✅ Tarefas: ${tar.results.map((x) => `${x.status} ${x.n}`).join(" · ") || "nenhuma"}`;
  t += `\n🖼️ Imagens geradas: ${img?.n ?? 0}`;
  t += `\n\n⚡ Cota usada (${totTok.toLocaleString("pt-BR")} tokens no total):\n`;
  t += uso.results.map((x) => `  ${x.nome}: ${x.pedidos} pedidos, ${x.tokens.toLocaleString("pt-BR")} tokens${x.lim ? ` (${Math.round((x.pedidos / x.lim) * 100)}% do limite)` : ""}${x.erros_cota ? ` ⚠️ estourou ${x.erros_cota}x` : ""}`).join("\n") || "  nenhum uso";
  const desc = await env.DB.prepare("SELECT nome, limite_descoberto FROM funcionarios WHERE descoberto_em=?").bind(dia).all<any>();
  if (desc.results.length) t += `\n\n🔎 Limites descobertos hoje:\n` + desc.results.map((x) => `  ${x.nome}: ~${x.limite_descoberto} pedidos/dia`).join("\n");
  await avisar(env, t);
}

async function fecharPedidos(env: Env) {
  const abertos = await env.DB.prepare("SELECT id, texto, projeto_id FROM pedidos WHERE status='em_andamento'").all<any>();
  for (const p of abertos.results) {
    const ts = (await env.DB.prepare("SELECT id, cargo, status, funcionario, resultado FROM tarefas WHERE pedido_id=? AND cargo != 'gerente' ORDER BY id").bind(p.id).all<any>()).results;
    if (ts.some((x) => ["pendente", "rodando", "aguardando_gerador"].includes(x.status))) continue;
    const equipe = ts.filter((x) => x.cargo !== "editor");
    const editor = ts.find((x) => x.cargo === "editor");

    // equipe terminou e há mais de 1 entrega: o Editor junta tudo num documento só
    const prontas = equipe.filter((x) => x.status === "concluida");
    // projeto: antes do Editor, o Integrador monta o jogo com tudo que a equipe entregou
    if (p.projeto_id && !ts.some((x) => x.cargo === "integrador") && prontas.length) {
      const assets = (await env.DB.prepare(`SELECT nome FROM arquivos WHERE tarefa_id IN (${prontas.map(() => "?").join(",")})`).bind(...prontas.map((x) => x.id)).all<any>()).results.map((a) => a.nome);
      await env.DB.prepare("INSERT INTO tarefas (pedido_id, cargo, entrada, depende_de) VALUES (?, 'integrador', ?, ?)")
        .bind(p.id, await entradaIntegrador(env, p.projeto_id, assets), JSON.stringify(prontas.map((x) => x.id))).run();
      await evento(env, "integrador", `Pedido #${p.id}: Integrador vai montar o jogo com ${prontas.length} entregas`);
      continue;
    }
    if (!editor && prontas.length > 1) {
      await env.DB.prepare("INSERT INTO tarefas (pedido_id, cargo, entrada, depende_de) VALUES (?, 'editor', ?, ?)")
        .bind(p.id, `Pedido original do cliente: ${p.texto}\n\nMonte a entrega final juntando os resultados acima.`, JSON.stringify(prontas.map((x) => x.id))).run();
      await evento(env, "editor", `Pedido #${p.id}: equipe terminou, Editor vai juntar ${prontas.length} entregas`);
      continue;
    }

    const status = equipe.some((x) => x.status === "falhou") ? "falhou" : "concluido";
    await env.DB.prepare("UPDATE pedidos SET status=?, concluido_em=? WHERE id=?").bind(status, agora(), p.id).run();
    const linhas = equipe.map((x) => `${x.status === "concluida" ? "✅" : "❌"} #${x.id} ${x.cargo} (${x.funcionario ?? "-"})`).join("\n");
    await evento(env, "entrega", `Pedido #${p.id} ${status}`);
    const final = editor?.status === "concluida" ? editor.resultado : prontas.length === 1 ? prontas[0].resultado : "";
    await avisar(env, `🏁 Pedido #${p.id} ${status === "concluido" ? "entregue" : "terminou com falhas"}:\n${linhas}\n\nVer cada parte: /resultado <número>`);
    if (final) await avisar(env, final);
    const arqs = await arquivosDaTarefa(env, equipe.map((x) => x.id));
    if (arqs.length) await enviarArquivos(env, arqs, `Pedido #${p.id}`);
    // guarda tudo no repo de assets: arquivos + LEIAME com a entrega final e cada parte
    const pasta = `${agora().slice(0, 10)}_pedido-${p.id}`;
    const leiame = `# Pedido #${p.id}\n\n> ${p.texto}\n\n${final || ""}\n\n---\n## Partes\n` +
      equipe.map((x) => `### #${x.id} ${x.cargo} (${x.funcionario ?? "-"}) — ${x.status}\n\n${x.resultado ?? ""}`).join("\n\n");
    const link = await salvarNoGitHub(env, pasta, [{ nome: "LEIAME.md", dados: new TextEncoder().encode(leiame) }, ...arqs], `Pedido #${p.id}: ${String(p.texto).slice(0, 60)}`);
    if (link) await avisar(env, `📁 Arquivos do pedido #${p.id} salvos no GitHub:\n${link}`);
    // projeto: grava o jogo, atualiza a memória e já planeja o próximo marco
    if (p.projeto_id) {
      const integ = equipe.find((x) => x.cargo === "integrador");
      const jogo = integ?.status === "concluida" ? await arquivosDaTarefa(env, [integ.id]) : [];
      const assets = await arquivosDaTarefa(env, equipe.filter((x) => x.cargo !== "integrador").map((x) => x.id));
      await fecharMarco(env, p.id, p.projeto_id, final || "", jogo, assets);
    }
  }
}

// ---------- leitura (hub, Telegram, API) ----------

export async function estado(env: Env) {
  const [func, fila, eventos, pedidos] = await Promise.all([
    env.DB.prepare("SELECT id, nome, provedor, modelo, status, pausado_ate, tarefas_feitas, tokens_usados, ultima_atividade FROM funcionarios WHERE ativo=1 ORDER BY id").all(),
    env.DB.prepare("SELECT status, COUNT(*) n FROM tarefas GROUP BY status").all(),
    env.DB.prepare("SELECT em, funcionario, tipo, texto FROM eventos ORDER BY id DESC LIMIT 30").all(),
    env.DB.prepare("SELECT id, texto, status, criado_em, concluido_em FROM pedidos ORDER BY id DESC LIMIT 10").all(),
  ]);
  return { funcionarios: func.results, fila: fila.results, eventos: eventos.results, pedidos: pedidos.results };
}

export async function tarefa(env: Env, id: number) {
  return env.DB.prepare("SELECT * FROM tarefas WHERE id=?").bind(id).first<any>();
}
