// Mundo do escritório: salas com paredes e portas, móveis, personagens montados por camadas,
// rotinas de quem está livre e iluminação de turno da noite. Expõe window.Mundo.
"use strict";
(() => {
  const T = 16, COLS = 32, LINS = 30, W = COLS * T, H = LINS * T;
  const reduzido = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---------- planta baixa ----------
  // paredes internas: colunas 10 e 21, linha 11; portas abertas nelas
  const PAREDE_TOPO = 3; // linhas 0–2 são a parede do fundo
  const parede = (c, l) => l < PAREDE_TOPO || (l < 20 && (c === 10 || c === 21) && ![6, 7, 15, 16].includes(l)) || ((l === 11 || l === 20) && ![4, 5, 15, 16, 26, 27].includes(c));
  const SALAS = [
    { id: "gerencia", nome: "Gerência", c: 0, l: 3, piso: "floor_4", cor: "#5b5470", cargos: ["gerente", "editor"] },
    { id: "codigo", nome: "Código", c: 11, l: 3, piso: "floor_3", cor: "#3e5a78", cargos: ["programador", "qa"] },
    { id: "arte", nome: "Arte", c: 22, l: 3, piso: "floor_5", cor: "#7a5a4a", cargos: ["artista_sprite", "concept_artist", "diretor_arte"] },
    { id: "narrativa", nome: "Narrativa", c: 0, l: 12, piso: "floor_6", cor: "#6b5a44", cargos: ["roteirista", "pesquisador"] },
    { id: "design", nome: "Design e som", c: 11, l: 12, piso: "floor_1", cor: "#5a4e72", cargos: ["game_designer", "level_designer", "sound_designer", "compositor"] },
    { id: "copa", nome: "Copa", c: 22, l: 12, piso: "floor_7", cor: "#5a6878" },
    { id: "reuniao", nome: "Sala de reunião", c: 0, l: 21, w: 32, h: 9, piso: "floor_4", cor: "#5a4048" },
  ];
  const SALA_DO_CARGO = Object.fromEntries(SALAS.flatMap((s) => (s.cargos || []).map((c) => [c, s])));
  const salaPx = (s) => ({ x: s.c * T, y: s.l * T });

  // mesas de casa (4 por sala de trabalho) e bancada de trabalho (2 lugares)
  const MESAS = [], BANCADAS = {};
  for (const s of SALAS.filter((x) => x.cargos)) {
    const o = salaPx(s);
    for (const [dx, dy] of [[8, 34], [62, 34], [8, 82], [62, 82]]) MESAS.push({ sala: s.id, x: o.x + dx, y: o.y + dy, dono: null });
    BANCADAS[s.id] = { x: o.x + 114, y: o.y + 56, lugares: [{ x: o.x + 124, y: o.y + 58 }, { x: o.x + 144, y: o.y + 58 }] };
  }
  // pontos de atividade de quem está livre: [col, lin] onde fica em pé, direção, duração, balão, efeito
  const POIS = {
    cafe: { c: 29, l: 14, dir: "cima", seg: 5, balao: "cafe", rotulo: "pegando café" },
    agua: { c: 26, l: 14, dir: "cima", seg: 4, balao: "agua", rotulo: "bebendo água" },
    lanche: { c: 30, l: 16, dir: "dir", seg: 4, balao: "lanche", rotulo: "comprando lanche" },
    fliperama: { c: 23, l: 15, dir: "cima", seg: 8, balao: "controle", rotulo: "jogando fliperama", fx: "fliperama" },
    playtest: { c: 25, l: 18, dir: "cima", seg: 9, balao: "controle", rotulo: "playtest na TV", fx: "tv" },
    quadroG: { c: 4, l: 4, dir: "cima", seg: 7, balao: "ideia", rotulo: "rabiscando no quadro", fx: "quadroG" },
    quadroD: { c: 14, l: 13, dir: "cima", seg: 7, balao: "ideia", rotulo: "organizando post-its", fx: "quadroD" },
    livro: { c: 3, l: 13, dir: "cima", seg: 8, balao: "livro", rotulo: "lendo referência", ler: true },
    gato: { c: 28, l: 18, dir: "dir", seg: 4, balao: "coracao", rotulo: "fazendo carinho no gato" },
    planta: { c: 8, l: 9, dir: "dir", seg: 4, balao: "gota", rotulo: "regando a planta" },
    bug: { casa: true, seg: 6, balao: "bug", rotulo: "caçando um bug" },
    alongar: { casa: true, seg: 4, balao: null, rotulo: "se alongando", alonga: true },
  };
  // sala de reunião: mesa redonda, cadeiras em volta, telão no fundo, CEO na ponta e o dono em pé
  const MESA_R = { x: 256, y: 432, rx: 84, ry: 22 };
  const CADEIRAS_R = [];
  for (let i = 0; i < 6; i++) { const x = MESA_R.x - 62 + i * 25; CADEIRAS_R.push({ x, y: MESA_R.y - MESA_R.ry - 2, lado: "cima" }, { x, y: MESA_R.y + MESA_R.ry + 16, lado: "baixo" }); }
  const CEO = { x: MESA_R.x - MESA_R.rx - 14, y: MESA_R.y + 8 }, DONO = { x: MESA_R.x + MESA_R.rx + 22, y: MESA_R.y + 4 };
  const reuniao = { pedido: null, okAte: 0 };
  const gdd = { paginas: [], nome: "" };
  let ceoFolha = null, donoFolha = null;
  const PAPO = [[[16, 9], [17, 9]], [[6, 18], [7, 18]], [[27, 9], [28, 9]]]; // pares de lugares pra conversar

  // ---------- recursos ----------
  const img = {};
  const carregar = (n, src) => new Promise((ok) => { const i = new Image(); i.onload = () => { img[n] = i; ok(); }; i.onerror = () => ok(); i.src = src; });
  const MOVEIS = ["BIN", "BOOKSHELF", "CACTUS", "CLOCK", "COFFEE", "COFFEE_TABLE", "CUSHIONED_CHAIR_BACK", "DESK_FRONT", "DOUBLE_BOOKSHELF", "HANGING_PLANT", "LARGE_PAINTING",
    "LARGE_PLANT", "PC_FRONT_OFF", "PC_FRONT_ON_1", "PC_FRONT_ON_2", "PC_FRONT_ON_3", "PC_BACK", "CUSHIONED_CHAIR_FRONT", "WOODEN_CHAIR_FRONT", "PLANT", "PLANT_2", "POT", "SMALL_PAINTING", "SMALL_PAINTING_2", "SMALL_TABLE_FRONT",
    "SOFA_FRONT", "SOFA_BACK", "WHITEBOARD", "WOODEN_CHAIR_BACK"];
  const ROUPA = { body: ["flat", "bust"], hair: ["bob", "bowl_cut", "high_ponytail", "long", "long_bangs", "long_waves", "low_ponytail", "mop", "parted", "short", "shoulder_length", "side_swept", "slicked_back", "spiky"],
    top: ["tshirt", "turtleneck", "long_sleeved_shirt", "tank_top"], jacket: ["bomber", "open_shirt", "vest", "blazer"], pants: ["jeans", "low_cut_jeans", "shorts", "skirt"],
    shoes: ["sneakers", "boots"], beard: ["stubble", "goatee", "full_beard", "moustache"], hat: ["plain_cap", "flap_cap", "badge_cap"], shades: ["glasses", "shades"], eyes: ["whites", "iris.both"] };
  async function carregarTudo() {
    const tarefas = [carregar("office", "assets/office.png"), document.fonts.load("8px Silkscreen")];
    for (const m of MOVEIS) tarefas.push(carregar(m, `assets/pa/moveis/${m}.png`));
    for (const p of ["floor_1", "floor_3", "floor_4", "floor_5", "floor_6", "floor_7", "carpet_0", "carpet_1"]) tarefas.push(carregar(p, `assets/pa/pisos/${p}.png`));
    for (const [parte, lista] of Object.entries(ROUPA)) for (const n of lista) tarefas.push(carregar(`r_${parte}_${n}`, `assets/pa/roupa/${parte}/${n}.png`));
    await Promise.all(tarefas);
  }

  // pinta uma imagem em tons de cinza com uma cor (multiplica, preserva luz e sombra)
  const cacheTinta = new Map();
  function tinta(nome, cor) {
    const k = nome + cor; if (cacheTinta.has(k)) return cacheTinta.get(k);
    const i = img[nome]; if (!i) return null;
    const c = document.createElement("canvas"); c.width = i.width; c.height = i.height;
    const x = c.getContext("2d"); x.drawImage(i, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height), p = d.data;
    const [r, g, b] = [1, 3, 5].map((o) => parseInt(cor.slice(o, o + 2), 16));
    for (let j = 0; j < p.length; j += 4) { if (!p[j + 3]) continue; const l = p[j] / 255 * 1.18; p[j] = Math.min(255, r * l); p[j + 1] = Math.min(255, g * l); p[j + 2] = Math.min(255, b * l); }
    x.putImageData(d, 0, 0); cacheTinta.set(k, c); return c;
  }

  // ---------- personagens montados por camadas ----------
  const COR_PROVEDOR = { gemini: "#4a7fd6", groq: "#e07a3a", nvidia: "#5cae4a", zai: "#8a5ad0", cloudflare: "#e2a13a", openrouter: "#c84a6a" };
  const CABELOS = ["#2a211c", "#5a3a24", "#8a5a32", "#d8b060", "#a83a2a", "#3a4a8a", "#e8e0d0"];
  const CALCAS = ["#2f3f66", "#24262e", "#6a5a44", "#4a5a4a"];
  const OLHOS = ["#3a2a1a", "#2a5a8a", "#3a7a4a"];
  function hash(s) { let h = 2166136261; for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; }
  function sorteador(seed) { let a = seed; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function montar(id, provedor) {
    const r = sorteador(hash(id)), pega = (l) => l[Math.floor(r() * l.length)];
    const corpo = pega(ROUPA.body), cabelo = pega(ROUPA.hair), corCab = pega(CABELOS), camisa = COR_PROVEDOR[provedor] ?? "#8c93b0";
    const camadas = [[`r_body_${corpo}`], [`r_eyes_whites`], [`r_eyes_iris.both`, pega(OLHOS)], [`r_shoes_${pega(ROUPA.shoes)}`, "#3a3030"],
      [`r_pants_${pega(ROUPA.pants)}`, pega(CALCAS)], [`r_top_${pega(ROUPA.top)}`, camisa]];
    if (r() < 0.35) camadas.push([`r_jacket_${pega(ROUPA.jacket)}`, "#3a3d52"]);
    if (corpo === "flat" && r() < 0.4) camadas.push([`r_beard_${pega(ROUPA.beard)}`, corCab]);
    camadas.push([`r_hair_${cabelo}`, corCab]);
    if (r() < 0.3) camadas.push([`r_shades_${pega(ROUPA.shades)}`, "#202028"]);
    if (r() < 0.18) camadas.push([`r_hat_${pega(ROUPA.hat)}`, camisa]);
    const c = document.createElement("canvas"); c.width = 128; c.height = 96; const x = c.getContext("2d");
    for (const [nome, cor] of camadas) { const fonte = cor ? tinta(nome, cor) : img[nome]; if (fonte) x.drawImage(fonte, 0, 0); }
    return c;
  }

  function montarFixo(camadas) { const c = document.createElement("canvas"); c.width = 128; c.height = 96; const x = c.getContext("2d");
    for (const [nome, cor] of camadas) { const f = cor ? tinta(nome, cor) : img[nome]; if (f) x.drawImage(f, 0, 0); } return c; }

  // ---------- caminhos (A* na grade, contornando paredes) ----------
  function caminho(de, para) {
    const k = (c, l) => l * COLS + c, aberto = [[de[0], de[1]]], veio = new Map([[k(...de), null]]), custo = new Map([[k(...de), 0]]);
    while (aberto.length) {
      aberto.sort((a, b) => (custo.get(k(...a)) + Math.abs(a[0] - para[0]) + Math.abs(a[1] - para[1])) - (custo.get(k(...b)) + Math.abs(b[0] - para[0]) + Math.abs(b[1] - para[1])));
      const [c, l] = aberto.shift();
      if (c === para[0] && l === para[1]) { const p = []; let n = k(c, l); while (n != null) { p.unshift([n % COLS, Math.floor(n / COLS)]); n = veio.get(n); } return p; }
      for (const [dc, dl] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nc = c + dc, nl = l + dl; if (nc < 0 || nl < 0 || nc >= COLS || nl >= LINS || parede(nc, nl) || (BLOQ.has(nl * COLS + nc) && !(nc === para[0] && nl === para[1]))) continue;
        const nk = k(nc, nl), g = custo.get(k(c, l)) + 1; if (custo.has(nk) && custo.get(nk) <= g) continue;
        custo.set(nk, g); veio.set(nk, k(c, l)); aberto.push([nc, nl]);
      }
    }
    return [para];
  }
  const BLOQ = new Set();
  const bloquear = (x, y, w, h) => { for (let l = Math.floor(y / T); l <= Math.floor((y + h - 1) / T); l++) for (let c = Math.floor(x / T); c <= Math.floor((x + w - 1) / T); c++) BLOQ.add(l * COLS + c); };
  for (const m of MESAS) bloquear(m.x, m.y + 8, 48, 22);
  for (const b of Object.values(BANCADAS)) bloquear(b.x, b.y + 4, 40, 10);
  bloquear(MESA_R.x - MESA_R.rx, MESA_R.y - MESA_R.ry, MESA_R.rx * 2, MESA_R.ry * 2);
  const tile = (x, y) => [Math.max(0, Math.min(COLS - 1, Math.floor(x / T))), Math.max(PAREDE_TOPO, Math.min(LINS - 1, Math.floor(y / T)))];

  // ---------- estado ----------
  let ctx, tela, escala = 1, t0 = performance.now(), luz, lctx;
  const pers = new Map();
  const fx = { quadroG: 0, quadroD: 0, fliperama: 0, tv: 0 };
  let gato = { x: 28 * T + 4, y: 18 * T + 10, alvo: null, espera: 0 };

  function desenhar(nome, x, y, flip) {
    const i = typeof nome === "string" ? img[nome] : nome; if (!i) return;
    if (!flip) return ctx.drawImage(i, Math.round(x), Math.round(y));
    ctx.save(); ctx.translate(Math.round(x) + i.width, Math.round(y)); ctx.scale(-1, 1); ctx.drawImage(i, 0, 0); ctx.restore();
  }
  const recorte = (r, x, y) => ctx.drawImage(img.office, r[0], r[1], r[2], r[3], Math.round(x), Math.round(y), r[2], r[3]);
  function texto(t, x, y, cor) { ctx.font = "8px Silkscreen"; ctx.fillStyle = cor; ctx.textBaseline = "top"; ctx.fillText(t, x, y); }
  const rect = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), w, h); };

  // ---------- itens desenhados por código ----------
  function servidor(x, y, t) { rect(x, y, 16, 30, "#1b1e2a"); rect(x + 1, y + 1, 14, 28, "#2a2f40");
    for (let i = 0; i < 6; i++) { rect(x + 2, y + 3 + i * 4, 12, 3, "#141722"); const on = reduzido || (Math.floor(t / 180 + i * 1.7) % 3 !== 0); rect(x + 3, y + 4 + i * 4, 1, 1, on ? "#6fd39b" : "#1f3a2a"); rect(x + 5, y + 4 + i * 4, 1, 1, (Math.floor(t / 260 + i) % 4 === 0) ? "#f2a33a" : "#3a2a10"); } }
  function fliperama(x, y, t, ativo) { rect(x, y, 16, 30, "#23205a"); rect(x + 1, y + 1, 14, 3, "#e0507a"); rect(x + 2, y + 6, 12, 10, "#0b0b16");
    const h = (t / (ativo ? 60 : 400)) % 360; ctx.fillStyle = `hsl(${h},70%,${ativo ? 55 : 35}%)`; ctx.fillRect(x + 4, y + 9 + Math.round(Math.sin(t / 200) * 2), 3, 3);
    rect(x + 9, y + 13, 3, 1, "#f2d24a"); rect(x + 2, y + 18, 12, 4, "#3a3680"); rect(x + 4, y + 19, 2, 2, "#e0507a"); rect(x + 9, y + 19, 2, 2, "#4ad0e0"); rect(x + 2, y + 23, 12, 7, "#1a1840"); }
  function tv(x, y, t, ativo) { rect(x, y, 30, 18, "#14161f"); rect(x + 2, y + 2, 26, 13, ativo ? "#1e3a5a" : "#0c0e16");
    if (ativo) { rect(x + 4, y + 11, 22, 2, "#3a7a3a"); rect(x + 6 + Math.floor((t / 120) % 16), y + 8, 3, 3, "#f2d24a"); rect(x + 20, y + 7, 3, 4, "#e0507a"); }
    rect(x + 13, y + 18, 4, 3, "#14161f"); rect(x + 8, y + 21, 14, 2, "#2a2d3a"); }
  function cavalete(x, y) { rect(x + 3, y + 8, 2, 22, "#6a4a2a"); rect(x + 13, y + 8, 2, 22, "#6a4a2a"); rect(x + 1, y, 16, 14, "#efe8d8"); rect(x + 3, y + 2, 5, 4, "#4a7fd6"); rect(x + 9, y + 5, 6, 5, "#e07a3a"); rect(x + 4, y + 8, 4, 4, "#5cae4a"); }
  function sintetizador(x, y) { rect(x, y, 30, 10, "#22242e"); for (let i = 0; i < 7; i++) rect(x + 2 + i * 4, y + 4, 3, 5, "#e9e4d8"); for (const i of [0, 1, 3, 4, 5]) rect(x + 4 + i * 4, y + 4, 2, 3, "#14161f"); rect(x + 2, y + 1, 2, 2, "#e0507a"); rect(x + 6, y + 1, 2, 2, "#f2a33a"); }
  function postits(x, y, n) { const cores = ["#f2d24a", "#e0507a", "#6fd39b", "#4ad0e0", "#f2a33a"]; for (let i = 0; i < 6 + n; i++) rect(x + 3 + (i % 5) * 5, y + 4 + Math.floor(i / 5) * 6, 4, 4, cores[i % 5]); }
  function puff(x, y) { rect(x, y + 3, 16, 9, "#7a3a6a"); rect(x + 2, y, 12, 5, "#9a4a86"); }
  function janelaNoite(x, y, t) { rect(x, y, 26, 22, "#2a2f45"); rect(x + 2, y + 2, 22, 18, "#0e1430");
    for (let i = 0; i < 5; i++) { const sx = x + 4 + ((i * 37 + x) % 18), sy = y + 4 + ((i * 23 + x) % 12); if (reduzido || Math.floor(t / 700 + i * 3) % 4) rect(sx, sy, 1, 1, "#d8e0ff"); }
    rect(x + 12, y + 2, 2, 18, "#2a2f45"); rect(x + 2, y + 10, 22, 1, "#2a2f45"); }

  function mesaRedonda(t) {
    ctx.fillStyle = "#3a2618"; ctx.beginPath(); ctx.ellipse(MESA_R.x, MESA_R.y + 4, MESA_R.rx, MESA_R.ry, 0, 0, 7); ctx.fill();
    ctx.fillStyle = "#8a5a32"; ctx.beginPath(); ctx.ellipse(MESA_R.x, MESA_R.y, MESA_R.rx, MESA_R.ry, 0, 0, 7); ctx.fill();
    ctx.fillStyle = "#a06a3c"; ctx.beginPath(); ctx.ellipse(MESA_R.x, MESA_R.y - 2, MESA_R.rx - 8, MESA_R.ry - 7, 0, 0, 7); ctx.fill();
    rect(MESA_R.x - 6, MESA_R.y - 6, 12, 7, "#22242e"); rect(MESA_R.x - 2, MESA_R.y - 4, 4, 3, reuniao.pedido ? "#f2f0e0" : "#4a4d5a");
    for (const [dx, dy] of [[-50, -8], [30, 6], [55, -6]]) rect(MESA_R.x + dx, MESA_R.y + dy, 8, 6, "#efe8d8");
  }
  function quebrar(txt, max) { const out = []; let l = ""; for (const w of String(txt).split(/\s+/)) { if ((l + " " + w).trim().length > max) { out.push(l.trim()); l = w; } else l += " " + w; } if (l.trim()) out.push(l.trim()); return out; }
  function telao(t) {
    const x = 156, y = 20 * T + 2, w = 200, h = 56;
    rect(x - 3, y - 3, w + 6, h + 6, "#2a2d3a"); rect(x, y, w, h, reuniao.pedido || gdd.paginas.length ? "#f2efe4" : "#16192a");
    if (gdd.paginas.length) { // GDD em PDF: uma página a cada 6 s, encaixada no telão
      const pg = gdd.paginas[Math.floor(t / 6000) % gdd.paginas.length], e = Math.min(w / pg.width, (h - 10) / pg.height), pw = pg.width * e, ph = pg.height * e;
      ctx.imageSmoothingEnabled = true; ctx.drawImage(pg, x + (w - pw) / 2, y + 10 + (h - 10 - ph) / 2, pw, ph); ctx.imageSmoothingEnabled = false;
      rect(x, y, w, 9, "#d49a00"); texto(`GDD · ${gdd.nome}`.slice(0, 32), x + 3, y + 1, "#1a1206");
      if (reuniao.pedido) { rect(x, y + h - 9, w, 9, "#c0402a"); texto(`PEDIDO #${reuniao.pedido.id} · AGUARDANDO SEU OK`, x + 3, y + h - 8, "#fff4e8"); }
      return;
    }
    if (!reuniao.pedido) { texto("BOARD LABS", x + 44, y + 18, "#f2a33a"); texto("SEM REUNIÃO", x + 42, y + 32, "#6a6f88"); return; }
    const p = reuniao.pedido, slides = [{ t: `GDD · PEDIDO #${p.id}`, c: p.texto }, ...(p.tarefas || []).map((x, i) => ({ t: `${i + 1}/${p.tarefas.length} · ${x.cargo.replace("_", " ").toUpperCase()}`, c: x.entrada }))];
    const sl = slides[Math.floor(t / 5000) % slides.length];
    rect(x, y, w, 12, "#d49a00"); texto(sl.t.slice(0, 26), x + 4, y + 2, "#1a1206");
    ctx.font = "7px 'Atkinson Hyperlegible', sans-serif"; ctx.fillStyle = "#2a2a32";
    quebrar(sl.c, 36).slice(0, 5).forEach((l, i) => ctx.fillText(l, x + 4, y + 16 + i * 8));
    texto("AGUARDANDO SEU OK", x + 32, y + h - 10, "#c0402a");
  }

  const ICONES = { // 7x6
    cafe: ["..x.x..", ".......", "xxxxx..", "x...xx.", "x...x..", ".xxx..."], agua: ["...x...", "..xxx..", ".xxxxx.", ".xxxxx.", "..xxx..", "......."],
    lanche: [".xxxxx.", "x.x.x.x", "xxxxxxx", ".x.x.x.", ".xxxxx.", "......."], controle: [".......", ".xxxxx.", "x.x.x.x", "xxx.xxx", ".x...x.", "......."],
    ideia: ["..xxx..", ".x...x.", ".x...x.", "..xxx..", "..xxx..", "...x..."], livro: [".......", "xxx.xxx", "x.x.x.x", "xxx.xxx", "xxxxxxx", "......."],
    coracao: [".xx.xx.", "xxxxxxx", "xxxxxxx", ".xxxxx.", "..xxx..", "...x..."], gota: ["...x...", "..xxx..", ".xxxxx.", ".xxxxx.", "..xxx..", "......."],
    bug: ["x.....x", ".x.x.x.", "..xxx..", ".xxxxx.", "..xxx..", ".x...x."], papo: [".......", ".......", "x.x.x..", ".......", ".......", "......."],
  };
  const COR_ICONE = { cafe: "#7a4a2a", agua: "#3a8ad8", lanche: "#e07a3a", controle: "#3a3d52", ideia: "#e0a020", livro: "#4a7fd6", coracao: "#e0507a", gota: "#3a8ad8", bug: "#5cae4a", papo: "#3a3d52" };
  function balao(tipo, x, y) { rect(x - 5, y - 9, 11, 9, "#efe8d8"); rect(x - 1, y, 2, 2, "#efe8d8"); const g = ICONES[tipo]; if (!g) return;
    g.forEach((linha, j) => [...linha].forEach((ch, i) => { if (ch === "x") rect(x - 3 + i, y - 8 + j, 1, 1, COR_ICONE[tipo]); })); }

  // ---------- cenário fixo (chão e paredes) num canvas separado ----------
  let fundo = null;
  function construirFundo() {
    fundo = document.createElement("canvas"); fundo.width = W; fundo.height = H; const f = fundo.getContext("2d");
    for (const s of SALAS) { const lad = tinta(s.piso, s.cor), o = salaPx(s); for (let l = 0; l < (s.h ?? 8); l++) for (let c = 0; c < (s.w ?? 10); c++) if (lad) f.drawImage(lad, o.x + c * T, o.y + l * T); }
    // tapetes
    const tap = tinta("carpet_1", "#6a4a5e"); if (tap) f.drawImage(tap, 23 * T, 16 * T);
    const tap2 = tinta("carpet_0", "#4a5a7a"); if (tap2) f.drawImage(tap2, 2 * T, 15 * T);
    // corredores (portas) com piso neutro
    const neutro = tinta("floor_1", "#4a4a5a");
    for (let l = 0; l < LINS; l++) for (let c = 0; c < COLS; c++) if (!parede(c, l) && (c === 10 || c === 21 || l === 11 || l === 20) && neutro) f.drawImage(neutro, c * T, l * T);
    // paredes: topo escuro + face com rodapé
    for (let l = 0; l < LINS; l++) for (let c = 0; c < COLS; c++) {
      if (!parede(c, l)) continue; const x = c * T, y = l * T;
      if (l < PAREDE_TOPO) { f.fillStyle = l === 2 ? "#2c3150" : "#22263f"; f.fillRect(x, y, T, T); if (l === 2) { f.fillStyle = "#3a4064"; f.fillRect(x, y + 12, T, 4); } continue; }
      const debaixoLivre = l + 1 < LINS && !parede(c, l + 1);
      f.fillStyle = "#171a2b"; f.fillRect(x, y, T, T);
      if (debaixoLivre) { f.fillStyle = "#2c3150"; f.fillRect(x, y + 6, T, 10); f.fillStyle = "#3a4064"; f.fillRect(x, y + 13, T, 3); }
    }
    // nomes das salas
    f.font = "8px Silkscreen"; f.textBaseline = "top";
    for (const s of SALAS) { const o = salaPx(s); f.fillStyle = "rgba(10,12,24,.55)"; f.fillRect(o.x + 3, o.y + 3, f.measureText(s.nome.toUpperCase()).width + 6, 11); f.fillStyle = "#f2a33a"; f.fillText(s.nome.toUpperCase(), o.x + 6, o.y + 5); }
  }

  // ---------- objetos com profundidade (desenhados junto com os personagens, ordenados pela base) ----------
  function objetos(t) {
    const L = []; const add = (base, fn) => L.push({ base, fn });
    // parede do fundo: janelas, relógio, quadros
    add(0, () => { for (const x of [36, 100, 196, 292, 388, 452]) janelaNoite(x, 12, t);
      desenhar("CLOCK", 252, 6); const h = new Date(); texto(`${String(h.getHours()).padStart(2, "0")}:${String(h.getMinutes()).padStart(2, "0")}`, 270, 18, "#f2a33a");
      desenhar("WHITEBOARD", 48, 14); if (fx.quadroG > 0 || true) { rect(54, 22, 10, 1, "#3a6ad8"); rect(56, 26, 14, 1, "#e0507a"); rect(55, 30, 8, 1, "#3a3d52"); for (let i = 0; i < fx.quadroG; i++) rect(60 + (i * 7) % 18, 23 + (i * 5) % 12, 3, 1, ["#3a6ad8", "#e0507a", "#5cae4a"][i % 3]); }
      desenhar("LARGE_PAINTING", 400, 12); desenhar("SMALL_PAINTING", 430, 14); desenhar("SMALL_PAINTING_2", 344, 14); desenhar("HANGING_PLANT", 330, 8); desenhar("BOOKSHELF", 140, 22); });
    // parede do meio (linha 11): quadro do design, estantes da narrativa
    add(11 * T + 15, () => { desenhar("DOUBLE_BOOKSHELF", 8, 11 * T - 14); desenhar("DOUBLE_BOOKSHELF", 44, 11 * T - 14);
      recorte([188, 63, 17, 19], 12 * T + 18, 11 * T - 6); recorte([213, 63, 17, 19], 12 * T + 36, 11 * T - 6); postits(13 * T + 34, 11 * T - 4, fx.quadroD);
      desenhar("LARGE_PAINTING", 23 * T + 30, 11 * T - 18); });
    // mesas de casa: PC liga quando o dono está sentado
    for (const m of MESAS) add(m.y + 32, () => {
      desenhar("DESK_FRONT", m.x, m.y);
      desenhar("PC_BACK", m.x + 16, m.y - 10);
      const sentado = m.dono && pers.get(m.dono)?.sentadoEm === m;
      if (sentado) rect(m.x + 18, m.y - 8, 12, 2, (Math.floor(t / 400 + m.x) % 2) ? "#6fd3ff" : "#4ab0e0"); // brilho da tela
    });
    for (const m of MESAS) add(m.y + 4, () => desenhar("CUSHIONED_CHAIR_FRONT", m.x + 16, m.y - 12));
    for (const b of Object.values(BANCADAS)) for (const l of b.lugares) add(l.y - 4, () => desenhar("CUSHIONED_CHAIR_FRONT", l.x - 8, l.y - 20));
    // bancadas de trabalho
    for (const [id, b] of Object.entries(BANCADAS)) add(b.y + 16, () => { recorte([115, 47, 40, 16], b.x, b.y); recorte([211, 140, 11, 8], b.x + 4, b.y - 5); recorte([211, 140, 11, 8], b.x + 24, b.y - 5); });
    // decoração por sala
    add(9 * T + 30, () => desenhar("LARGE_PLANT", 7 * T + 4, 8 * T + 14));                         // gerência
    add(4 * T + 30, () => servidor(19 * T + 6, 3 * T + 2, t));                                      // código
    add(9 * T + 28, () => { desenhar("CACTUS", 20 * T, 9 * T - 2); });
    add(5 * T + 30, () => cavalete(30 * T, 3 * T + 4));                                             // arte
    add(10 * T + 14, () => { desenhar("PLANT_2", 31 * T - 2, 9 * T); });
    add(18 * T + 14, () => { desenhar("PLANT", 9 * T, 18 * T - 8); }); // narrativa
    add(12 * T + 12, () => sintetizador(19 * T - 2, 12 * T + 2));                                       // design e som
    add(19 * T, () => desenhar("PLANT_2", 20 * T, 18 * T - 2));
    // copa
    add(14 * T + 4, () => { recorte([171, 44, 79, 17], 27 * T - 6, 12 * T + 18); desenhar("COFFEE", 29 * T, 12 * T + 14); recorte([233, 106, 15, 19], 26 * T, 12 * T + 10); });
    add(16 * T + 2, () => recorte([159, 123, 24, 34], 31 * T - 10, 14 * T));
    add(15 * T + 2, () => fliperama(23 * T, 13 * T + 2, t, fx.fliperama > 0));
    add(17 * T + 6, () => { tv(24 * T + 2, 16 * T - 6, t, fx.tv > 0); });
    add(19 * T + 4, () => { puff(24 * T + 6, 18 * T + 8); desenhar("SOFA_FRONT", 27 * T, 17 * T + 2); desenhar("COFFEE_TABLE", 27 * T, 18 * T + 2); });
    // sala de reunião
    add(20 * T + 15, () => telao(t));
    add(MESA_R.y - MESA_R.ry, () => { for (const c of CADEIRAS_R.filter((c) => c.lado === "cima")) desenhar("WOODEN_CHAIR_FRONT", c.x - 8, c.y - 26); });
    add(MESA_R.y + MESA_R.ry, () => mesaRedonda(t));
    add(MESA_R.y + MESA_R.ry + 30, () => { for (const c of CADEIRAS_R.filter((c) => c.lado === "baixo")) desenhar("WOODEN_CHAIR_BACK", c.x - 8, c.y - 22); });
    add(CEO.y, () => { if (ceoFolha) { ctx.drawImage(ceoFolha, 16, 64, 16, 32, CEO.x - 8, CEO.y - 30, 16, 32); texto("CEO", CEO.x - 8, CEO.y - 42, "#f2a33a"); if (reuniao.pedido) balao("ideia", CEO.x, CEO.y - 34); } });
    add(DONO.y, () => { if (donoFolha) { ctx.save(); ctx.translate(DONO.x + 8, DONO.y - 30); ctx.scale(-1, 1); ctx.drawImage(donoFolha, 16, 64, 16, 32, 0, 0, 16, 32); ctx.restore(); texto("VOCÊ", DONO.x - 10, DONO.y - 42, "#6fd39b");
      if (performance.now() < reuniao.okAte) { rect(DONO.x - 10, DONO.y - 56, 22, 11, "#6fd39b"); texto("OK!", DONO.x - 7, DONO.y - 54, "#10301c"); } } });
    add(30 * T, () => { desenhar("LARGE_PLANT", 8, 22 * T); desenhar("LARGE_PLANT", W - 40, 22 * T); desenhar("HANGING_PLANT", 120, 20 * T + 4); desenhar("HANGING_PLANT", 380, 20 * T + 4); });
    add(gato.y, () => recorte([65, 129, 13, 13], gato.x, gato.y - 12));
    add(19 * T + 10, () => recorte([59, 146, 24, 11], 30 * T, 19 * T - 6));
    return L;
  }

  // ---------- personagens ----------
  function pose(p, t) {
    if (p.caminho?.length) { const v = p.dir; return { lin: v === "cima" ? 1 : v === "baixo" ? 0 : 2, col: [0, 1, 2, 1][Math.floor(t / 140) % 4], flip: v === "esq" }; }
    if (p.sentadoEm?.reuniao) return { lin: p.sentadoEm.lado === "baixo" ? 1 : 0, col: 1 };
    if (p.sentadoEm) return p.estado === "trabalhando" || p.atividade?.balao === "bug" || (!p.atividade && p.estado === "livre") ? { lin: 0, col: 3 + (Math.floor(t / (p.estado === "trabalhando" ? 280 : 900) + p.fase) % 2) } : { lin: 0, col: 1 };
    if (p.atividade?.ler) return { lin: 0, col: 5 + (Math.floor(t / 900) % 2) };
    const d = p.atividade?.dir ?? p.olhar ?? "baixo";
    return { lin: d === "cima" ? 1 : d === "baixo" ? 0 : 2, col: 1, flip: d === "esq" };
  }
  function corCota(f) { if (f == null) return "#8c93b0"; if (f >= 0.8) return "#ef6a5a"; if (f >= 0.6) return "#f28a3a"; return "#f2a33a"; }
  function desenharPersonagem(p, t) {
    const { lin, col, flip } = pose(p, t);
    const bob = p.atividade?.alonga && !reduzido ? Math.round(Math.abs(Math.sin(t / 250)) * -2) : 0;
    const x = Math.round(p.x - 8), y = Math.round(p.y - 30 + bob);
    ctx.save(); if (flip) { ctx.translate(x + 16, y); ctx.scale(-1, 1); ctx.drawImage(p.folha, col * 16, lin * 32, 16, 32, 0, 0, 16, 32); } else ctx.drawImage(p.folha, col * 16, lin * 32, 16, 32, x, y, 16, 32); ctx.restore();
    const pisca = p.estado === "pausado" && !reduzido && Math.floor(t / 500) % 2;
    rect(x + 7, y - 3, 3, 3, pisca ? "#5a2a2a" : corCota(p.cota));
    if (p.estado === "pausado") texto("z", x + 13 + (reduzido ? 0 : Math.sin(t / 400) * 2), y - 6 - (reduzido ? 0 : (t / 90) % 6), "#a9a8b8");
    else if (p.estado === "trabalhando" && p.sentadoEm && p.tarefa) texto("#" + p.tarefa, x - 2, y - 12, "#6fd39b");
    else if (p.atividade?.balao && p.noLugar) balao(p.atividade.balao, x + 8, y - 4);
    p.caixa = { x, y: y - 4, w: 16, h: 34 };
  }

  function irPara(p, x, y, aoChegar) {
    const de = tile(p.x, p.y), para = tile(x, y);
    p.caminho = caminho(de, para).slice(1).map(([c, l]) => [c * T + 8, l * T + 12]);
    p.caminho.push([x, y]); p.aoChegar = aoChegar; p.sentadoEm = null; p.noLugar = false;
  }

  function mover(p, dt) {
    if (!p.caminho?.length) return;
    const v = 40, [tx, ty] = p.caminho[0], dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy);
    if (reduzido || d <= v * dt) { p.x = tx; p.y = ty; p.caminho.shift(); if (!p.caminho.length) { const f = p.aoChegar; p.aoChegar = null; f?.(); } return; }
    p.x += (dx / d) * v * dt; p.y += (dy / d) * v * dt;
    p.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "dir" : "esq") : dy > 0 ? "baixo" : "cima";
  }

  const ocupados = () => new Set([...pers.values()].map((p) => p.atividade?.id).filter(Boolean));
  function escolherAtividade(p) {
    const livres = Object.keys(POIS).filter((k) => !ocupados().has(k));
    const emAtividade = [...pers.values()].filter((q) => q.atividade).length;
    if (emAtividade >= 5) return;
    // às vezes, conversa em dupla com outro livre
    const parceiro = [...pers.values()].find((q) => q !== p && q.estado === "livre" && !q.atividade && !q.caminho?.length);
    if (parceiro && Math.random() < 0.2) {
      const par = PAPO.find((_, i) => !ocupados().has("papo" + i)); if (!par) return;
      const id = "papo" + PAPO.indexOf(par);
      [[p, par[0], "dir"], [parceiro, par[1], "esq"]].forEach(([q, [c, l], dir]) => {
        q.atividade = { id, balao: "papo", dir, seg: 7, rotulo: "conversando" };
        irPara(q, c * T + 8, l * T + 12, () => { q.noLugar = true; q.fim = performance.now() + 7000; });
      });
      return;
    }
    const k = livres[Math.floor(Math.random() * livres.length)]; if (!k) return;
    const a = { id: k, ...POIS[k] }; p.atividade = a;
    if (a.casa) { p.noLugar = true; p.fim = performance.now() + a.seg * 1000; if (a.alonga) p.sentadoEm = null; return; }
    irPara(p, a.c * T + 8, a.l * T + 12, () => { p.noLugar = true; p.fim = performance.now() + a.seg * 1000; if (a.fx) fx[a.fx] = (fx[a.fx] || 0) + 1; });
  }
  function terminarAtividade(p) {
    const a = p.atividade; p.atividade = null; p.noLugar = false;
    if (a?.fx) fx[a.fx] = Math.max(0, (fx[a.fx] || 1) - 1);
    if (a?.id === "quadroG") fx.quadroG = Math.min(14, (fx.quadroG || 0) + 1); // rabiscos ficam no quadro
    if (a?.id === "quadroD") fx.quadroD = Math.min(9, (fx.quadroD || 0) + 1);
    voltarParaCasa(p);
  }
  function voltarParaCasa(p) { const m = p.mesa; if (!m) return; irPara(p, m.x + 24, m.y + 6, () => { p.sentadoEm = m; p.proxima = performance.now() + 8000 + Math.random() * 20000; }); }

  function atualizarRotinas(agora) {
    for (const p of pers.values()) {
      if (p.estado !== "livre" || p.naReuniao) continue;
      if (p.atividade && p.noLugar && agora > (p.fim ?? 0)) terminarAtividade(p);
      else if (!p.atividade && p.sentadoEm && agora > (p.proxima ?? 0)) { p.proxima = agora + 10000 + Math.random() * 25000; if (Math.random() < 0.55) escolherAtividade(p); }
    }
    // o gato passeia pela copa
    if (!reduzido) { if (!gato.alvo && agora > gato.espera) gato.alvo = [23 * T + 8 + Math.random() * 120, 17 * T + Math.random() * 40];
      if (gato.alvo) { const [ax, ay] = gato.alvo, dx = ax - gato.x, dy = ay - gato.y, d = Math.hypot(dx, dy);
        if (d < 1) { gato.alvo = null; gato.espera = agora + 6000 + Math.random() * 10000; } else { gato.x += dx / d * 0.4; gato.y += dy / d * 0.4; } } }
  }

  // aplica o estado real vindo do escritório
  function reunir(extra) {
    const antes = reuniao.pedido, agora = extra?.esperando_ok?.[0] ?? null;
    if (antes && !agora) reuniao.okAte = performance.now() + 5000;
    reuniao.pedido = agora;
    if (agora) {
      for (const p of [...pers.values()].filter((q) => q.estado === "livre" && !q.naReuniao)) {
        const usadas = new Set([...pers.values()].map((q) => q.naReuniao).filter(Boolean)); const c = CADEIRAS_R.find((c) => !usadas.has(c)); if (!c) break;
        if (p.atividade) { const a = p.atividade; p.atividade = null; if (a.fx) fx[a.fx] = Math.max(0, (fx[a.fx] || 1) - 1); }
        p.naReuniao = c; irPara(p, c.x, c.y, () => { p.sentadoEm = { reuniao: true, lado: c.lado }; });
      }
    } else for (const p of pers.values()) if (p.naReuniao) { p.naReuniao = null; if (p.estado === "livre") setTimeout(() => voltarParaCasa(p), 1500 + Math.random() * 3000); }
  }
  function sincronizar(funcionarios, extra) {
    if (!ceoFolha && img.r_body_flat) { ceoFolha = montarFixo([["r_body_flat"], ["r_eyes_whites"], ["r_eyes_iris.both", "#3a2a1a"], ["r_shoes_boots", "#2a2020"], ["r_pants_jeans", "#24262e"], ["r_top_turtleneck", "#d97757"], ["r_jacket_blazer", "#2a2d3a"], ["r_hair_slicked_back", "#e8e0d0"], ["r_shades_glasses", "#202028"]]);
      donoFolha = montarFixo([["r_body_flat"], ["r_eyes_whites"], ["r_eyes_iris.both", "#2a1a10"], ["r_shoes_sneakers", "#e8e0d0"], ["r_pants_jeans", "#1a1a1a"], ["r_top_tshirt", "#0a0a0a"], ["r_jacket_bomber", "#d49a00"], ["r_beard_stubble", "#1a1410"], ["r_hair_short", "#1a1410"], ["r_hat_flap_cap", "#0a0a0a"]]); }
    // casa de cada um: mesas na ordem
    funcionarios.forEach((f, i) => {
      let p = pers.get(f.id);
      const mesa = MESAS[i % MESAS.length];
      if (!p) { p = { id: f.id, x: mesa.x + 24, y: mesa.y + 6, fase: Math.random() * 6, folha: montar(f.id, f.provedor), mesa, estado: null, proxima: performance.now() + Math.random() * 15000 }; pers.set(f.id, p); p.sentadoEm = mesa; }
      p.mesa = mesa; mesa.dono = f.id;
      p.dados = f; p.cota = f.uso?.fracao ?? null; p.tarefa = f.tarefa_atual;
      const novo = f.status === "trabalhando" ? "trabalhando" : f.status === "pausado" ? "pausado" : "livre";
      const mudou = novo !== p.estado || (novo === "trabalhando" && p.cargo !== f.cargo_atual);
      p.estado = novo; p.cargo = f.cargo_atual;
      if (!mudou) return;
      if (p.atividade) { const a = p.atividade; p.atividade = null; if (a.fx) fx[a.fx] = Math.max(0, (fx[a.fx] || 1) - 1); }
      if (novo === "trabalhando") {
        const s = SALA_DO_CARGO[f.cargo_atual], b = s && BANCADAS[s.id];
        if (b) { const usados = [...pers.values()].filter((q) => q !== p && q.lugarBancada && q.sala === s.id).map((q) => q.lugarBancada);
          const lugar = b.lugares.find((l) => !usados.includes(l)) ?? b.lugares[0]; p.lugarBancada = lugar; p.sala = s.id;
          irPara(p, lugar.x, lugar.y, () => { p.sentadoEm = { bancada: true }; }); }
        else voltarParaCasa(p);
      } else if (novo === "pausado") {
        p.lugarBancada = null; const i = [...pers.keys()].indexOf(f.id);
        const spots = [[27, 17], [28, 17], [29, 17], [26, 19], [24, 17], [30, 19]]; const [c, l] = spots[i % spots.length];
        irPara(p, c * T + 8, l * T + 10, () => { p.noLugar = true; p.olhar = "baixo"; });
      } else { p.lugarBancada = null; voltarParaCasa(p); }
    });
    for (const id of [...pers.keys()]) if (!funcionarios.some((f) => f.id === id)) pers.delete(id);
    for (const p of pers.values()) if (p.naReuniao && p.estado !== "livre") p.naReuniao = null;
    reunir(extra);
  }

  // ---------- luz ----------
  function iluminar(t) {
    lctx.globalCompositeOperation = "source-over"; lctx.clearRect(0, 0, W, H);
    lctx.fillStyle = "rgba(6,8,22,0.44)"; lctx.fillRect(0, 0, W, H);
    lctx.globalCompositeOperation = "destination-out";
    const furo = (x, y, r, a) => { const g = lctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, `rgba(0,0,0,${a})`); g.addColorStop(1, "rgba(0,0,0,0)"); lctx.fillStyle = g; lctx.fillRect(x - r, y - r, 2 * r, 2 * r); };
    for (const x of [49, 113, 209, 305, 401, 465]) furo(x, 24, 22, 0.5);
    furo(31 * T - 0, 15 * T, 30, 0.55); furo(23 * T + 8, 14 * T, 26, fx.fliperama ? 0.85 : 0.45); furo(25 * T + 6, 16 * T, 28, fx.tv ? 0.8 : 0.2); furo(19 * T + 14, 4 * T, 18, 0.4); furo(256, 20 * T, reuniao.pedido ? 90 : 40, reuniao.pedido ? 0.9 : 0.4); furo(MESA_R.x, MESA_R.y, 70, 0.5);
    for (const p of pers.values()) {
      if (p.estado === "trabalhando" && p.sentadoEm) furo(p.x, p.y - 8, 36 + (reduzido ? 0 : Math.sin(t / 300 + p.fase) * 2), 0.95);
      else if (p.sentadoEm) furo(p.x, p.y - 4, 18, 0.6);
      else if (p.atividade && p.noLugar) furo(p.x, p.y - 10, 18, 0.5);
    }
    ctx.drawImage(luz, 0, 0);
    ctx.globalCompositeOperation = "lighter";
    for (const p of pers.values()) if (p.estado === "trabalhando" && p.sentadoEm) { const g = ctx.createRadialGradient(p.x, p.y - 14, 0, p.x, p.y - 14, 30); g.addColorStop(0, "rgba(242,163,58,.16)"); g.addColorStop(1, "rgba(242,163,58,0)"); ctx.fillStyle = g; ctx.fillRect(p.x - 30, p.y - 44, 60, 60); }
    ctx.globalCompositeOperation = "source-over";
  }

  // ---------- laço ----------
  let antes = performance.now();
  function quadro(t) {
    const dt = Math.min(0.1, (t - antes) / 1000); antes = t;
    for (const p of pers.values()) mover(p, dt);
    atualizarRotinas(t);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(fundo, 0, 0);
    const lista = objetos(t);
    for (const p of pers.values()) lista.push({ base: p.y + (p.sentadoEm && !p.sentadoEm.bancada ? 0 : 2), fn: () => desenharPersonagem(p, t) });
    lista.sort((a, b) => a.base - b.base).forEach((o) => o.fn());
    iluminar(t);
    requestAnimationFrame(quadro);
  }

  window.Mundo = {
    W, H,
    async iniciar(canvas) { tela = canvas; ctx = canvas.getContext("2d"); luz = document.createElement("canvas"); luz.width = W; luz.height = H; lctx = luz.getContext("2d");
      await carregarTudo(); construirFundo(); requestAnimationFrame(quadro); },
    ajustar(largura) { escala = Math.max(1, Math.floor((largura * devicePixelRatio) / W)); tela.width = W * escala; tela.height = H * escala; ctx.setTransform(escala, 0, 0, escala, 0, 0); ctx.imageSmoothingEnabled = false; },
    sincronizar, _pers: pers,
    telaoEm(x, y) { return x >= 156 && x <= 356 && y >= 20 * T && y <= 20 * T + 60; },
    definirGDD(paginas, nome) { gdd.paginas = paginas; gdd.nome = nome; },
    // teste: avança o mundo N segundos sem desenhar (útil com a aba oculta)
    _simular(seg) { let t = performance.now(); for (let i = 0; i < seg * 20; i++) { t += 50; for (const p of pers.values()) mover(p, 0.05); atualizarRotinas(t); } },
    // personagem sob o ponto (coordenadas do mundo) + o que está fazendo agora
    pegar(x, y) { const p = [...pers.values()].reverse().find((q) => q.caixa && x >= q.caixa.x - 2 && x <= q.caixa.x + q.caixa.w + 2 && y >= q.caixa.y && y <= q.caixa.y + q.caixa.h);
      return p ? { dados: p.dados, atividade: p.estado === "livre" ? p.atividade?.rotulo ?? null : null } : null; },
  };
})();
