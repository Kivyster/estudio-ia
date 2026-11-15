// Exemplo de referência: plataforma com moedas, espinho, saída, diálogo e tela de título.
const FASE = {
  legenda: { ".": "vazio", "#": "chão", "S": "início", "E": "saída", "^": "espinho", "c": "moeda", "=": "plataforma" },
  linhas: [
    "........................................",
    "........................................",
    "........................................",
    "..................c.c...................",
    ".................=====..........c.c.....",
    "...........c...................=====....",
    "..........===...........................",
    "....................................E...",
    ".S.....c.c......^^.......c....^^...###..",
    "########################################",
    "########################################",
  ],
};

let mapa, heroi, corpo, moedas, pontos, inimigos;

const menuTitulo = Motor.criarMenu(["Jogar", "Como jogar"]);
let ajuda = false;
Motor.cena("titulo", {
  desenhar() {
    Motor.telaTitulo(Motor.textos.titulo || "VALE DAS MOEDAS", "Um exemplo do motor do estúdio");
    if (ajuda) { Motor.painel(40, 100, 240, 50); Motor.texto("←→ ANDA · ESPAÇO PULA", 160, 110, { alinhar: "center" }); Motor.texto("ENTER PAUSA", 160, 124, { alinhar: "center", cor: Motor.ui.fraco }); }
    else menuTitulo.desenhar(null, 104);
  },
  atualizar() { if (ajuda) { if (Motor.apertou("acao") || Motor.apertou("pausa")) ajuda = false; return; } const i = menuTitulo.atualizar(); if (i === 0) Motor.ir("jogo"); if (i === 1) ajuda = true; },
});

Motor.cena("jogo", {
  entrar() {
    mapa = Motor.mapa("fase_exemplo", FASE);
    heroi = Motor.sprite(null, { cor: "#3b5dc9", w: 12, h: 16 });
    corpo = { x: 16, y: 120, w: 12, h: 16, vx: 0, vy: 0 };
    moedas = null; pontos = 0; inimigos = null;
    Motor.conversa("abertura");
  },
  atualizar(dt) {
    if (!mapa.pronto) return;
    if (!inimigos) inimigos = mapa.extrair("inimigo").map((p) => Motor.inimigo("patrulha", p.x + 1, p.y + 2, { w: 14, h: 14 }));
    if (!moedas) { moedas = mapa.achar("moeda"); const s = mapa.achar("início")[0]; if (s) { corpo.x = s.x; corpo.y = s.y; } }
    if (Motor.emDialogo()) return;
    Motor.plataforma(corpo, mapa, dt);
    if (corpo.pulou) Motor.som("pulo");
    heroi.tocar(!corpo.noChao ? "pulo" : corpo.vx ? "andar" : "idle"); heroi.atualizar(dt);
    for (let i = moedas.length - 1; i >= 0; i--) {
      const m = moedas[i];
      if (Motor.colide(corpo, { x: m.x + 4, y: m.y + 4, w: 8, h: 8 })) { moedas.splice(i, 1); mapa.trocar(m.tx, m.ty, "vazio"); pontos++; Motor.particulas(m.x + 8, m.y + 8); Motor.som("moeda"); }
    }
    const pes = mapa.nome(Math.floor((corpo.x + 6) / 16), Math.floor((corpo.y + 15) / 16));
    if (/espinho/.test(pes) || corpo.y > mapa.altura) { Motor.tremer(6); Motor.som("dano"); Motor.ir("jogo"); }
    if (/saída/.test(pes)) Motor.ir("fim", { pontos });
    if (Motor.atualizarInimigos(inimigos, mapa, dt, corpo) && Motor.dano(corpo, 1) && corpo.vida <= 0) Motor.ir("jogo");
    Motor.seguir(corpo, mapa);
  },
  desenhar() {
    Motor.parallax([{ cor: "#29366f", fator: 0.3 }]);
    mapa.desenhar();
    if (inimigos) Motor.desenharInimigos(inimigos);
    if (!(Motor.invencivel(corpo) && Math.floor(Motor.t * 20) % 2)) heroi.desenhar(corpo.x, corpo.y, corpo.virado);
    Motor.hud({ vida: corpo.vida ?? 3, vidaMax: 3, moedas: pontos, pontos: pontos * 100, tempo: 120 - Motor.t % 120 });
  },
});

Motor.cena("fim", {
  entrar(d) { this.p = d.pontos; },
  desenhar() { Motor.texto("VOCÊ VENCEU! " + this.p + " moedas", Motor.L / 2, 70, { alinhar: "center", cor: "#a7f070" }); Motor.texto("Espaço recomeça", Motor.L / 2, 100, { alinhar: "center" }); },
  atualizar() { if (Motor.apertou("acao")) Motor.ir("titulo"); },
});

Motor.iniciar({ largura: 320, altura: 180, cena: "titulo" });
