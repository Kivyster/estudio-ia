// Motor do estúdio — base fixa de todo jogo. Não edite este arquivo dentro de um projeto:
// o jogo fica em js/jogo.js e usa a API global `Motor`. Funciona abrindo o index.html (file://) ou servido por HTTP.
(function () {
  "use strict";
  const M = {};
  window.Motor = M;

  // ---------- erros visíveis (nunca tela preta muda) ----------
  const erros = [];
  window.addEventListener("error", (e) => { erros.push(String(e.message || e)); console.error(e.error || e.message); });
  window.addEventListener("unhandledrejection", (e) => { erros.push(String(e.reason)); });

  // ---------- configuração e canvas ----------
  M.L = 320; M.A = 180; M.escala = 3; M.t = 0; M.dt = 0;
  let canvas, ctx, cenas = {}, cenaAtual = null, nomeCena = "", proxima = null, pausado = false, fade = 0, cenaInicial = "", menuPausa = null;
  M.pausaAutomatica = true;
  M.config = window.CONFIG_JOGO || {};

  M.iniciar = function (op) {
    op = op || {};
    M.L = op.largura || 320; M.A = op.altura || 180;
    canvas = document.getElementById("tela") || document.body.appendChild(document.createElement("canvas"));
    canvas.width = M.L; canvas.height = M.A;
    canvas.style.imageRendering = "pixelated";
    ctx = canvas.getContext("2d"); ctx.imageSmoothingEnabled = false; M.ctx = ctx;
    const ajustar = () => {
      M.escala = Math.max(1, Math.floor(Math.min(innerWidth / M.L, innerHeight / M.A)));
      canvas.style.width = M.L * M.escala + "px"; canvas.style.height = M.A * M.escala + "px";
    };
    addEventListener("resize", ajustar); ajustar();
    // config.json opcional (números do game designer); o jogo começa sem esperar
    carregarJSON("assets/config.json").then((c) => { if (c) Object.assign(M.config, c); });
    carregarJSON("assets/estilo.json").then((e) => { if (e && e.paleta) { M.estilo = e; aplicarEstilo(e); } });
    carregarJSON("assets/dialogos.json").then((d) => { if (d) { Object.assign(M.dialogos, d.dialogos || {}); Object.assign(M.textos, d.textos || {}); } });
    cenaInicial = op.cena || Object.keys(cenas)[0];
    menuPausa = M.criarMenu(["Continuar", "Recomeçar", "Título"]);
    M.ir(cenaInicial);
    let ant = performance.now(), acum = 0; const PASSO = 1 / 60;
    function quadro(agora) {
      acum += Math.min(0.25, (agora - ant) / 1000); ant = agora;
      while (acum >= PASSO) { passo(PASSO); acum -= PASSO; }
      desenhar();
      requestAnimationFrame(quadro);
    }
    requestAnimationFrame(quadro);
  };

  // ---------- cenas ----------
  // Motor.cena("jogo", { entrar(dados){}, atualizar(dt){}, desenhar(ctx){}, sair(){} })
  M.cena = function (nome, def) { cenas[nome] = def; return def; };
  M.ir = function (nome, dados) { proxima = { nome, dados }; };
  M.cenaAtual = () => nomeCena;
  M._diag = { entradas: {}, jogador: null, mapa: null };

  function passo(dt) {
    M.dt = dt; M.t += dt;
    if (proxima) {
      if (cenaAtual && cenaAtual.sair) cenaAtual.sair();
      const c = cenas[proxima.nome];
      if (!c) { erros.push("cena inexistente: " + proxima.nome); proxima = null; }
      else { cenaAtual = c; nomeCena = proxima.nome; const d = proxima.dados; proxima = null; M.camera.x = M.camera.y = 0; pausado = false; fade = 1; M._diag.entradas[nomeCena] = (M._diag.entradas[nomeCena] || 0) + 1; if (c.entrar) c.entrar(d); }
    }
    if (fade > 0) fade = Math.max(0, fade - dt * 4);
    // pausa automática (Enter/Esc) em toda cena que não seja a primeira (título), fora de diálogo
    if (M.pausaAutomatica && nomeCena !== cenaInicial && !dlg && M.apertou("pausa") && !pausado) { pausado = true; menuPausa.sel = 0; for (const k in apertadas) apertadas[k] = false; return; }
    if (pausado) {
      const i = menuPausa.atualizar();
      if (i === 0) pausado = false; else if (i === 1) M.ir(nomeCena); else if (i === 2) M.ir(cenaInicial);
      for (const k in apertadas) apertadas[k] = false; return;
    }
    try { if (cenaAtual && cenaAtual.atualizar) cenaAtual.atualizar(dt); } catch (e) { erros.push(e.message); console.error(e); }
    atualizarParticulas(dt);
    if (tremor > 0) tremor = Math.max(0, tremor - dt * 30);
    dialogoAtualizar();
    for (const k in apertadas) apertadas[k] = false;
  }

  function desenhar() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = M.config.cor_fundo || "#1a1c2c"; ctx.fillRect(0, 0, M.L, M.A);
    const tx = tremor ? (Math.random() - 0.5) * tremor : 0, ty = tremor ? (Math.random() - 0.5) * tremor : 0;
    ctx.setTransform(1, 0, 0, 1, Math.round(tx), Math.round(ty));
    try { if (cenaAtual && cenaAtual.desenhar) cenaAtual.desenhar(ctx); } catch (e) { erros.push(e.message); console.error(e); }
    desenharParticulas();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    dialogoDesenhar();
    if (pausado) { ctx.fillStyle = "rgba(0,0,0,.55)"; ctx.fillRect(0, 0, M.L, M.A); M.texto("PAUSA", M.L / 2, M.A * 0.3, { tam: 16, alinhar: "center", cor: M.ui.destaque }); menuPausa.desenhar(); }
    if (fade > 0) { ctx.fillStyle = `rgba(0,0,0,${fade})`; ctx.fillRect(0, 0, M.L, M.A); }
    if (!cenaAtual) M.texto("Nenhuma cena registrada (Motor.cena)", M.L / 2, M.A / 2, { alinhar: "center", cor: "#ffcd75" });
    if (erros.length) {
      ctx.fillStyle = "rgba(120,0,0,.85)"; ctx.fillRect(0, M.A - 22, M.L, 22);
      M.texto("ERRO: " + erros[erros.length - 1].slice(0, 70), 3, M.A - 18, { cor: "#fff", tam: 7 });
    }
  }

  // ---------- entrada ----------
  // nomes: esquerda, direita, cima, baixo, acao (Espaço/Z/J), acao2 (X/K), pausa (Enter/Esc), ou o código da tecla ("KeyR")
  const MAPA = {
    ArrowLeft: "esquerda", KeyA: "esquerda", ArrowRight: "direita", KeyD: "direita", ArrowUp: "cima", KeyW: "cima", ArrowDown: "baixo", KeyS: "baixo",
    Space: "acao", KeyZ: "acao", KeyJ: "acao", KeyX: "acao2", KeyK: "acao2", Enter: "pausa", Escape: "pausa",
  };
  const seguradas = {}, apertadas = {};
  function marcar(cod, v) {
    for (const n of [cod, MAPA[cod]]) if (n) { if (v && !seguradas[n]) apertadas[n] = true; seguradas[n] = v; }
  }
  addEventListener("keydown", (e) => { if (MAPA[e.code]) e.preventDefault(); if (!e.repeat) marcar(e.code, true); destravarAudio(); });
  addEventListener("keyup", (e) => marcar(e.code, false));
  addEventListener("pointerdown", () => { apertadas.acao = true; destravarAudio(); });
  M.tecla = (n) => !!seguradas[n];        // segurando
  M.apertou = (n) => !!apertadas[n];      // apertou neste quadro
  M.eixo = () => ({ x: (M.tecla("direita") ? 1 : 0) - (M.tecla("esquerda") ? 1 : 0), y: (M.tecla("baixo") ? 1 : 0) - (M.tecla("cima") ? 1 : 0) });

  // ---------- carregamento com plano B ----------
  function carregarJSON(url) {
    return fetch(url).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  }
  M.json = carregarJSON;
  const imgs = {};
  // Motor.imagem("fundo.png") → objeto Image (ou null enquanto não carregou / se faltar)
  M.imagem = function (nome) {
    if (!(nome in imgs)) {
      imgs[nome] = null; const i = new Image();
      i.onload = () => (imgs[nome] = i); i.onerror = () => console.warn("imagem faltando:", nome);
      i.src = "assets/" + nome;
    }
    return imgs[nome];
  };
  // desenha imagem; se faltar, desenha retângulo da cor reserva
  M.desenharImagem = function (nome, x, y, w, h, corReserva) {
    const i = M.imagem(nome);
    if (i) ctx.drawImage(i, Math.round(x), Math.round(y), w || i.width, h || i.height);
    else if (corReserva) { ctx.fillStyle = corReserva; ctx.fillRect(Math.round(x), Math.round(y), w || 16, h || 16); }
  };

  // ---------- sprites animados (formato do artista: <nome>_sheet.png + <nome>.json) ----------
  // const heroi = Motor.sprite("heroi", { cor: "#3b5dc9", w: 16, h: 24 }); heroi.tocar("andar"); heroi.desenhar(x, y, viradoEsquerda)
  M.sprite = function (nome, reserva) {
    reserva = reserva || {};
    const s = { nome, meta: null, anim: null, quadro: 0, tempo: 0, fps: 8, w: reserva.w || 16, h: reserva.h || 16 };
    // nome null = só a forma reserva (sem buscar arquivo: placeholder de arte pendente)
    if (nome) {
      carregarJSON("assets/" + nome + ".json").then((m) => {
        if (m && m.animacoes) { s.meta = m; s.w = s.h = m.tamanho; if (!s.anim) s.anim = m.animacoes[0].tipo; }
      });
      M.imagem(nome + "_sheet.png");
    }
    s.tocar = function (anim, fps) { if (s.anim !== anim) { s.anim = anim; s.quadro = 0; s.tempo = 0; } if (fps) s.fps = fps; return s; };
    s.atualizar = function (dt) {
      s.tempo += dt; const a = s.info();
      if (a && s.tempo >= 1 / s.fps) { s.tempo = 0; s.quadro = (s.quadro + 1) % a.quadros; }
    };
    s.info = () => (s.meta ? s.meta.animacoes.find((a) => a.tipo === s.anim) || s.meta.animacoes[0] : null);
    s.terminou = () => { const a = s.info(); return !a || s.quadro === a.quadros - 1; };
    // (x, y) = canto superior esquerdo; virado = espelha horizontalmente
    s.desenhar = function (x, y, virado) {
      const img = nome ? M.imagem(nome + "_sheet.png") : null, a = s.info();
      x = Math.round(x - M.camera.x); y = Math.round(y - M.camera.y);
      if (!img || !a) { ctx.fillStyle = reserva.cor || "#ef7d57"; ctx.fillRect(x, y, s.w, s.h); return; }
      const N = s.meta.tamanho;
      ctx.save();
      if (virado) { ctx.translate(x + N, y); ctx.scale(-1, 1); ctx.drawImage(img, s.quadro * N, a.linha * N, N, N, 0, 0, N, N); }
      else ctx.drawImage(img, s.quadro * N, a.linha * N, N, N, x, y, N, N);
      ctx.restore();
    };
    return s;
  };

  // ---------- som ----------
  let actx = null;
  function destravarAudio() { if (!actx) try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} if (actx && actx.state === "suspended") actx.resume(); }
  const sons = {};
  // Motor.som("pulo") toca assets/pulo.wav; se faltar, toca um bipe sintetizado (ou nada)
  M.som = function (nome, volume) {
    if (!(nome in sons)) { const a = new Audio("assets/" + nome + (/\.\w+$/.test(nome) ? "" : ".wav")); a.onerror = () => (sons[nome] = "faltando"); sons[nome] = a; }
    const a = sons[nome];
    if (a === "faltando") return M.bipe(440, 0.06, volume);
    try { const c = a.cloneNode(); c.volume = volume == null ? 0.6 : volume; c.play().catch(() => {}); } catch (e) {}
  };
  M.bipe = function (freq, dur, volume) {
    destravarAudio(); if (!actx) return;
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = "square"; o.frequency.value = freq || 440; g.gain.value = (volume == null ? 0.3 : volume) * 0.3;
    g.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + (dur || 0.08));
    o.connect(g).connect(actx.destination); o.start(); o.stop(actx.currentTime + (dur || 0.08));
  };
  let musica = null;
  M.musica = function (nome, volume) {
    if (musica) musica.pause();
    musica = new Audio("assets/" + nome + (/\.\w+$/.test(nome) ? "" : ".wav")); musica.loop = true; musica.volume = volume == null ? 0.4 : volume;
    musica.onerror = () => {}; const tocar = () => musica.play().catch(() => {}); tocar(); addEventListener("keydown", tocar, { once: true });
  };

  // ---------- câmera ----------
  M.camera = { x: 0, y: 0 };
  // segue o alvo suavemente, presa aos limites do mapa (se houver)
  M.seguir = function (alvo, mapa, suave) {
    const k = suave == null ? 0.15 : suave;
    let x = alvo.x + (alvo.w || 0) / 2 - M.L / 2, y = alvo.y + (alvo.h || 0) / 2 - M.A / 2;
    if (mapa) { x = Math.max(0, Math.min(x, mapa.largura - M.L)); y = Math.max(0, Math.min(y, mapa.altura - M.A)); }
    M.camera.x += (x - M.camera.x) * k; M.camera.y += (y - M.camera.y) * k;
  };

  // ---------- mapa de tiles (formato do level designer: <nome>.tmj) ----------
  // const fase = Motor.mapa("fase_1"); fase.solido(px, py); fase.objetos("moeda") → lista de {x, y}
  const SOLIDOS = /parede|ch[aã]o|piso|muro|pedra|rocha|plataforma|bloco|tijolo|terra|wall|ground|solid/i;
  M.mapa = function (nome, reserva) {
    const m = { pronto: false, T: 16, w: 0, h: 0, largura: M.L, altura: M.A, dados: [], nomes: {}, tipos: {}, cores: {}, tileset: "tiles.png", autotile: false, objetos: [] };
    const montar = (tmj) => {
      const camada = (tmj.layers || []).find((l) => l.type === "tilelayer");
      if (!camada) return;
      m.T = tmj.tilewidth || 16; m.w = camada.width; m.h = camada.height; m.dados = camada.data;
      m.largura = m.w * m.T; m.altura = m.h * m.T;
      (tmj.properties || []).forEach((p) => {
        const nm = String(p.name);
        if (nm.startsWith("tile_")) m.nomes[Number(nm.slice(5))] = String(p.value).split("=").slice(1).join("=").trim();
        else if (nm.startsWith("tipo_")) m.tipos[Number(nm.slice(5))] = String(p.value);
        else if (nm === "autotile") m.autotile = !!p.value;
        else if (nm === "visao") m.visao = String(p.value);
      });
      if (tmj.tilesets && tmj.tilesets[0] && tmj.tilesets[0].image) m.tileset = tmj.tilesets[0].image;
      m.objetos = [].concat(...(tmj.layers || []).filter((l) => l.type === "objectgroup").map((l) => l.objects || []));
      m.camadasObjetos = (tmj.layers || []).filter((l) => l.type === "objectgroup");
      m.pronto = true;
    };
    // nome null + reserva = mapa direto do texto do level designer (sem buscar .tmj)
    if (nome) carregarJSON("assets/" + nome + ".tmj").then((t) => { if (t) montar(t); else if (reserva) montarDeTexto(reserva); });
    else if (reserva) setTimeout(() => montarDeTexto(reserva), 0);
    // reserva: mapa em texto (linhas + legenda), usado se o .tmj não existir
    function montarDeTexto(r) {
      const chaves = Object.keys(r.legenda);
      montar({ tilewidth: 16, layers: [{ type: "tilelayer", width: r.linhas[0].length, height: r.linhas.length, data: r.linhas.join("").split("").map((c) => chaves.indexOf(c) + 1) }],
        properties: chaves.map((c, i) => ({ name: "tile_" + (i + 1), value: c + " = " + r.legenda[c] })) });
    }
    m.gid = (tx, ty) => (tx < 0 || ty < 0 || tx >= m.w || ty >= m.h ? 0 : m.dados[ty * m.w + tx]);
    m.nome = (tx, ty) => m.nomes[m.gid(tx, ty)] || "";
    // tipo do tile: solido, plataforma, perigo, coletavel, inicio, saida, inimigo, decoracao, agua, escada, vazio
    m.tipo = (tx, ty) => { const g = m.gid(tx, ty); if (!g) return "vazio"; if (m.tipos[g]) return m.tipos[g]; const n = m.nomes[g] || ""; return SOLIDOS.test(n) ? "solido" : /espinho|lava|perigo|spike/i.test(n) ? "perigo" : "vazio"; };
    m.tipoEm = (px, py) => m.tipo(Math.floor(px / m.T), Math.floor(py / m.T));
    // sólido sempre; rampa só dentro do triângulo; plataforma fina só quando pedida (o mover decide: só segura quem vem de cima)
    m.solido = (px, py, comPlataforma) => {
      if (!m.pronto) return false; const tx = Math.floor(px / m.T), ty = Math.floor(py / m.T);
      if (tx < 0 || tx >= m.w || ty >= m.h) return true; if (ty < 0) return false;
      const t = m.tipo(tx, ty), lx = px - tx * m.T, ly = py - ty * m.T;
      if (t === "solido") return true;
      if (t === "rampa_d") return ly >= m.T - 1 - lx;
      if (t === "rampa_e") return ly >= lx;
      if (t === "plataforma") return comPlataforma === true && ly < 4;
      return false;
    };
    // posições (em pixels) de todos os tiles cujo nome contém a palavra
    m.achar = (palavra) => { const out = [], re = new RegExp(palavra, "i"); for (let i = 0; i < m.dados.length; i++) if (re.test(m.nomes[m.dados[i]] || "") || m.tipos[m.dados[i]] === palavra) out.push({ x: (i % m.w) * m.T, y: Math.floor(i / m.w) * m.T, tx: i % m.w, ty: Math.floor(i / m.w) }); return out; };
    // tira do mapa os tiles de um tipo/nome e devolve as posições (pra virar entidade: inimigo, moeda, item…)
    m.extrair = (palavra) => { const lista = m.achar(palavra); for (const p of lista) m.dados[p.ty * m.w + p.tx] = 0; return lista; };
    m.trocar = (tx, ty, palavra) => { const g = Object.keys(m.nomes).find((k) => new RegExp(palavra, "i").test(m.nomes[k])); m.dados[ty * m.w + tx] = g ? Number(g) : 0; };
    // desenha só o que está na tela; usa assets/tiles.png (uma linha de tiles na ordem da legenda) ou cores reserva
    m.desenhar = function () {
      if (!m.pronto) return;
      const img = M.imagem(m.tileset), T = m.T;
      const x0 = Math.max(0, Math.floor(M.camera.x / T)), y0 = Math.max(0, Math.floor(M.camera.y / T));
      const x1 = Math.min(m.w, x0 + Math.ceil(M.L / T) + 1), y1 = Math.min(m.h, y0 + Math.ceil(M.A / T) + 1);
      for (let ty = y0; ty < y1; ty++) for (let tx = x0; tx < x1; tx++) {
        const g = m.gid(tx, ty); if (!g) continue;
        const nomeT = m.nomes[g] || "", x = Math.round(tx * T - M.camera.x), y = Math.round(ty * T - M.camera.y);
        const tp = m.tipos[g];
        if (tp === "vazio" || tp === "inicio" || (!tp && /vazio|ar\b|c[eé]u|nada|empty/i.test(nomeT))) continue;
        let linha = 0;
        if (m.autotile) { // variação pelos vizinhos (cima 1, direita 2, baixo 4, esquerda 8)
          const igual = (X, Y) => { if (X < 0 || X >= m.w || Y >= m.h) return tp === "solido"; if (Y < 0) return false; return tp === "solido" ? m.tipos[m.gid(X, Y)] === "solido" : m.gid(X, Y) === g; };
          linha = (igual(tx, ty - 1) ? 1 : 0) | (igual(tx + 1, ty) ? 2 : 0) | (igual(tx, ty + 1) ? 4 : 0) | (igual(tx - 1, ty) ? 8 : 0);
        }
        if (img) ctx.drawImage(img, (g - 1) * T, linha * T, T, T, x, y, T, T);
        else { ctx.fillStyle = corDoTile(nomeT); ctx.fillRect(x, y, T, T); ctx.fillStyle = "rgba(0,0,0,.18)"; ctx.fillRect(x, y + T - 2, T, 2); }
      }
    };
    return m;
  };
  function corDoTile(n) {
    const t = [[/parede|muro|wall|pedra|rocha/i, "#566c86"], [/ch[aã]o|piso|floor|grama|terra/i, "#38b764"], [/[aá]gua|water/i, "#41a6f6"], [/lava|fogo|espinho|spike/i, "#b13e53"],
      [/in[ií]cio|start|spawn/i, "#a7f070"], [/sa[ií]da|exit|porta|goal/i, "#ffcd75"], [/inimigo|enemy/i, "#5d275d"], [/moeda|coin|item|chave/i, "#ffcd75"], [/plataforma|ponte|madeira/i, "#ef7d57"]];
    for (const [re, c] of t) if (re.test(n)) return c;
    return "#94b0c2";
  }

  // ---------- física simples ----------
  // corpo = { x, y, w, h, vx, vy, noChao }. Move com colisão contra o mapa (eixo por eixo).
  // move com colisão eixo por eixo. Plataforma fina: só segura quem vem de cima (Baixo + pulo atravessa).
  // Rampa: sobe degraus de até meio tile andando e gruda no chão ao descer.
  M.mover = function (c, mapa, dt) {
    const estavaNoChao = c.noChao; c.noChao = false; c.bateu = { x: 0, y: 0 };
    if (c._descer > 0) c._descer -= dt;
    const T = mapa ? mapa.T : 16;
    const pe = (x, y, plat) => mapa && mapa.solido(x, y, plat);
    const corpo = (x, y) => pe(x, y) || pe(x + c.w - 1, y) || pe(x, y + c.h - 1) || pe(x + c.w - 1, y + c.h - 1) || pe(x + c.w / 2, y) || pe(x + c.w / 2, y + c.h - 1) || (c.h > 20 && (pe(x, y + c.h / 2) || pe(x + c.w - 1, y + c.h / 2)));
    // pé tocando plataforma fina: só conta se, antes do passo, o pé estava no topo do tile (vindo de cima)
    const plataformaSob = (x, yNovo, yAnt) => {
      if (c._descer > 0) return false;
      const fundoAnt = yAnt + c.h - 1, fundo = yNovo + c.h - 1, topo = Math.floor(fundo / T) * T;
      if (fundoAnt > topo + 1) return false;
      return pe(x, fundo, true) || pe(x + c.w - 1, fundo, true) || pe(x + c.w / 2, fundo, true);
    };
    let dx = c.vx * dt, dy = c.vy * dt;
    const passos = Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 4) || 1;
    dx /= passos; dy /= passos;
    const degrau = Math.floor(T / 2);
    for (let i = 0; i < passos; i++) {
      if (dx) {
        if (!corpo(c.x + dx, c.y)) c.x += dx;
        else {
          let subiu = false;
          if (estavaNoChao || c.noChao) for (let k = 1; k <= degrau; k++) if (!corpo(c.x + dx, c.y - k)) { c.x += dx; c.y -= k; subiu = true; break; }
          if (!subiu) { while (!corpo(c.x + Math.sign(dx), c.y) && Math.abs(dx) >= 1) c.x += Math.sign(dx); c.bateu.x = Math.sign(dx); c.vx = 0; dx = 0; }
        }
      }
      if (dy < 0) {
        if (!corpo(c.x, c.y + dy)) c.y += dy; else { while (!corpo(c.x, c.y - 1) && Math.abs(dy) >= 1) c.y -= 1; c.bateu.y = -1; c.vy = 0; dy = 0; }
      } else if (dy > 0) {
        const yAnt = c.y;
        if (!corpo(c.x, c.y + dy) && !plataformaSob(c.x, c.y + dy, yAnt)) c.y += dy;
        else { while (!corpo(c.x, c.y + 1) && !plataformaSob(c.x, c.y + 1, c.y) && Math.abs(dy) >= 1) c.y += 1; c.noChao = true; c.bateu.y = 1; c.vy = 0; dy = 0; }
      }
    }
    if (!c.noChao && c.vy >= 0 && (corpo(c.x, c.y + 1) || plataformaSob(c.x, c.y + 1, c.y))) c.noChao = true;
    // descendo rampa: gruda no chão em vez de sair saltitando
    if (!c.noChao && estavaNoChao && c.vy >= 0) for (let k = 1; k <= degrau; k++) if (corpo(c.x, c.y + k) || plataformaSob(c.x, c.y + k, c.y + k - 1)) { c.y += k - 1; c.noChao = true; break; }
  };
  // Baixo + pulo em cima de plataforma fina: desce por ela
  M.descerPlataforma = (c) => { c._descer = 0.25; c.noChao = false; };
  // plataforma: gravidade + pulo com "coyote time" e buffer de pulo (sensação boa por padrão)
  M.plataforma = function (c, mapa, dt, op) {
    M._diag.jogador = c; M._diag.mapa = mapa; M._diag.modo = "plataforma";
    op = Object.assign({ velocidade: 90, aceleracao: 900, gravidade: 700, pulo: 240, queda_max: 400 }, M.config.jogador || {}, op || {});
    const ex = M.eixo().x, alvo = ex * op.velocidade;
    c.vx += Math.max(-op.aceleracao * dt, Math.min(op.aceleracao * dt, alvo - c.vx));
    c.vy = Math.min(op.queda_max, c.vy + op.gravidade * dt);
    c._coyote = c.noChao ? 0.1 : Math.max(0, (c._coyote || 0) - dt);
    c._buffer = M.apertou("acao") || M.apertou("cima") ? 0.12 : Math.max(0, (c._buffer || 0) - dt);
    c.pulou = false;
    if (c._buffer > 0 && c.noChao && M.tecla("baixo")) { M.descerPlataforma(c); c._buffer = 0; }
    if (c._buffer > 0 && c._coyote > 0) { c.vy = -op.pulo; c._buffer = 0; c._coyote = 0; c.pulou = true; }
    if (c.vy < 0 && !M.tecla("acao") && !M.tecla("cima")) c.vy += op.gravidade * dt; // pulo curto se soltar
    if (ex) c.virado = ex < 0;
    M.mover(c, mapa, dt);
  };
  // visão de cima: anda nas 4/8 direções
  M.vistaDeCima = function (c, mapa, dt, op) {
    M._diag.jogador = c; M._diag.mapa = mapa; M._diag.modo = "cima";
    op = Object.assign({ velocidade: 80 }, M.config.jogador || {}, op || {});
    const e = M.eixo(), n = Math.hypot(e.x, e.y) || 1;
    c.vx = (e.x / n) * op.velocidade; c.vy = (e.y / n) * op.velocidade;
    if (e.x) c.virado = e.x < 0;
    M.mover(c, mapa, dt);
  };
  M.colide = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  // pisou em cima (pulo na cabeça): vinha caindo e o pé estava na metade de cima do outro
  M.pisouEm = (a, b) => M.colide(a, b) && a.vy > 0 && a.y + a.h - b.y < Math.max(6, b.h / 2);

  // ---------- inimigos prontos ----------
  // const e = Motor.inimigo("patrulha", x, y, {sprite:"slime", cor:"#5d275d", w:14, h:12, velocidade:30, vida:1, dano:1, tipo:"slime"})
  // comportamentos: patrulha (anda e vira na parede/beirada), perseguidor (corre atrás do alvo quando perto),
  // pulador (anda pulando), voador (flutua em onda), atirador (atira no alvo), vigia (vista de cima: ronda e persegue)
  // números de Motor.config.inimigos[tipo] (game designer) entram sozinhos.
  M.inimigo = function (comportamento, x, y, op) {
    op = op || {}; const cfg = (M.config.inimigos || {})[op.tipo || comportamento] || {};
    const e = Object.assign({ comportamento, x, y, w: 14, h: 14, vx: 0, vy: 0, dir: -1, vida: 1, dano: 1, velocidade: 30, alcance: 90, cadencia: 1.6, vivo: true, t: Math.random() * 3, _tiro: 1, piscar: 0, noChao: false }, cfg, op);
    e.spr = M.sprite(op.sprite || null, { cor: op.cor || M.ui.perigo, w: e.w, h: e.h });
    e.y0 = y; return e;
  };
  const projeteis = [];
  M.projeteis = projeteis;
  M.atirar = (x, y, vx, vy, op) => { projeteis.push(Object.assign({ x, y, w: 4, h: 4, vx, vy, vida: 3, cor: M.ui.perigo, dono: "inimigo", dano: 1 }, op || {})); };
  // atualiza inimigos e tiros; devolve o inimigo/tiro que encostou no alvo (ou null). Pisão na cabeça fere o inimigo.
  M.atualizarInimigos = function (lista, mapa, dt, alvo, op) {
    op = op || {}; let acertou = null;
    for (const e of lista) {
      if (!e.vivo) continue; e.t += dt; if (e.piscar > 0) e.piscar -= dt;
      const dx = alvo ? (alvo.x + alvo.w / 2) - (e.x + e.w / 2) : 0, dy = alvo ? (alvo.y + alvo.h / 2) - (e.y + e.h / 2) : 0, perto = Math.hypot(dx, dy) < e.alcance;
      switch (e.comportamento) {
        case "voador":
          e.x += e.dir * e.velocidade * dt; e.y = e.y0 + Math.sin(e.t * 2) * 12;
          if (mapa && mapa.solido(e.x + (e.dir > 0 ? e.w : 0), e.y + e.h / 2)) e.dir *= -1;
          break;
        case "atirador":
          e.dir = dx < 0 ? -1 : 1; e._tiro -= dt;
          if (perto && e._tiro <= 0) { e._tiro = e.cadencia; const n = Math.hypot(dx, dy) || 1; M.atirar(e.x + e.w / 2, e.y + e.h / 2, (dx / n) * 90, (dy / n) * 90); }
          if (mapa && mapa.visao !== "cima") { e.vx = 0; e.vy = Math.min(400, e.vy + 700 * dt); M.mover(e, mapa, dt); }
          break;
        case "vigia": {
          const n = Math.hypot(dx, dy) || 1;
          if (perto) { e.vx = (dx / n) * e.velocidade; e.vy = (dy / n) * e.velocidade; } else { e.vx = e.dir * e.velocidade * 0.5; e.vy = 0; }
          M.mover(e, mapa, dt); if (e.bateu.x) e.dir *= -1; if (e.vx) e.dir = Math.sign(e.vx);
          break;
        }
        default: { // patrulha, perseguidor, pulador (com gravidade)
          if (e.comportamento === "perseguidor" && perto && Math.abs(dy) < 40) e.dir = dx < 0 ? -1 : 1;
          e.vx = e.dir * e.velocidade * (e.comportamento === "perseguidor" && perto ? 1.6 : 1);
          e.vy = Math.min(400, e.vy + 700 * dt);
          if (e.comportamento === "pulador" && e.noChao && (e.t % 1.8) < dt) e.vy = -220;
          const frente = e.x + (e.dir > 0 ? e.w + 1 : -1);
          if (e.noChao && mapa && e.comportamento !== "pulador" && !mapa.solido(frente, e.y + e.h + 2, true)) e.dir *= -1; // vira na beirada
          M.mover(e, mapa, dt); if (e.bateu.x) e.dir *= -1;
        }
      }
      e.virado = e.dir < 0;
      if (e.spr.meta) e.spr.tocar(e.vx || e.comportamento === "voador" ? "andar" : "idle");
      e.spr.atualizar(dt);
      if (alvo && M.colide(alvo, e)) {
        if (op.pisao !== false && M.pisouEm(alvo, e)) { M.ferir(e, 1); alvo.vy = -200; M.particulas(e.x + e.w / 2, e.y, M.ui.destaque, 8); }
        else acertou = acertou || e;
      }
    }
    for (let i = projeteis.length - 1; i >= 0; i--) {
      const p = projeteis[i]; p.x += p.vx * dt; p.y += p.vy * dt; p.vida -= dt;
      if (p.vida <= 0 || (mapa && mapa.solido(p.x, p.y))) { projeteis.splice(i, 1); continue; }
      if (alvo && p.dono === "inimigo" && M.colide(alvo, { x: p.x - p.w / 2, y: p.y - p.h / 2, w: p.w, h: p.h })) { projeteis.splice(i, 1); acertou = acertou || p; }
    }
    return acertou;
  };
  M.ferir = (e, dano) => { e.vida -= dano || 1; e.piscar = 0.2; if (e.vida <= 0) { e.vivo = false; M.particulas(e.x + e.w / 2, e.y + e.h / 2, M.ui.perigo, 14, 90); M.tremer(3); } };
  M.desenharInimigos = function (lista) {
    for (const e of lista) if (e.vivo && !(e.piscar > 0 && Math.floor(M.t * 30) % 2)) e.spr.desenhar(e.x + (e.w - e.spr.w) / 2, e.y + e.h - e.spr.h, e.virado);
    for (const p of projeteis) M.ret(p.x - p.w / 2, p.y - p.h / 2, p.w, p.h, p.cor);
  };
  // dano no jogador com invencibilidade (pisca): Motor.dano(jogador, 1) → false se ainda estava invencível
  M.dano = function (j, n) {
    if ((j._inv || 0) > M.t) return false;
    j.vida = (j.vida == null ? 3 : j.vida) - (n || 1); j._inv = M.t + ((M.config.jogador || {}).invencivel_s || 1);
    M.tremer(5); M.som("dano"); j.vy = -150; return true;
  };
  M.invencivel = (j) => (j._inv || 0) > M.t;


  // ---------- desenho utilitário ----------
  // ---------- fonte bitmap 5x7 (maiúsculas, acentos do português, setas e símbolos) ----------
  const G = {
    A: [14, 17, 17, 31, 17, 17, 17], B: [30, 17, 17, 30, 17, 17, 30], C: [14, 17, 16, 16, 16, 17, 14], D: [30, 17, 17, 17, 17, 17, 30], E: [31, 16, 16, 30, 16, 16, 31],
    F: [31, 16, 16, 30, 16, 16, 16], G: [14, 17, 16, 23, 17, 17, 15], H: [17, 17, 17, 31, 17, 17, 17], I: [14, 4, 4, 4, 4, 4, 14], J: [7, 2, 2, 2, 2, 18, 12],
    K: [17, 18, 20, 24, 20, 18, 17], L: [16, 16, 16, 16, 16, 16, 31], M: [17, 27, 21, 21, 17, 17, 17], N: [17, 17, 25, 21, 19, 17, 17], O: [14, 17, 17, 17, 17, 17, 14],
    P: [30, 17, 17, 30, 16, 16, 16], Q: [14, 17, 17, 17, 21, 18, 13], R: [30, 17, 17, 30, 20, 18, 17], S: [15, 16, 16, 14, 1, 1, 30], T: [31, 4, 4, 4, 4, 4, 4],
    U: [17, 17, 17, 17, 17, 17, 14], V: [17, 17, 17, 17, 17, 10, 4], W: [17, 17, 17, 21, 21, 21, 10], X: [17, 17, 10, 4, 10, 17, 17], Y: [17, 17, 17, 10, 4, 4, 4],
    Z: [31, 1, 2, 4, 8, 16, 31], 0: [14, 17, 19, 21, 25, 17, 14], 1: [4, 12, 4, 4, 4, 4, 14], 2: [14, 17, 1, 2, 4, 8, 31], 3: [31, 2, 4, 2, 1, 17, 14],
    4: [2, 6, 10, 18, 31, 2, 2], 5: [31, 16, 30, 1, 1, 17, 14], 6: [6, 8, 16, 30, 17, 17, 14], 7: [31, 1, 2, 4, 8, 8, 8], 8: [14, 17, 17, 14, 17, 17, 14],
    9: [14, 17, 17, 15, 1, 2, 12], " ": [0, 0, 0, 0, 0, 0, 0], ".": [0, 0, 0, 0, 0, 12, 12], ",": [0, 0, 0, 0, 12, 4, 8], "!": [4, 4, 4, 4, 4, 0, 4],
    "?": [14, 17, 1, 2, 4, 0, 4], ":": [0, 12, 12, 0, 12, 12, 0], ";": [0, 12, 12, 0, 12, 4, 8], "-": [0, 0, 0, 31, 0, 0, 0], "+": [0, 4, 4, 31, 4, 4, 0],
    "/": [1, 1, 2, 4, 8, 16, 16], "(": [2, 4, 8, 8, 8, 4, 2], ")": [8, 4, 2, 2, 2, 4, 8], "'": [4, 4, 8, 0, 0, 0, 0], '"': [10, 10, 0, 0, 0, 0, 0],
    "%": [24, 25, 2, 4, 8, 19, 3], "<": [2, 4, 8, 16, 8, 4, 2], ">": [8, 4, 2, 1, 2, 4, 8], "=": [0, 0, 31, 0, 31, 0, 0], "·": [0, 0, 0, 4, 0, 0, 0],
    "#": [10, 10, 31, 10, 31, 10, 10], "*": [0, 21, 14, 31, 14, 21, 0], "_": [0, 0, 0, 0, 0, 0, 31], "▶": [8, 12, 14, 15, 14, 12, 8], "◀": [2, 6, 14, 30, 14, 6, 2],
    "▼": [0, 31, 14, 4, 0, 0, 0], "▲": [0, 0, 4, 14, 31, 0, 0], "←": [0, 4, 8, 31, 8, 4, 0], "→": [0, 4, 2, 31, 2, 4, 0], "↑": [4, 14, 21, 4, 4, 4, 0],
    "↓": [0, 4, 4, 4, 21, 14, 4], "♥": [0, 10, 31, 31, 14, 4, 0], "★": [4, 4, 31, 14, 14, 27, 17], "×": [0, 17, 10, 4, 10, 17, 0],
  };
  const ACENTO = { "Á": ["A", "agudo"], "À": ["A", "grave"], "Â": ["A", "circ"], "Ã": ["A", "til"], "É": ["E", "agudo"], "Ê": ["E", "circ"], "Í": ["I", "agudo"],
    "Ó": ["O", "agudo"], "Ô": ["O", "circ"], "Õ": ["O", "til"], "Ú": ["U", "agudo"], "Ü": ["U", "trema"], "Ç": ["C", "cedilha"] };
  const MARCAS = { agudo: [[2, -2], [3, -3]], grave: [[1, -3], [2, -2]], circ: [[1, -2], [2, -3], [3, -2]], til: [[0, -2], [1, -3], [2, -2], [3, -3]], trema: [[1, -2], [3, -2]], cedilha: [[2, 7], [1, 8]] };
  const cacheTxt = new Map();
  M.larguraTexto = (s, tam) => String(s).length * 6 * Math.max(1, Math.round((tam || 8) / 8)) - Math.max(1, Math.round((tam || 8) / 8));
  function textoBitmap(s, cor, k, sombra) {
    const chave = s + "|" + cor + "|" + k + "|" + sombra;
    let c = cacheTxt.get(chave); if (c) return c;
    const up = String(s).toUpperCase(), W = Math.max(1, up.length * 6 * k + k), H = 12 * k;
    c = document.createElement("canvas"); c.width = W; c.height = H; const g = c.getContext("2d");
    const pinta = (cx, cy, cr) => { g.fillStyle = cr; g.fillRect(cx * k, cy * k, k, k); };
    const desenha = (dx, dy, cr) => {
      [...up].forEach((ch, i) => {
        const [base, marca] = ACENTO[ch] || [ch, null], gl = G[base] || G["?"], ox = i * 6 + dx;
        for (let r = 0; r < 7; r++) for (let b = 0; b < 5; b++) if (gl[r] & (16 >> b)) pinta(ox + b, r + 3 + dy, cr);
        if (marca) for (const [mx, my] of MARCAS[marca]) pinta(ox + mx, my + 3 + dy, cr);
      });
    };
    if (sombra) desenha(1, 1, sombra);
    desenha(0, 0, cor);
    if (cacheTxt.size > 300) cacheTxt.clear(); cacheTxt.set(chave, c);
    return c;
  }
  // Motor.texto(s, x, y, {tam: 8|16|24, cor, alinhar, sombra}) — y é o topo da letra
  M.texto = function (s, x, y, op) {
    op = op || {}; const k = Math.max(1, Math.round((op.tam || 8) / 8));
    if (op.fonte === "sistema") { ctx.font = `${op.tam || 8}px monospace`; ctx.textBaseline = "top"; ctx.textAlign = op.alinhar || "left"; ctx.fillStyle = op.cor || M.ui.texto; ctx.fillText(s, Math.round(x), Math.round(y)); return; }
    const img = textoBitmap(String(s), op.cor || M.ui.texto, k, op.sombra === false ? null : (op.sombra || M.ui.sombra));
    const w = M.larguraTexto(s, op.tam), dx = op.alinhar === "center" ? -Math.floor(w / 2) : op.alinhar === "right" ? -w : 0;
    ctx.drawImage(img, Math.round(x + dx), Math.round(y - 3 * k));
  };
  M.ret = (x, y, w, h, cor) => { ctx.fillStyle = cor; ctx.fillRect(Math.round(x - M.camera.x), Math.round(y - M.camera.y), w, h); };
  M.retTela = (x, y, w, h, cor) => { ctx.fillStyle = cor; ctx.fillRect(Math.round(x), Math.round(y), w, h); };
  // ---------- interface (tema vem da bíblia de estilo: assets/estilo.json) ----------
  M.ui = { fundo: "#1a1c2c", painel: "#262b44", borda: "#f4f4f4", borda_escura: "#0b0c14", texto: "#f4f4f4", fraco: "#94b0c2", destaque: "#ffcd75", perigo: "#b13e53", vida: "#e04a5a", ok: "#38b764", sombra: "rgba(0,0,0,.55)" };
  function aplicarEstilo(e) {
    const p = (e && e.paleta) || {}, ent = Object.entries(p); if (!ent.length) return;
    const lum = (h) => { const n = parseInt(String(h).slice(1), 16); return ((n >> 16) & 255) * 0.3 + ((n >> 8) & 255) * 0.59 + (n & 255) * 0.11; };
    const porNome = (re) => (ent.find(([k]) => re.test(k)) || [])[1];
    const ord = ent.map(([, v]) => v).sort((a, b) => lum(a) - lum(b));
    M.ui.borda_escura = porNome(/contorno|preto|escuro/) || ord[0];
    M.ui.fundo = ord[0]; M.ui.painel = ord[1] || ord[0];
    M.ui.texto = porNome(/ui_texto|texto|branco/) || ord[ord.length - 1]; M.ui.borda = M.ui.texto;
    M.ui.fraco = ord[Math.floor(ord.length * 0.6)] || M.ui.fraco;
    M.ui.destaque = porNome(/destaque|ouro|moeda|ui_destaque/) || M.ui.destaque;
    M.ui.perigo = porNome(/perigo|vermelho|dano/) || M.ui.perigo; M.ui.vida = porNome(/vida|coracao|vermelho/) || M.ui.perigo;
    M.ui.ok = porNome(/verde|ok|grama/) || M.ui.ok;
    cacheTxt.clear();
  }
  M.estilo = null;
  // painel com moldura de pixel (borda escura por fora, luz em cima/esquerda, sombra embaixo/direita)
  M.painel = function (x, y, w, h, op) {
    op = op || {}; x = Math.round(x); y = Math.round(y);
    M.retTela(x, y, w, h, M.ui.borda_escura);
    M.retTela(x + 1, y + 1, w - 2, h - 2, op.cor || M.ui.painel);
    M.retTela(x + 1, y + 1, w - 2, 1, op.luz || M.ui.fraco); M.retTela(x + 1, y + 1, 1, h - 2, op.luz || M.ui.fraco);
    M.retTela(x + 1, y + h - 2, w - 2, 1, M.ui.fundo); M.retTela(x + w - 2, y + 1, 1, h - 2, M.ui.fundo);
  };
  M.barra = function (x, y, w, h, fracao, cor, fundo) {
    fracao = Math.max(0, Math.min(1, fracao)); x = Math.round(x); y = Math.round(y);
    M.retTela(x - 1, y - 1, w + 2, h + 2, M.ui.borda_escura); M.retTela(x, y, w, h, fundo || M.ui.painel);
    const f = Math.round(w * fracao); M.retTela(x, y, f, h, cor || M.ui.ok);
    if (f > 1 && h > 2) M.retTela(x, y, f, 1, "rgba(255,255,255,.35)");
  };
  // ícones 7x7 desenhados em pixel: coracao, coracao_vazio, moeda, estrela, chave, relogio, caveira
  const ICONES = {
    coracao: [0b0110110, 0b1111111, 0b1111111, 0b1111111, 0b0111110, 0b0011100, 0b0001000], estrela: [0b0001000, 0b0011100, 0b1111111, 0b0111110, 0b0111110, 0b1100011, 0b1000001],
    moeda: [0b0011100, 0b0111110, 0b1101111, 0b1101111, 0b1101111, 0b0111110, 0b0011100], chave: [0b0111000, 0b1000100, 0b1000100, 0b0111000, 0b0010000, 0b0011000, 0b0010000],
    relogio: [0b0111110, 0b1000001, 0b1001001, 0b1001111, 0b1000001, 0b1000001, 0b0111110], caveira: [0b0111110, 0b1111111, 0b1001001, 0b1111111, 0b0110110, 0b0111110, 0b0101010],
  };
  M.icone = function (tipo, x, y, op) {
    op = op || {}; const vazio = /vazio/.test(tipo), nome = tipo.replace("_vazio", ""), bm = ICONES[nome]; if (!bm) return;
    const k = op.escala || 1, cor = op.cor || (nome === "coracao" ? M.ui.vida : nome === "moeda" || nome === "estrela" || nome === "chave" ? M.ui.destaque : M.ui.texto);
    for (let r = 0; r < 7; r++) for (let b = 0; b < 7; b++) if (bm[r] & (64 >> b)) {
      const borda = !(r > 0 && bm[r - 1] & (64 >> b)) || !(r < 6 && bm[r + 1] & (64 >> b)) || !(b > 0 && bm[r] & (64 >> (b - 1))) || !(b < 6 && bm[r] & (64 >> (b + 1)));
      if (vazio && !borda) continue;
      M.retTela(x + b * k, y + r * k, k, k, vazio ? M.ui.fraco : (r <= 1 && b <= 3 && !borda ? "rgba(255,255,255,.55)" : cor));
    }
  };
  // HUD padrão: Motor.hud({vida, vidaMax, pontos, moedas, tempo, chaves})
  M.hud = function (h) {
    let x = 4;
    if (h.vidaMax) { for (let i = 0; i < h.vidaMax; i++) M.icone(i < h.vida ? "coracao" : "coracao_vazio", x + i * 9, 4); x += h.vidaMax * 9 + 6; }
    if (h.moedas != null) { M.icone("moeda", x, 4); M.texto("×" + h.moedas, x + 9, 4, { cor: M.ui.destaque }); x += 9 + M.larguraTexto("×" + h.moedas) + 8; }
    if (h.chaves != null) { M.icone("chave", x, 4); M.texto("×" + h.chaves, x + 9, 4); x += 9 + M.larguraTexto("×" + h.chaves) + 8; }
    if (h.pontos != null) M.texto(String(h.pontos).padStart(6, "0"), M.L - 4, 4, { alinhar: "right" });
    if (h.tempo != null) { const t = Math.max(0, Math.ceil(h.tempo)), s = Math.floor(t / 60) + ":" + String(t % 60).padStart(2, "0");
      M.icone("relogio", M.L / 2 - 20, 4, { cor: t <= 10 && Math.floor(M.t * 4) % 2 ? M.ui.perigo : M.ui.texto }); M.texto(s, M.L / 2 - 10, 4, { cor: t <= 10 ? M.ui.perigo : M.ui.texto }); }
  };
  // menu navegável: const m = Motor.criarMenu(["Jogar", "Créditos"]); no atualizar: const i = m.atualizar(); (−1 ou o índice escolhido)
  M.criarMenu = function (opcoes, op) {
    op = op || {}; const m = { opcoes, sel: 0 };
    m.atualizar = function () {
      if (M.apertou("cima")) { m.sel = (m.sel + opcoes.length - 1) % opcoes.length; M.bipe(660, 0.03, 0.2); }
      if (M.apertou("baixo")) { m.sel = (m.sel + 1) % opcoes.length; M.bipe(660, 0.03, 0.2); }
      if (M.apertou("acao") || M.apertou("pausa")) { M.bipe(990, 0.06, 0.3); return m.sel; }
      return -1;
    };
    m.desenhar = function (x, y) {
      const w = Math.max(...opcoes.map((o) => M.larguraTexto(o))) + 28, h = opcoes.length * 12 + 8;
      x = x == null ? Math.round(M.L / 2 - w / 2) : x; y = y == null ? Math.round(M.A * 0.58) : y;
      if (op.painel !== false) M.painel(x, y, w, h);
      opcoes.forEach((o, i) => { const sel = i === m.sel; if (sel) M.texto("▶", x + 6 + (Math.floor(M.t * 4) % 2), y + 6 + i * 12, { cor: M.ui.destaque }); M.texto(o, x + 16, y + 6 + i * 12, { cor: sel ? M.ui.destaque : M.ui.fraco }); });
    };
    return m;
  };
  // tela de título: Motor.telaTitulo(Motor.textos.titulo || "MEU JOGO", "subtítulo")
  M.telaTitulo = function (titulo, subtitulo) {
    const k = M.larguraTexto(titulo, 24) < M.L - 16 ? 24 : 16, y = Math.round(M.A * 0.28 + Math.sin(M.t * 2) * 2);
    M.texto(titulo, M.L / 2 + 2, y + 2, { tam: k, alinhar: "center", cor: M.ui.borda_escura, sombra: false });
    M.texto(titulo, M.L / 2, y, { tam: k, alinhar: "center", cor: M.ui.destaque });
    if (subtitulo) M.texto(subtitulo, M.L / 2, y + k + 6, { alinhar: "center", cor: M.ui.fraco });
  };
  M.piscar = (s, y, cor) => { if (Math.floor(M.t * 2) % 2) M.texto(s, M.L / 2, y, { alinhar: "center", cor: cor || M.ui.texto }); };
  // fundo em camadas com parallax: Motor.parallax([{img:"ceu.png", fator:0}, {img:"montanhas.png", fator:0.3, cor:"#29366f"}])
  M.parallax = function (camadas) {
    camadas.forEach((c, i) => {
      const img = c.img && M.imagem(c.img);
      if (!img) { if (c.cor) { ctx.fillStyle = c.cor; ctx.fillRect(0, M.A * (0.35 + i * 0.15), M.L, M.A); } return; }
      const w = img.width, ox = -((M.camera.x * (c.fator || 0)) % w);
      for (let x = ox - w; x < M.L; x += w) ctx.drawImage(img, Math.round(x), Math.round((c.y || 0) - M.camera.y * (c.fator || 0) * 0.5));
    });
  };

  // ---------- juice: partículas e tremor ----------
  const parts = []; let tremor = 0;
  M.particulas = function (x, y, cor, n, forca) {
    for (let i = 0; i < (n || 8); i++) { const a = Math.random() * Math.PI * 2, v = (forca || 60) * (0.4 + Math.random()); parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 20, vida: 0.4 + Math.random() * 0.4, cor: cor || "#ffcd75" }); }
  };
  M.tremer = (f) => (tremor = Math.max(tremor, f || 4));
  function atualizarParticulas(dt) { for (let i = parts.length - 1; i >= 0; i--) { const p = parts[i]; p.vy += 300 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vida -= dt; if (p.vida <= 0) parts.splice(i, 1); } }
  function desenharParticulas() { for (const p of parts) { ctx.fillStyle = p.cor; ctx.fillRect(Math.round(p.x - M.camera.x), Math.round(p.y - M.camera.y), 2, 2); } }

  // ---------- diálogo (formato do roteirista) ----------
  // Motor.dialogo([{quem:"ANA", fala:"Oi!"}, ...], aoTerminar). Enquanto aberto, Motor.emDialogo() é true.
  // Motor.conversa("encontro_ana", aoTerminar) toca a cena do assets/dialogos.json (com escolhas que levam a outras cenas).
  // aoTerminar recebe o id da última cena tocada (útil pra saber qual escolha o jogador fez).
  // Motor.textos.titulo, Motor.textos.vitoria… = textos de tela do roteirista.
  let dlg = null;
  M.dialogos = {}; M.textos = {};
  M.dialogo = (falas, fim) => { dlg = { falas: falas || [], i: 0, letras: 0, fim, cena: null, sel: 0 }; };
  M.conversa = (id, fim) => {
    const falas = M.dialogos[id];
    if (!falas) { console.warn("cena de diálogo inexistente:", id); if (fim) fim(id); return; }
    dlg = { falas, i: 0, letras: 0, fim, cena: id, sel: 0 };
  };
  M.emDialogo = () => !!dlg;
  function quebrar(s, larg) {
    const linhas = []; let atual = "";
    for (const p of String(s).split(" ")) { if ((atual + " " + p).trim().length > larg) { linhas.push(atual); atual = p; } else atual = (atual + " " + p).trim(); }
    if (atual) linhas.push(atual); return linhas;
  }
  function dialogoAtualizar() {
    if (!dlg) return; const f = dlg.falas[dlg.i];
    if (!f) { const fim = dlg.fim, cena = dlg.cena; dlg = null; if (fim) fim(cena); return; }
    dlg.letras += M.dt * 40;
    const esc = Array.isArray(f.escolhas) && f.escolhas.length ? f.escolhas : null;
    if (esc && dlg.letras >= f.fala.length) {
      if (M.apertou("cima")) dlg.sel = (dlg.sel + esc.length - 1) % esc.length;
      if (M.apertou("baixo")) dlg.sel = (dlg.sel + 1) % esc.length;
    }
    if (M.apertou("acao") || M.apertou("pausa")) {
      if (dlg.letras < f.fala.length) { dlg.letras = f.fala.length; return; }
      if (esc) { const e = esc[dlg.sel]; if (e && e.vai_para && M.dialogos[e.vai_para]) { const fim = dlg.fim; M.conversa(e.vai_para, fim); return; } }
      dlg.i++; dlg.letras = 0; dlg.sel = 0;
    }
  }
  function dialogoDesenhar() {
    if (!dlg) return; const f = dlg.falas[dlg.i]; if (!f) return;
    const esc = Array.isArray(f.escolhas) && f.escolhas.length && dlg.letras >= f.fala.length ? f.escolhas : null;
    const h = 46 + (esc ? esc.length * 10 : 0), y = M.A - h - 4;
    M.retTela(4, y, M.L - 8, h, "rgba(26,28,44,.92)"); ctx.strokeStyle = "#f4f4f4"; ctx.strokeRect(4.5, y + 0.5, M.L - 9, h - 1);
    if (f.quem) M.texto(f.quem, 10, y + 5, { cor: "#ffcd75" });
    const larg = Math.floor((M.L - 24) / 6);
    quebrar(f.fala.slice(0, Math.floor(dlg.letras)), larg).slice(0, 3).forEach((l, i) => M.texto(l, 10, y + 17 + i * 9, { tam: 7 }));
    if (esc) esc.forEach((e, i) => M.texto((i === dlg.sel ? "▶ " : "  ") + e.texto, 14, y + 46 + i * 10, { tam: 7, cor: i === dlg.sel ? "#ffcd75" : "#94b0c2" }));
    else if (dlg.letras >= f.fala.length && Math.floor(M.t * 3) % 2) M.texto("▼", M.L - 16, y + h - 11, { tam: 7 });
  }

  // ---------- salvar ----------
  M.salvar = (chave, v) => { try { localStorage.setItem("jogo_" + chave, JSON.stringify(v)); } catch (e) {} };
  M.carregar = (chave, padrao) => { try { const v = localStorage.getItem("jogo_" + chave); return v == null ? padrao : JSON.parse(v); } catch (e) { return padrao; } };

  // ---------- utilidades ----------
  M.aleatorio = (a, b) => a + Math.random() * (b - a);
  M.limitar = (v, a, b) => Math.max(a, Math.min(b, v));
  M.aproximar = (v, alvo, passo) => (v < alvo ? Math.min(alvo, v + passo) : Math.max(alvo, v - passo));
})();
