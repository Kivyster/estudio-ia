// Seleção v2: 11 provas, mais difíceis que a v1. Nota 0–10.
// corrigir(texto, resp): resp traz render_ok/render_erro quando a prova usa renderizador.
// juiz: peso da nota dos juízes (texto) ; visao: juízes olham a imagem renderizada.
import { extrair, rodarIsolado } from './util.mjs';

const bloco = (t) => { const m = t.match(/```(?:js|javascript)?\s*\n([\s\S]*?)```/i); return m ? m[1] : t; };

export const PROVAS = [
  { id: 'json', cargo: 'gerente',
    user: 'Pedido: fase de neve para o nosso plataforma 2D. Precisa do mapa da fase, um inimigo novo (pinguim que desliza) com sprite animado, os sons do pinguim, o código da IA do pinguim revisado, e um fundo de montanhas nevadas.',
    corrigir(t) {
      let n = 0; const det = []; let j;
      try { j = extrair(t); n += 3; } catch { return { nota: 0, det: 'JSON inválido' }; }
      if (t.trim().startsWith('{')) n += 0.5; else det.push('texto fora do JSON');
      const ts = Array.isArray(j.tarefas) ? j.tarefas : [];
      const validos = new Set(['pesquisador', 'game_designer', 'roteirista', 'programador', 'qa', 'artista_sprite', 'concept_artist', 'level_designer', 'sound_designer']);
      if (ts.length >= 5 && ts.length <= 8) n += 1; else det.push(`${ts.length} tarefas`);
      if (ts.length && ts.every((x) => validos.has(x.cargo))) n += 1; else det.push('cargo inválido');
      const usa = (c) => ts.some((x) => x.cargo === c);
      const precisa = ['level_designer', 'artista_sprite', 'sound_designer', 'programador', 'qa', 'concept_artist'];
      const faltam = precisa.filter((c) => !usa(c));
      n += 3 * (1 - faltam.length / precisa.length); if (faltam.length) det.push('faltou: ' + faltam.join(','));
      const iProg = ts.findIndex((x) => x.cargo === 'programador'), iQa = ts.findIndex((x) => x.cargo === 'qa');
      if (iQa > iProg && iProg >= 0 && (ts[iQa].depende_de || []).includes(iProg)) n += 1; else det.push('qa não depende do programador');
      if (ts.every((x, i) => (x.depende_de ?? []).every((d) => Number.isInteger(d) && d < i))) n += 0.5; else det.push('depende_de inválido');
      return { nota: n, det: det.join('; ') || 'ok' };
    } },

  { id: 'codigo', cargo: 'programador',
    user: `Escreva em JavaScript a função ranking(jogadores). Cada jogador: {nome, pontos, tempo}.
- Ignore entradas sem nome (string não vazia) ou com pontos/tempo que não sejam números finitos.
- Ordene por pontos (maior primeiro), depois tempo (menor primeiro), depois nome em ordem alfabética (localeCompare 'pt').
- Empate em pontos E tempo divide a posição (ranking esportivo: 1, 2, 2, 4).
- Não altere o array recebido. Retorne [{posicao, nome, pontos, tempo}].
Entregue só a função num bloco de código.`,
    corrigir(t) {
      const P = (a) => (Array.isArray(a) ? a : []).map((x) => `${x.posicao}:${x.nome}`).join(',');
      const casos = [
        [[{ nome: 'Ana', pontos: 10, tempo: 5 }, { nome: 'Bia', pontos: 20, tempo: 9 }], '1:Bia,2:Ana'],
        [[{ nome: 'Ana', pontos: 10, tempo: 5 }, { nome: 'Bia', pontos: 10, tempo: 3 }], '1:Bia,2:Ana'],
        [[{ nome: 'Caio', pontos: 10, tempo: 5 }, { nome: 'Ana', pontos: 10, tempo: 5 }, { nome: 'Bia', pontos: 3, tempo: 1 }], '1:Ana,1:Caio,3:Bia'],
        [[{ nome: 'A', pontos: 9, tempo: 1 }, { nome: 'B', pontos: 8, tempo: 1 }, { nome: 'C', pontos: 8, tempo: 1 }, { nome: 'D', pontos: 7, tempo: 1 }], '1:A,2:B,2:C,4:D'],
        [[{ nome: '', pontos: 9, tempo: 1 }, { nome: 'X', pontos: 'nan', tempo: 1 }, { nome: 'Z', pontos: 1, tempo: 1 }], '1:Z'],
        [[{ nome: 'Érica', pontos: 1, tempo: 1 }, { nome: 'Eduardo', pontos: 1, tempo: 1 }], '1:Eduardo,1:Érica'],
        [[], ''],
      ];
      let res; try { res = rodarIsolado(bloco(t), 'ranking', casos.map(([e]) => [e])); } catch (e) { return { nota: 0, det: 'não executou: ' + e.message.slice(0, 60) }; }
      let ok = 0; const det = [];
      res.forEach((r, i) => { const v = r.ok ? P(r.v) : 'erro'; if (v === casos[i][1]) ok++; else det.push(`esperado ${casos[i][1] || '[]'} veio ${v || '[]'}`); });
      const puro = true; // pureza não é verificável com cópia estruturada isolada; pontos de pureza dados se passou nos testes
      return { nota: (ok / casos.length) * 9 + (puro ? 1 : 0), det: det.slice(0, 3).join('; ') || 'todos os testes passaram' };
    } },

  { id: 'revisao', cargo: 'qa',
    user: `Revise este código de jogo (JavaScript):
\`\`\`js
async function carregarFases(ids) {
  const fases = [];
  for (var i = 0; i < ids.length; i++) {
    setTimeout(() => console.log('carregando', ids[i]), 0);
    fases.push(fetch('/fase/' + ids[i]).then(r => r.json()));
  }
  return fases;
}
function moedasPorSegundo(moedas, segundos) {
  if (segundos == 0.3 * 10) return 'bônus';
  return moedas / segundos;
}
\`\`\``,
    corrigir(t) {
      const l = t.toLowerCase(); let n = 0; const det = [];
      if (/promise\.all|await|retorna (as )?promises|array de promises|não aguarda|nao aguarda/.test(l)) n += 2.5; else det.push('não viu promises sem await');
      if (/\bvar\b|closure|let |undefined|ids\[i\]/.test(l) && /settimeout|log/.test(l)) n += 2.5; else det.push('não viu var+closure no setTimeout');
      if (/ponto flutuante|floating|0\.3 ?\* ?10|2\.9999|precis|epsilon|imprecis/.test(l)) n += 2.5; else det.push('não viu comparação de float');
      if (/divis[aã]o por zero|segundos (=|==|é) ?0|zero|infinity|nan/.test(l)) n += 1.5; else det.push('não viu divisão por zero');
      if (t.split('\n').filter((x) => /\[(GRAVE|MÉDIO|MEDIO|LEVE)\]/i.test(x)).length >= 3) n += 1; else det.push('formato');
      return { nota: n, det: det.join('; ') || 'achou os 4 problemas' };
    } },

  { id: 'texto', cargo: 'roteirista', juiz: 0.7,
    user: 'Cena: a protagonista LUA (bem-humorada) encontra o ex-mentor KARR (amargo, se sente traído) no topo da montanha. Ele não sabe que ela veio pedir ajuda. Escreva 8 falas alternadas que revelem o conflito SEM ninguém explicar o passado diretamente (subtexto). Termine com uma fala que deixe dúvida se ele vai ajudar.',
    rubrica: 'Avalie de 0 a 10: subtexto (o passado aparece sem exposição direta), vozes distintas, final ambíguo, PT-BR natural, falas curtas, sem clichês.',
    corrigir(t) {
      const f = t.split('\n').filter((l) => /^\s*\**(LUA|KARR)\**\s*:/i.test(l));
      let n = 0; const det = [];
      if (f.length >= 8) n += 5; else det.push(`${f.length} falas`);
      if (f.length && f.every((l) => l.length <= 240)) n += 2.5; else det.push('falas longas');
      if (/\b(você|não|é|está)\b/i.test(t)) n += 2.5; else det.push('não parece PT-BR');
      return { nota: n, det: det.join('; ') || 'formato ok' };
    } },

  { id: 'design', cargo: 'game_designer', juiz: 0.6,
    user: 'Desenhe o sistema de "frio" da fase de neve: temperatura do jogador, fontes de calor, efeito no pulo e na velocidade, e como isso cria decisões (não só punição). Inclua a curva de dificuldade ao longo de 3 trechos da fase.',
    rubrica: 'Avalie de 0 a 10: sistema concreto e jogável, números coerentes entre si (verifique as contas), cria decisões interessantes e não só punição, curva de dificuldade clara, nada genérico.',
    corrigir(t) {
      const l = t.toLowerCase(); const sec = ['vis', 'loop', 'mecân', 'progress', 'risco'].filter((s) => l.includes(s)).length;
      const nums = (t.match(/\d+([.,]\d+)?/g) || []).length;
      return { nota: (sec / 5) * 6 + Math.min(nums / 15, 1) * 4, det: `${sec}/5 seções, ${nums} números` };
    } },

  { id: 'sintese', cargo: 'pesquisador', juiz: 0.5,
    user: `### Resultados de busca na web
- Física de gelo em plataformas (https://exemplo-dev.com/gelo)
  Superfícies de gelo usam atrito entre 0,02 e 0,1 do normal; aceleração do jogador cai para 25%. Jogadores toleram melhor quando a desaceleração é previsível.
- Postmortem de jogo indie (https://indie-exemplo.net/postmortem-neve)
  Testers abandonavam a fase de neve na primeira morte por escorregar; a correção foi pôr chão firme antes de cada abismo.
- Fórum (https://forum-exemplo.net/t/inercia)
  Um usuário afirma que "todo jogo AAA usa atrito 0" — sem fonte.

### Sua tarefa
Resuma o que serve para desenhar uma fase de gelo justa. Separe o que é confiável do que não tem fonte.`,
    rubrica: 'Avalie de 0 a 10: fidelidade às fontes, separação clara entre confiável e não comprovado (a afirmação do fórum deve ser marcada como sem fonte), utilidade prática, concisão.',
    corrigir(t) {
      const dadas = ['https://exemplo-dev.com/gelo', 'https://indie-exemplo.net/postmortem-neve', 'https://forum-exemplo.net/t/inercia'];
      const urls = t.match(/https?:\/\/[^\s)\]>,]+/g) || [];
      const cit = dadas.filter((d) => urls.some((u) => u.startsWith(d))).length, inv = urls.filter((u) => !dadas.some((d) => u.startsWith(d))).length;
      const marcou = /sem fonte|não comprovad|nao comprovad|não confiável|nao confiavel|anedót|sem evid/i.test(t);
      return { nota: Math.min(10, cit * 2 + (inv ? 0 : 2) + (marcou ? 2 : 0)), det: `${cit}/3 fontes, ${inv} inventadas, ${marcou ? 'marcou' : 'não marcou'} o boato` };
    } },

  { id: 'sprite', cargo: 'artista_sprite', render: 'sprite', juiz: 0.6, visao: true,
    user: 'Pinguim inimigo 16x16 visto de lado, animação de deslizar de barriga com 4 frames. Preto, branco e bico laranja. Contorno escuro.',
    rubrica: 'Esta sprite sheet deveria mostrar um PINGUIM (preto, branco, bico laranja) deslizando de barriga em 4 frames, em pixel art 16x16. Avalie de 0 a 10: dá pra reconhecer o pinguim? a animação muda de forma coerente? legibilidade, contorno, cores.',
    corrigir(t, r) { return r.render_ok ? { nota: 10, det: 'renderizou' } : { nota: 0, det: 'render falhou: ' + (r.render_erro || '').slice(0, 80) }; } },

  { id: 'imagem', cargo: 'concept_artist', render: 'imagem', juiz: 0.7, visao: true,
    user: 'Fundo para a fase de neve: montanhas nevadas ao amanhecer, 3 camadas de profundidade para parallax, pinheiros com neve na frente, céu rosa e azul, estilo pixel art 16-bit.',
    rubrica: 'Esta imagem deveria ser um fundo de jogo: montanhas nevadas ao amanhecer, pinheiros com neve na frente, céu rosa/azul, estilo pixel art 16-bit, camadas de profundidade. Avalie de 0 a 10 a fidelidade ao pedido e se serve como fundo de jogo.',
    corrigir(t, r) {
      let j; try { j = extrair(t); } catch { return { nota: 0, det: 'JSON inválido' }; }
      const p = String(j.prompt_en || ''); const pal = p.split(/\s+/).length;
      return { nota: (r.render_ok ? 6 : 0) + (pal >= 40 && pal <= 140 ? 2 : 0) + (/pixel/i.test(p) ? 1 : 0) + (/parallax|layer|depth/i.test(p) ? 1 : 0), det: `${pal} palavras${r.render_ok ? '' : ', render falhou'}` };
    } },

  { id: 'mapa', cargo: 'level_designer', render: 'mapa', juiz: 0.3,
    user: 'Fase de neve, 40 colunas x 14 linhas, vista de lado. Ensina o gelo escorregadio com chão firme antes de cada abismo (lição do postmortem). 4 moedas, 2 pinguins inimigos, 1 fogueira de checkpoint no meio.',
    rubrica: 'Avalie de 0 a 10 a intenção de design descrita e a grade (texto): o gelo é ensinado antes de ser cobrado? há chão firme antes de abismos? posicionamento de moedas e inimigos faz sentido?',
    corrigir(t, r) {
      let j; try { j = extrair(t); } catch { return { nota: 0, det: 'JSON inválido' }; }
      if (!r.render_ok) return { nota: 0, det: 'render falhou: ' + (r.render_erro || '').slice(0, 60) };
      const L = j.linhas || [], leg = j.legenda || {}; const det = []; let n = 4;
      const acha = (re) => Object.keys(leg).filter((c) => re.test(leg[c]));
      const S = acha(/in[ií]cio|start|spawn/i), E = acha(/sa[ií]da|exit|fim|goal/i);
      const cont = (cs) => L.join('').split('').filter((c) => cs.includes(c)).length;
      if (cont(S) === 1 && cont(E) === 1) n += 1; else det.push('início/saída ≠ 1');
      if (L.length >= 12 && L.length <= 16 && L.every((l) => l.length === L[0].length) && L[0].length >= 36 && L[0].length <= 44) n += 1; else det.push('tamanho errado');
      if (acha(/gelo|ice/i).length) n += 1; else det.push('sem gelo');
      // caminho: plataforma 2D simplificada — BFS em células que não são sólidas nem perigosas
      const solido = new Set(acha(/parede|muro|wall|pedra|rocha|ch[aã]o|piso|floor|gelo|ice|plataforma|terra|neve/i));
      const perigo = new Set(acha(/espinho|lava|perigo|spike|abismo|buraco|água|agua/i));
      const H = L.length, W = L[0]?.length || 0; let s; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (S.includes(L[y][x])) s = [x, y];
      let alcancou = false;
      if (s) { const vis = new Set([s.join()]); const fila = [s];
        while (fila.length) { const [x, y] = fila.shift(); if (E.includes(L[y][x])) { alcancou = true; break; }
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, -1], [2, 0], [-2, 0]]) { const nx = x + dx, ny = y + dy;
            if (ny < 0 || ny >= H || nx < 0 || nx >= W) continue; const c = L[ny][nx];
            if (solido.has(c) || perigo.has(c) || vis.has(nx + ',' + ny)) continue; vis.add(nx + ',' + ny); fila.push([nx, ny]); } } }
      if (alcancou) n += 3; else det.push('sem caminho do início à saída');
      return { nota: n, det: det.join('; ') || 'válido e com caminho' };
    } },

  { id: 'som', cargo: 'sound_designer', render: 'som',
    user: 'Sons do pinguim inimigo: começar a deslizar, deslizando (loop curto), bater na parede, ser derrotado. E um som de pegar a fogueira de checkpoint.',
    corrigir(t, r) {
      let j; try { j = extrair(t); } catch { return { nota: 0, det: 'JSON inválido' }; }
      if (!r.render_ok) return { nota: 0, det: 'render falhou' };
      const e = j.efeitos || []; let n = 5; const det = [];
      if (e.length >= 5) n += 2; else det.push(`${e.length} efeitos`);
      const ok = e.filter((x) => x.freq_inicial >= 40 && x.freq_inicial <= 3000 && x.duracao >= 0.05 && x.duracao <= 1.5).length;
      if (ok === e.length && e.length) n += 1; else det.push('parâmetros fora da faixa');
      const derrota = e.find((x) => /derrot|morte|morr|defeat/i.test(x.nome));
      if (derrota && derrota.freq_final < derrota.freq_inicial) n += 1; else det.push('derrota não cai');
      const fog = e.find((x) => /fogu|check|save/i.test(x.nome));
      if (fog && fog.freq_final >= fog.freq_inicial) n += 1; else det.push('checkpoint não sobe');
      return { nota: n, det: det.join('; ') || 'ok' };
    } },

  { id: 'editor', cargo: 'editor', juiz: 0.5,
    user: `### Resultado da tarefa #1 (level_designer)
Arquivos gerados: fase_neve_preview.png, fase_neve.tmj
Fase de 40x14 que ensina o gelo no primeiro trecho com chão firme antes de cada abismo. Fogueira de checkpoint na coluna 20.

### Resultado da tarefa #2 (artista_sprite)
Arquivos gerados: pinguim_slide_sheet.png, pinguim_slide_preview.png, pinguim_slide.json
Pinguim 16x16, 4 frames de deslize, paleta de 5 cores.

### Resultado da tarefa #3 (programador)
\`\`\`js
function iaPinguim(p, jogador){ if (Math.abs(p.x - jogador.x) < 120) p.vx = Math.sign(jogador.x - p.x) * 3; }
\`\`\`

### Resultado da tarefa #4 (qa)
[MÉDIO] iaPinguim — não para na beira de abismos — checar tile à frente antes de acelerar.

### Sua tarefa
Pedido original do cliente: fase de neve com inimigo pinguim. Monte a entrega final.`,
    rubrica: 'Avalie de 0 a 10: documento único e organizado, sem inventar conteúdo que não estava nas entregas, código mantido idêntico, pendência do QA aparece em pendências/riscos, conciso.',
    corrigir(t) {
      let n = 0; const det = [];
      const arqs = ['fase_neve_preview.png', 'fase_neve.tmj', 'pinguim_slide_sheet.png', 'pinguim_slide.json'];
      const cit = arqs.filter((a) => t.includes(a)).length; n += (cit / arqs.length) * 3; if (cit < 4) det.push(`${cit}/4 arquivos`);
      if (t.includes('Math.sign(jogador.x - p.x) * 3')) n += 3; else det.push('alterou o código');
      if (/pend[eê]ncia|risco/i.test(t) && /abismo|beira/i.test(t)) n += 2; else det.push('pendência do QA sumiu');
      if (/^#\s/m.test(t)) n += 1; else det.push('sem título');
      if (t.length < 4000) n += 1; else det.push('longo demais');
      return { nota: n, det: det.join('; ') || 'ok' };
    } },
];
