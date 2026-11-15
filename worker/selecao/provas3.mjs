// Provas atualizadas pros formatos novos (sprite por partes, fase com tileset, cenário em camadas, efeitos sfxr)
// e provas dos cargos novos (diretor de arte, compositor, crítico, integrador). Substituem as de mesmo id em provas2.
import { extrair } from './util.mjs';
import { parse } from 'acorn';

const renderOk = (r, base = 6) => (r.render_ok ? base : 0);

export const PROVAS_NOVAS = [
  { id: 'sprite', cargo: 'artista_sprite', render: 'sprite_kit', juiz: 0.6, visao: true,
    user: 'Pinguim inimigo 24x24 visto de lado: corpo preto, barriga branca, bico e pés laranja, olhos de 1 pixel. Animações: andar 4 quadros e morte 4 quadros.',
    rubrica: 'Esta sprite sheet deveria mostrar um PINGUIM (preto, barriga branca, bico/pés laranja) em pixel art 24x24, com linha de andar e linha de morte. Avalie de 0 a 10: dá pra reconhecer o pinguim? volume e contorno? a animação de andar e a de morte fazem sentido?',
    corrigir(t, r) {
      let j; try { j = extrair(t); } catch { return { nota: 0, det: 'JSON inválido' }; }
      const partes = (j.partes || []).length, anims = (j.animacoes || []).map((a) => a.tipo);
      return { nota: renderOk(r) + (partes >= 6 ? 2 : partes >= 4 ? 1 : 0) + (anims.includes('andar') ? 1 : 0) + (anims.includes('morte') ? 1 : 0), det: `${partes} partes, anims ${anims.join('/')}${r.render_ok ? '' : ', render falhou: ' + (r.render_erro || '').slice(0, 60)}` };
    } },

  { id: 'imagem', cargo: 'concept_artist', render: 'cenario', juiz: 0.6, visao: true,
    user: 'Fundo da fase de neve ao amanhecer: céu rosa e azul, montanhas nevadas ao longe, neblina, colinas, pinheiros na frente. Parallax em camadas.',
    rubrica: 'Este fundo deveria mostrar: céu de amanhecer rosa/azul, montanhas nevadas ao longe, pinheiros na frente, com profundidade (trás mais claro, frente mais escuro). Avalie de 0 a 10 a fidelidade e se serve como fundo de jogo sem competir com o primeiro plano.',
    corrigir(t, r) {
      let j; try { j = extrair(t); } catch { return { nota: 0, det: 'JSON inválido' }; }
      const c = (j.camadas || []).map((x) => x.tipo), f = (j.camadas || []).map((x) => Number(x.fator) || 0);
      const crescente = f.every((v, i) => i === 0 || v >= f[i - 1]);
      return { nota: renderOk(r) + (c.length >= 4 ? 1 : 0) + (c.includes('montanhas') ? 1 : 0) + (c.includes('arvores') ? 1 : 0) + (crescente ? 1 : 0), det: `${c.join(',')}${crescente ? '' : ' (fatores fora de ordem)'}` };
    } },

  { id: 'mapa', cargo: 'level_designer', render: 'mapa', juiz: 0.3,
    user: 'Fase de neve de plataforma, 60 colunas x 14 linhas. Ensina o pulo sobre buracos: primeiro buraco pequeno com chão firme dos dois lados, depois maiores. 6 moedas em arco mostrando o pulo, 2 inimigos, 1 plataforma fina. Pulo do jogador: 3 tiles de altura, 4 de distância.',
    rubrica: 'Avalie de 0 a 10 a intenção de design e a grade: o pulo é ensinado antes de ser cobrado? as moedas mostram o caminho? ritmo com respiro?',
    corrigir(t, r) {
      let j; try { j = extrair(t); } catch { return { nota: 0, det: 'JSON inválido' }; }
      if (!r.render_ok) return { nota: 0, det: 'render falhou (fase inválida ou sem caminho): ' + (r.render_erro || '').slice(0, 80) };
      const L = j.linhas || []; let n = 6; const det = [];
      if (L.length >= 12 && L.length <= 16 && L[0].length >= 55 && L[0].length <= 66) n += 2; else det.push('tamanho fora do pedido');
      const leg = JSON.stringify(j.legenda || {}); if (/plataforma/.test(leg)) n += 1; else det.push('sem plataforma fina');
      if (/moeda|coletavel/.test(leg)) n += 1; else det.push('sem moedas');
      return { nota: n, det: det.join('; ') || 'válida, caminho conferido pelo código' };
    } },

  { id: 'som', cargo: 'sound_designer', render: 'som', juiz: 0.4, audio: true,
    user: 'Sons do pinguim inimigo: começar a deslizar, bater na parede, ser derrotado. E um som de pegar a fogueira de checkpoint e um de pulo do herói.',
    rubrica: 'Ouça os efeitos (na ordem: deslizar, bater, derrotado, checkpoint, pulo). Avalie de 0 a 10: cada som comunica a função (derrota cai, checkpoint sobe)? soam agradáveis e retrô? volumes e durações adequados?',
    corrigir(t, r) {
      let j; try { j = extrair(t); } catch { return { nota: 0, det: 'JSON inválido' }; }
      if (!r.render_ok) return { nota: 0, det: 'render falhou' };
      const e = j.efeitos || []; let n = 5; const det = [];
      if (e.length >= 5) n += 1; else det.push(`${e.length} efeitos`);
      if (e.some((x) => Array.isArray(x.camadas) && x.camadas.length)) n += 1; else det.push('sem camadas');
      const derrota = e.find((x) => /derrot|morte|morr|defeat/i.test(x.nome));
      if (derrota && Number(derrota.freq_final) < Number(derrota.freq_inicial)) n += 1.5; else det.push('derrota não cai');
      const fog = e.find((x) => /fogu|check|save/i.test(x.nome));
      if (fog && (Number(fog.freq_final) >= Number(fog.freq_inicial) || (fog.arpejo || []).some((a) => a.mult > 1))) n += 1.5; else det.push('checkpoint não sobe');
      return { nota: n, det: det.join('; ') || 'ok' };
    } },

  { id: 'estilo', cargo: 'diretor_arte', render: 'estilo', juiz: 0.6, visao: true,
    user: 'GDD resumido: plataforma 2D sobre um pinguim carteiro que entrega cartas numa cidade gelada à noite, tom aconchegante e engraçado, público 8+.',
    rubrica: 'Esta cartela mostra a paleta e a escala da bíblia de estilo de um jogo de pinguim carteiro numa cidade gelada à noite, aconchegante. Avalie de 0 a 10: a paleta tem rampas coerentes, contraste herói × cenário, um destaque quente pro aconchego, nada de cores puras genéricas?',
    corrigir(t, r) {
      let j; try { j = extrair(t); } catch { return { nota: 0, det: 'JSON inválido' }; }
      if (!r.render_ok) return { nota: 0, det: 'bíblia recusada: ' + (r.render_erro || '').slice(0, 80) };
      const cores = Object.keys(j.paleta || {}).length, regras = (j.regras || []).length;
      return { nota: 6 + (cores >= 12 && cores <= 20 ? 2 : 1) + (regras >= 6 ? 1 : 0) + ((j.referencias || []).length >= 2 ? 1 : 0), det: `${cores} cores, ${regras} regras` };
    } },

  { id: 'musica', cargo: 'compositor', render: 'musica', juiz: 0.6, audio: true,
    user: 'Tema da fase da cidade gelada à noite: aconchegante e brincalhão, 110 a 130 bpm, forma A-A-B-A, melodia marcante, baixo saltitante, bateria leve.',
    rubrica: 'Ouça este loop. Avalie de 0 a 10: tem motivo marcante que dá pra assobiar? clima aconchegante/brincalhão? baixo e bateria sustentam o ritmo? o loop emenda sem costura? soa bem (sem notas erradas gritantes)?',
    corrigir(t, r) {
      let j; try { j = extrair(t); } catch { return { nota: 0, det: 'JSON inválido' }; }
      if (!r.render_ok) return { nota: 0, det: 'música recusada: ' + (r.render_erro || '').slice(0, 80) };
      const c = (j.canais || []).length, bpm = Number(j.bpm);
      return { nota: 6 + (c >= 3 ? 1 : 0) + ((j.canais || []).some((x) => x.tipo === 'bateria' || /bateria/i.test(x.nome)) ? 1 : 0) + (bpm >= 105 && bpm <= 135 ? 1 : 0) + (new Set((j.canais?.[0]?.sequencia) || []).size >= 2 ? 1 : 0), det: `${c} canais, ${bpm} bpm` };
    } },

  { id: 'critica', cargo: 'critico',
    user: `## Tarefa pedida
Fase 1 de plataforma com 6 moedas, 2 inimigos e 1 plataforma fina, ensinando pulo sobre buracos.

## Entrega
{"nome":"fase_1","linhas":["............................................................","S..........................................................E","############################################################"],"legenda":{".":"vazio","#":"chão","S":"início","E":"saída"}}

## Análise automática do arquivo gerado
{"saida_alcancavel":true,"coletaveis":0,"inimigos":0,"perigos":0,"ritmo":[0,0,0,0]}`,
    corrigir(t) {
      let j; try { j = extrair(t); } catch { return { nota: 0, det: 'JSON inválido' }; }
      const nota = Number(j.nota), probs = (j.problemas || []).join(' ').toLowerCase();
      let n = 0; const det = [];
      if (Number.isFinite(nota) && nota <= 4) n += 4; else det.push(`deu ${j.nota} a uma fase vazia`);
      if (/moeda|colet/.test(probs)) n += 2; else det.push('não citou moedas');
      if (/inimig/.test(probs)) n += 2; else det.push('não citou inimigos');
      if (/buraco|pulo|plataforma/.test(probs)) n += 1; else det.push('não citou pulo/buraco');
      if (String(j.como_melhorar || '').length > 30) n += 1; else det.push('sem instrução de melhoria');
      return { nota: n, det: det.join('; ') || 'ok' };
    } },

  { id: 'integracao', cargo: 'integrador', grande: true,
    user: `Projeto "Pinguim Carteiro", marco 1. Monte o jogo web com o que a equipe entregou.

## Assets disponíveis em assets/ (use estes nomes exatos)
- assets/config.json
- assets/fase_1.tmj
- assets/fase_1_tiles.png
- assets/pulo.wav
- assets/moeda.wav

## Entregas da equipe
- game_designer: config.json com jogador {velocidade:90, gravidade:700, pulo:240, vida:3}.
- level_designer: fase_1.tmj (plataforma, moedas e 2 inimigos marcados na fase).
- programador: inimigos patrulham e o pisão na cabeça derrota.

## Arquivos atuais do jogo
(nenhum: crie js/jogo.js do zero)`,
    corrigir(t) {
      let j; try { j = extrair(t); } catch { return { nota: 0, det: 'JSON inválido' }; }
      const arq = (j.arquivos || []).find((a) => a.caminho === 'js/jogo.js');
      if (!arq) return { nota: 0, det: 'sem js/jogo.js' };
      const c = String(arq.conteudo || ''); let n = 0; const det = [];
      try { parse(c, { ecmaVersion: 'latest', sourceType: 'script' }); n += 3; } catch (e) { det.push('sintaxe: ' + String(e.message).slice(0, 60)); }
      const usa = (re, pts, nome) => { if (re.test(c)) n += pts; else det.push(`não usa ${nome}`); };
      usa(/Motor\.mapa\(\s*["']fase_1["']/, 1.5, 'Motor.mapa("fase_1")'); usa(/Motor\.plataforma\(/, 1.5, 'Motor.plataforma');
      usa(/extrair\(\s*["']inimigo/, 1, 'mapa.extrair("inimigo")'); usa(/Motor\.(atualizarInimigos|inimigo)\(/, 1, 'inimigos do motor');
      usa(/Motor\.hud\(/, 1, 'Motor.hud'); usa(/Motor\.iniciar\(/, 1, 'Motor.iniciar');
      if (/requestAnimationFrame|addEventListener\(\s*["']key/.test(c)) { n -= 2; det.push('reinventou loop/teclado'); }
      return { nota: Math.max(0, n), det: det.join('; ') || 'ok' };
    } },
];
