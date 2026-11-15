// Hub do escritório — turno da noite. Canvas pixel art + quadro de turno ao vivo.
"use strict";

const API = (window.ESTUDIO_URL || "") + "/hub"; // endereço do Worker: vem de config.js (o setup cria)
const CARGOS = {
  gerente: "Gerente", editor: "Editor", programador: "Programador", qa: "QA", artista_sprite: "Artista de Sprite", compositor: "Compositor", diretor_arte: "Diretor de arte",
  concept_artist: "Artista de cenário", roteirista: "Roteirista", pesquisador: "Pesquisador", game_designer: "Game Designer",
  level_designer: "Level Designer", sound_designer: "Sound Designer",
};
// salas: 5 de trabalho + copa. Cada cargo trabalha na bancada da sua sala.

let senha = null, dados = null;
const tela = document.getElementById("tela");

function guardar(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* sem armazenamento */ } }
function ler(k) { try { return localStorage.getItem(k); } catch { return null; } }

// ---------- quadro de turno (HTML) ----------
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const horaLocal = (utc) => { if (!utc) return "--:--"; const d = new Date(utc.replace(" ", "T") + (utc.endsWith("Z") ? "" : "Z")); return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }); };

function oQueFaz(f) {
  if (f.status === "trabalhando") return `Trabalhando na tarefa #${f.tarefa_atual ?? "?"} · ${CARGOS[f.cargo_atual] ?? f.cargo_atual ?? ""}`;
  if (f.status === "pausado") return `Sem cota agora · volta às ${horaLocal(f.pausado_ate)}`;
  return "Livre";
}

function painel() {
  const ok = document.getElementById("lista-ok");
  ok.innerHTML = dados.esperando_ok.length ? dados.esperando_ok.map((p) => `
    <article class="cartao-ok">
      <p class="cartao-ok__pedido"><span>#${p.id}</span>${esc(p.texto)}</p>
      <ol>${p.tarefas.map((t) => `<li><b>${esc(CARGOS[t.cargo] ?? t.cargo)}</b> — ${esc(t.entrada)}</li>`).join("")}</ol>
      <div class="cartao-ok__acoes">
        <button class="botao botao--primario" data-acao="aprovar" data-id="${p.id}">Aprovar e executar</button>
        <button class="botao" data-acao="cancelar" data-id="${p.id}">Descartar pedido</button>
      </div>
    </article>`).join("") : `<p class="vazio">Nenhum plano esperando. Mande um /pedido no Telegram.</p>`;

  document.getElementById("lista-equipe").innerHTML = dados.funcionarios.map((f) => {
    const fr = f.uso?.fracao, pct = fr == null ? null : Math.round(fr * 100);
    return `<li class="membro membro--${esc(f.status)}">
      <span class="membro__estado" aria-hidden="true"></span>
      <span class="membro__nome">${esc(f.nome)}</span>
      <span class="membro__cota">${f.uso?.pedidos ?? 0} hoje${pct == null ? "" : ` · ${pct}%`}</span>
      <span class="membro__faz">${esc(oQueFaz(f))}</span>
      ${pct == null ? "" : `<span class="barra" role="img" aria-label="${pct}% da cota do dia"><i class="${fr >= 0.8 ? "alta" : ""}" style="width:${Math.min(100, pct)}%"></i></span>`}
    </li>`;
  }).join("");

  document.getElementById("lista-eventos").innerHTML = dados.eventos.slice(0, 14).map((e) =>
    `<li><time>${horaLocal(e.em)}</time>${esc(e.texto)}</li>`).join("") || `<li>Nada aconteceu ainda hoje.</li>`;

  const tr = dados.funcionarios.filter((f) => f.status === "trabalhando").length;
  document.getElementById("resumo-fila").textContent = `${tr} trabalhando · ${dados.fila.pendente ?? 0} na fila · ${dados.esperando_ok.length} esperando OK`;
}

document.addEventListener("click", async (ev) => {
  const b = ev.target.closest("[data-acao]"); if (!b) return;
  // descartar é destrutivo: pede confirmação
  if (b.dataset.acao === "cancelar" && !confirm(`Descartar o pedido #${b.dataset.id}? As tarefas planejadas serão apagadas.`)) return;
  b.disabled = true; b.textContent = b.dataset.acao === "aprovar" ? "Aprovando…" : "Descartando…";
  try {
    const r = await fetch(`${API}/${b.dataset.acao}`, { method: "POST", headers: { "x-hub-senha": senha, "content-type": "application/json" }, body: JSON.stringify({ id: Number(b.dataset.id) }) });
    if (!r.ok) throw new Error();
    await atualizar();
  } catch { b.disabled = false; b.textContent = "Não conectou. Tentar de novo"; }
});

// dica ao clicar num personagem
tela.addEventListener("click", (ev) => {
  const r = tela.getBoundingClientRect(), x = ((ev.clientX - r.left) / r.width) * Mundo.W, y = ((ev.clientY - r.top) / r.height) * Mundo.H;
  const dica = document.getElementById("dica");
  if (Mundo.telaoEm(x, y) && pdfAtual) { window.open(URL.createObjectURL(new Blob([pdfAtual], { type: "application/pdf" })), "_blank", "noopener"); return; }
  const achado = Mundo.pegar(x, y);
  if (!achado) { dica.hidden = true; return; }
  const f = achado.dados, fr = f.uso?.fracao;
  dica.innerHTML = `<b>${esc(f.nome)}</b><br>${esc(achado.atividade ? "Livre · " + achado.atividade : oQueFaz(f))}<br>Hoje: ${f.uso?.pedidos ?? 0} pedidos${fr == null ? " · limite ainda desconhecido" : ` · ${Math.round(fr * 100)}% da cota`}<br>${f.tarefas_feitas} tarefas no total`;
  dica.style.left = `${Math.min(ev.clientX - r.left + 12, r.width - 250)}px`; dica.style.top = `${Math.max(8, ev.clientY - r.top - 70)}px`;
  dica.hidden = false;
});

// ---------- dados ----------
async function atualizar() {
  const r = await fetch(`${API}/estado`, { headers: { "x-hub-senha": senha } });
  if (r.status === 401) throw Object.assign(new Error("senha"), { senha: true });
  if (r.status === 429) throw Object.assign(new Error("bloqueado"), { bloqueado: true });
  if (!r.ok) throw new Error("rede");
  dados = await r.json();
  Mundo.sincronizar(dados.funcionarios, dados); painel();
  document.getElementById("conexao").className = "ponto ok";
}
// ---------- jogos e entregas (links assinados: prévias, áudios e o jogo jogável) ----------
const STATUS_PROJ = { ativo: "trabalhando", testando: "em teste no navegador", corrigindo: "corrigindo erros do teste", pausado: "pausado", concluido: "concluído" };
async function atualizarEntregas() {
  const r = await fetch(`${API}/entregas`, { headers: { "x-hub-senha": senha } });
  if (!r.ok) return;
  const d = await r.json();
  const lj = document.getElementById("lista-jogos");
  lj.innerHTML = d.projetos.length ? d.projetos.map((p) => {
    const teste = String(p.ultimo_teste ?? "").split("\n").find((l) => /jogada automática|PASSOU|FALHOU/.test(l)) ?? "";
    return `<li class="jogo"><span class="jogo__nome">${esc(p.nome)}</span>
      <button type="button" class="botao" data-jogar="${esc(p.jogo)}" data-nome="${esc(p.nome)}">Jogar</button>
      <span class="jogo__info">Marco ${p.marco} de ${p.max_marcos} · ${esc(STATUS_PROJ[p.status] ?? p.status)}${teste ? ` · ${esc(teste.slice(0, 140))}` : ""}</span></li>`;
  }).join("") : `<li class="vazio">Nenhum projeto ainda. Envie um GDD.</li>`;
  const le = document.getElementById("lista-entregas");
  le.innerHTML = d.entregas.length ? d.entregas.slice(0, 10).map((t) => `<li class="entrega">
      <p class="entrega__titulo">#${t.id} · ${esc(CARGOS[t.cargo] ?? t.cargo)}</p>
      <div class="entrega__midia">${t.arquivos.map((a) => a.mime.startsWith("audio/")
        ? `<audio controls preload="none" src="${esc(a.url)}" aria-label="${esc(a.nome)}"></audio>`
        : `<a href="${esc(a.url)}" target="_blank" rel="noopener"><img src="${esc(a.url)}" alt="${esc(a.nome)}" loading="lazy" width="160" height="96"></a>`).join("")}</div>
      <span class="entrega__info">${esc(t.funcionario ?? "")} · ${esc(String(t.concluida_em ?? "").slice(11, 16))}</span></li>`).join("") : `<li class="vazio">Nada entregue ainda.</li>`;
}
document.addEventListener("click", (ev) => {
  const b = ev.target.closest("[data-jogar]"); if (!b) return;
  const j = document.getElementById("janela-jogo");
  document.getElementById("janela-jogo-titulo").textContent = b.dataset.nome;
  document.getElementById("janela-jogo-quadro").src = b.dataset.jogar;
  document.getElementById("janela-jogo-aba").href = b.dataset.jogar;
  j.showModal(); document.getElementById("janela-jogo-quadro").focus();
});
document.getElementById("janela-jogo-fechar").addEventListener("click", () => { const j = document.getElementById("janela-jogo"); document.getElementById("janela-jogo-quadro").src = "about:blank"; j.close(); });
document.getElementById("janela-jogo").addEventListener("close", () => { document.getElementById("janela-jogo-quadro").src = "about:blank"; });
async function laçoEntregas() { if (!document.hidden && senha) { try { await atualizarEntregas(); } catch {} } setTimeout(laçoEntregas, 20000); }

async function laçoDados() {
  if (!document.hidden && senha) {
    try { await atualizar(); }
    catch (e) { if (e.senha) return sair("Senha incorreta. Confira o HUB_SENHA no .env."); document.getElementById("conexao").className = "ponto erro"; }
  }
  setTimeout(laçoDados, 4000);
}
setInterval(() => { document.getElementById("relogio").textContent = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }); }, 1000);

function ajustarTela() { Mundo.ajustar(document.getElementById("moldura").clientWidth); }

// ---------- entrada ----------
function sair(msg) {
  senha = null; guardar("hub_senha", null);
  document.getElementById("app").hidden = true; document.getElementById("entrada").hidden = false;
  const e = document.getElementById("erro-entrada"); e.textContent = msg || ""; e.hidden = !msg;
}
async function entrar(s) {
  senha = s;
  try { await atualizar(); } catch (e) { return sair(e.senha ? "Senha incorreta. Confira o HUB_SENHA no .env." : e.bloqueado ? "Muitas tentativas erradas. Espere a próxima hora." : "Não consegui falar com o escritório. Verifique a internet e tente de novo."); }
  guardar("hub_senha", s);
  document.getElementById("entrada").hidden = true; document.getElementById("app").hidden = false;
  ajustarTela();
}
document.getElementById("form-entrada").addEventListener("submit", (ev) => { ev.preventDefault(); entrar(document.getElementById("senha").value.trim()); });
addEventListener("resize", () => { if (!document.getElementById("app").hidden) ajustarTela(); });

// modo demonstração (?demo): dados de exemplo, sem rede — serve pra revisar o visual
function dadosDemo(t) {
  const lista = [["groq_oss20", "GPT-OSS 20B (Groq)", "groq"], ["groq_oss", "GPT-OSS 120B (Groq)", "groq"], ["groq_qwen", "Qwen 3.8 27B (Groq)", "groq"],
    ["gemini_lite", "Gemini Flash-Lite", "gemini"], ["gem_35lite", "Gemini 3.5 Flash-Lite", "gemini"], ["gem_3flash", "Gemini 3 Flash", "gemini"], ["gem_hydrogen", "Gemini 4 Hydrogen", "gemini"],
    ["nv_ultra", "Nemotron Ultra 550B (NVIDIA)", "nvidia"], ["nv_supervl", "Nemotron Super VL (NVIDIA)", "nvidia"], ["nv_gemma", "Gemma 4 31B (NVIDIA)", "nvidia"],
    ["zai_glm47", "GLM 4.7 Flash (Z.ai)", "zai"], ["zai_glm", "GLM 4.5 Flash (Z.ai)", "zai"], ["cf_llama70", "Llama 3.3 70B (Cloudflare)", "cloudflare"], ["or_free", "OpenRouter grátis", "openrouter"]];
  const ciclo = Math.floor(t / 9000);
  const trabalhos = [["gemini_lite", "artista_sprite", 41], ["nv_ultra", "game_designer", 42], ["zai_glm47", "qa", 43], ["groq_oss20", "programador", 44], ["gem_hydrogen", "level_designer", 45]];
  const ativos = trabalhos.filter((_, i) => (i + ciclo) % 2 === 0).slice(0, 3);
  return {
    funcionarios: lista.map(([id, nome, provedor], i) => {
      const tr = ativos.find((a) => a[0] === id), pausado = id === "or_free" || (id === "gem_3flash" && ciclo % 3 === 0);
      return { id, nome, provedor, status: tr ? "trabalhando" : pausado ? "pausado" : "ocioso", tarefa_atual: tr?.[2] ?? null, cargo_atual: tr?.[1] ?? null,
        pausado_ate: pausado ? new Date(Date.now() + 40 * 60000).toISOString() : null, tarefas_feitas: 3 + i * 2,
        uso: { pedidos: 4 + i * 3, fracao: provedor === "groq" ? 0.15 + i * 0.05 : id === "or_free" ? 0.92 : id === "nv_ultra" ? 0.67 : null } };
    }),
    eventos: [
      { em: "2026-11-15 23:41:10", texto: "Gemini Flash-Lite pegou a tarefa #41 (Artista de Sprite)" },
      { em: "2026-11-15 23:40:02", texto: "Nemotron Ultra 550B entregou a tarefa #40" },
      { em: "2026-11-15 23:38:47", texto: "Pedido #9 aprovado: 4 tarefas na fila" },
      { em: "2026-11-15 23:35:15", texto: "OpenRouter grátis: limite diário atingido" },
    ],
    fila: { pendente: 2 },
    esperando_ok: [{ id: 10, texto: "Fase de neve com pinguim inimigo, sons e mapa", tarefas: [
      { cargo: "level_designer", entrada: "Mapa 40x14 que ensina o gelo com chão firme antes de cada abismo" },
      { cargo: "artista_sprite", entrada: "Pinguim 16x16 deslizando de barriga, 4 frames" },
      { cargo: "sound_designer", entrada: "Sons do pinguim: deslizar, bater na parede, derrota" }] }],
  };
}
const DEMO = new URLSearchParams(location.search).has("demo");

Mundo.iniciar(tela).then(() => {
  if (DEMO) {
    const tick = () => { dados = dadosDemo(performance.now()); Mundo.sincronizar(dados.funcionarios, dados); painel(); document.getElementById("conexao").className = "ponto ok"; };
    document.getElementById("entrada").hidden = true; document.getElementById("app").hidden = false; ajustarTela(); tick(); setInterval(tick, 3000);
    return;
  }
  laçoDados(); laçoEntregas();
  const salva = ler("hub_senha");
  salva ? entrar(salva) : sair();
});

// ---------- GDD em PDF (telão da sala de reunião) ----------
if (window.pdfjsLib) pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
let pdfAtual = null;
async function mostrarPDF(bytes, nome) {
  pdfAtual = bytes.slice();
  const estado = document.getElementById("gdd-estado");
  try {
    const pdf = await pdfjsLib.getDocument({ data: bytes, isEvalSupported: false }) /* bloqueia a falha CVE-2024-4367 do pdf.js */.promise, paginas = [];
    for (let i = 1; i <= Math.min(pdf.numPages, 20); i++) {
      const pg = await pdf.getPage(i), vp = pg.getViewport({ scale: 1 }), esc = 400 / vp.width, v2 = pg.getViewport({ scale: esc });
      const c = document.createElement("canvas"); c.width = v2.width; c.height = v2.height;
      await pg.render({ canvasContext: c.getContext("2d"), viewport: v2 }).promise; paginas.push(c);
    }
    Mundo.definirGDD(paginas, nome);
    estado.textContent = `No telão: ${nome} (${pdf.numPages} página${pdf.numPages > 1 ? "s" : ""}). Clique no telão pra abrir grande.`;
  } catch { estado.textContent = "Não consegui abrir esse PDF. Tente exportar de novo."; }
}
async function carregarGDD() {
  if (DEMO || !senha) return;
  try {
    const r = await fetch(`${API}/gdd`, { headers: { "x-hub-senha": senha } }); if (!r.ok) return;
    await mostrarPDF(new Uint8Array(await r.arrayBuffer()), decodeURIComponent(r.headers.get("x-gdd-nome") || "GDD"));
  } catch { /* sem GDD ainda */ }
}
document.getElementById("form-gdd").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const f = document.getElementById("arquivo-gdd").files[0], estado = document.getElementById("gdd-estado"), btn = ev.submitter;
  if (!f) { estado.textContent = "Escolha um PDF primeiro."; return; }
  if (f.size > 90_000_000) { estado.textContent = `PDF de ${(f.size / 1e6).toFixed(0)} MB passa do limite de envio da Cloudflare (90 MB).`; return; }
  const bytes = new Uint8Array(await f.arrayBuffer());
  if (DEMO) { await mostrarPDF(bytes, f.name); return; } // demonstração: só mostra, não envia
  btn.disabled = true; btn.textContent = "Enviando…";
  try {
    // extrai o texto do PDF aqui no navegador pra equipe já começar a planejar
    let texto = "";
    try { const pdf = await pdfjsLib.getDocument({ data: bytes.slice(), isEvalSupported: false }).promise;
      for (let i = 1; i <= pdf.numPages && texto.length < 60000; i++) texto += (await (await pdf.getPage(i)).getTextContent()).items.map((x) => x.str).join(" ") + "\n\n"; } catch { /* PDF só de imagem: segue sem texto */ }
    const fd = new FormData(); fd.append("pdf", f); fd.append("texto", texto.slice(0, 60000));
    const r = await fetch(`${API}/gdd`, { method: "POST", headers: { "x-hub-senha": senha }, body: fd }); const j = await r.json();
    if (!r.ok) throw new Error(j.erro || "falhou");
    await mostrarPDF(bytes, f.name);
    estado.textContent += j.pedido ? ` Projeto criado: a equipe já está planejando o marco 1 (pedido #${j.pedido}) e segue sozinha pelos próximos marcos.` : " Não consegui ler texto no PDF, então a equipe não foi acionada.";
    await atualizar();
  } catch (e) { estado.textContent = `Não enviou: ${e.message}`; }
  btn.disabled = false; btn.textContent = "Enviar PDF";
});
setTimeout(carregarGDD, 1500);
