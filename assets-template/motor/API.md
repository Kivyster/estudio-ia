# API do Motor do estúdio (global `Motor`)
Estrutura fixa do jogo: `index.html` e `motor/motor.js` vêm prontos (NÃO escreva esses arquivos). Todo o jogo fica em UM arquivo: `js/jogo.js` (é o único script carregado depois do motor). Resolução padrão 320x180, pixel art ampliado.
## Esqueleto obrigatório de js/jogo.js
```js
Motor.cena("titulo", { atualizar(dt){ if (Motor.apertou("acao")) Motor.ir("jogo"); }, desenhar(ctx){ Motor.texto("NOME", Motor.L/2, 70, {alinhar:"center", tam:12}); } });
Motor.cena("jogo", { entrar(dados){ /* cria estado */ }, atualizar(dt){ /* regras */ }, desenhar(ctx){ /* fundo, mapa, personagens, HUD */ } });
Motor.iniciar({ largura: 320, altura: 180, cena: "titulo" });
```

## Cenas e tempo
`Motor.cena(nome, {entrar(dados), atualizar(dt), desenhar(ctx), sair()})` · `Motor.ir(nome, dados)` troca de cena · `Motor.dt`, `Motor.t` (segundos) · `Motor.L`, `Motor.A` (tamanho da tela) · `Motor.ctx` (canvas 2D). Loop fixo de 60 passos/s; `dt` em segundos.

## Entrada
`Motor.tecla(n)` segurando · `Motor.apertou(n)` só no quadro em que apertou · `Motor.eixo()` → {x,y} de -1 a 1.
Nomes: `esquerda` `direita` `cima` `baixo` (setas e WASD), `acao` (Espaço/Z/J/toque), `acao2` (X/K), `pausa` (Enter/Esc), ou código da tecla (`"KeyR"`).

## Personagens (sprite do artista: assets/<nome>_sheet.png + assets/<nome>.json)
`const h = Motor.sprite("heroi", {cor:"#3b5dc9", w:16, h:16})` (cor/w/h = reserva se o arquivo faltar) · `Motor.sprite(null, {cor, w, h})` = só a forma colorida, sem buscar arquivo (use pra arte pendente)
`h.tocar("andar")` (nomes das animações do artista: idle, andar, ataque, pulo, flutuar) · `h.atualizar(dt)` · `h.desenhar(x, y, viradoEsquerda)` (já desconta a câmera) · `h.terminou()` · `h.w`, `h.h`.

## Mapa (fase do level designer: assets/<nome>.tmj)
`const m = Motor.mapa("fase_1", reservaEmTexto)` — reserva opcional `{legenda:{"#":"chão",...}, linhas:[...]}` usada se o .tmj faltar · `Motor.mapa(null, reserva)` monta direto do texto (sem buscar arquivo).
`m.pronto` (espere antes de usar) · `m.desenhar()` (tileset e bordas automáticas) · `m.solido(px,py)` · `m.tipo(tx,ty)` / `m.tipoEm(px,py)` → "solido", "plataforma", "perigo", "coletavel", "inicio", "saida", "inimigo", "agua", "escada", "decoracao", "vazio" · `m.objetos` (lista {name, type, x, y}) · `m.visao` ("plataforma" ou "cima") · `m.nome(tx,ty)` · `m.achar("moeda")` → [{x,y,tx,ty}] · `m.trocar(tx,ty,"vazio")` · `m.extrair("inimigo")` tira do mapa todos os tiles desse tipo/nome e devolve as posições (pra virarem entidades) · `m.T` (tamanho do tile) · `m.largura`, `m.altura` (pixels). Desenha com assets/tiles.png (se existir) ou cores reserva.

## Física pronta
Corpo = `{x, y, w, h, vx, vy}`.
`Motor.plataforma(corpo, mapa, dt, {velocidade, aceleracao, gravidade, pulo})` — andar + pular com coyote time e pulo variável; define `corpo.noChao`, `corpo.pulou`, `corpo.virado`. Valores padrão vêm de `Motor.config.jogador`.
`Motor.vistaDeCima(corpo, mapa, dt, {velocidade})` — top-down 8 direções.
`Motor.mover(corpo, mapa, dt)` — só aplica vx/vy com colisão (`corpo.bateu.x/y`). `Motor.colide(a, b)` — AABB.

## Câmera
`Motor.seguir(alvo, mapa)` (chame no atualizar) · `Motor.camera.x/y`. Desenhos de mundo: `Motor.ret(x,y,w,h,cor)`; de tela (HUD): `Motor.retTela(...)`.

## Desenho e interface (cores da UI vêm sozinhas da bíblia de estilo: `Motor.ui.texto`, `.destaque`, `.fraco`, `.perigo`, `.vida`, `.ok`, `.painel`)
`Motor.texto(str, x, y, {tam: 8|16|24, cor, alinhar:"left|center|right"})` — fonte pixel própria em MAIÚSCULAS com acentos e símbolos ▶ ♥ ★ ← → × · `Motor.larguraTexto(str, tam)`
`Motor.telaTitulo(titulo, subtitulo)` · `Motor.piscar("APERTE ESPAÇO", y)`
`const menu = Motor.criarMenu(["Jogar", "Como jogar"])` → no atualizar `const i = menu.atualizar()` (−1 ou índice escolhido), no desenhar `menu.desenhar(x, y)` (null = centralizado)
`Motor.hud({vida, vidaMax, moedas, chaves, pontos, tempo})` — barra de cima pronta com ícones
`Motor.painel(x, y, w, h)` · `Motor.icone("coracao"|"coracao_vazio"|"moeda"|"estrela"|"chave"|"relogio"|"caveira", x, y, {escala})` · `Motor.barra(x,y,w,h,fracao,cor)`
`Motor.ret(x,y,w,h,cor)` (mundo) · `Motor.retTela(...)` (tela) · `Motor.desenharImagem(nome, x, y, w, h, corReserva)` · `Motor.parallax([{img:"cenario_0_ceu.png", fator:0}, ...])` (o artista de cenário entrega a linha pronta).
PAUSA É AUTOMÁTICA: Enter/Esc em qualquer cena que não seja a primeira abre o menu Continuar/Recomeçar/Título (não implemente pausa; desligue com `Motor.pausaAutomatica = false`). Troca de cena já tem fade.

## Som
`Motor.som("pulo")` toca assets/pulo.wav (bipe se faltar) · `Motor.bipe(freq, dur)` · `Motor.musica("tema")` (loop).

## Juice
`Motor.particulas(x, y, cor, n, forca)` · `Motor.tremer(intensidade)`.

## Diálogo (roteirista: assets/dialogos.json, carregado sozinho)
`Motor.conversa("id_da_cena", (ultimaCena) => {...})` toca a cena com escolhas (setas + Espaço) · `Motor.textos.titulo`, `.vitoria`, `.derrota`… (use com valor padrão) · `Motor.dialogo([{quem, fala}], aoTerminar)` pra falas avulsas · `Motor.emDialogo()` (pause o jogo enquanto true).

## Dados
`Motor.config` (assets/config.json do game designer, carregado sozinho; use `Motor.config.x ?? padrao`) · `Motor.json("assets/x.json").then(...)` (null se faltar) · `Motor.salvar(chave, valor)` / `Motor.carregar(chave, padrao)`.

## Utilidades
`Motor.aleatorio(a,b)` · `Motor.limitar(v,a,b)` · `Motor.aproximar(v,alvo,passo)`.

## Regras
- Use SOMENTE assets listados como disponíveis. Arquivo faltando não trava (o motor desenha reserva), mas o teste reprova 404.
- Erros aparecem numa faixa vermelha na tela e no console: o teste automático reprova.
- Tela de título → jogo → vitória/derrota → recomeçar. Controles escritos na tela.
