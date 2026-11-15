// As 6 provas do processo seletivo. Cada uma mede o que o cargo precisa e tem correção automática.
// nota final 0–10. "juiz" = nota extra dada por outros modelos (média), usada só onde a qualidade é subjetiva.
import { rodarIsolado } from './util.mjs';

const bloco = (t) => {
  const m = t.match(/```(?:js|javascript)?\s*\n([\s\S]*?)```/i);
  return m ? m[1] : t;
};

export const PROVAS = [
  {
    id: 'json', cargo: 'gerente',
    user: 'Pedido: protótipo de jogo de corrida com 2 pistas, falas do piloto rival antes de cada corrida, e uma revisão de bugs do código de colisão.',
    corrigir(t) {
      let n = 0; const det = [];
      let j; try { j = JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1)); n += 4; } catch { return { nota: 0, det: 'JSON inválido' }; }
      if (t.trim().startsWith('{') && t.trim().endsWith('}')) n += 1; else det.push('texto fora do JSON');
      const ts = Array.isArray(j.tarefas) ? j.tarefas : [];
      if (ts.length >= 2 && ts.length <= 6) n += 2; else det.push(`${ts.length} tarefas`);
      const validos = new Set(['pesquisador', 'game_designer', 'roteirista', 'programador', 'qa']);
      if (ts.length && ts.every((x) => validos.has(x.cargo))) n += 1.5; else det.push('cargo inválido');
      const depsOk = ts.every((x, i) => (x.depende_de ?? []).every((d) => Number.isInteger(d) && d < i));
      if (ts.length && depsOk) n += 1; else det.push('depende_de errado');
      const usaRoteiro = ts.some((x) => x.cargo === 'roteirista'), usaQa = ts.some((x) => x.cargo === 'qa');
      if (usaRoteiro && usaQa) n += 0.5; else det.push('não usou roteirista+qa');
      return { nota: n, det: det.join('; ') || 'ok' };
    },
  },
  {
    id: 'codigo', cargo: 'programador',
    user: `Escreva em JavaScript a função calcularDano(base, critico, armadura):
- dano = base × 2 se critico for true, senão base × 1
- subtrai armadura
- arredonda para baixo
- o mínimo é 1 (nunca menos)
- se base não for número, lança um Error
Entregue só a função num bloco de código.`,
    corrigir(t) {
      const casos = [
        [[10, false, 3], 7], [[10, true, 3], 17], [[5, false, 10], 1], [[7.9, false, 0], 7],
        [[3, true, 0.5], 5], [[0, false, 0], 1],
      ];
      let fn;
      try {
        const ctx = vm.createContext({});
        vm.runInContext(bloco(t) + '\n;globalThis.__f = calcularDano;', ctx, { timeout: 1000 });
        fn = ctx.__f;
      } catch (e) { return { nota: 0, det: 'não compilou: ' + e.message }; }
      let ok = 0; const det = [];
      for (const [a, esp] of casos) {
        try { const r = fn(...a); if (r === esp) ok++; else det.push(`${JSON.stringify(a)}→${r} (esperado ${esp})`); } catch { det.push(`${JSON.stringify(a)} lançou erro`); }
      }
      let lanca = false; try { fn('x', false, 0); } catch { lanca = true; }
      if (!lanca) det.push('não lança erro com texto');
      const nota = (ok / casos.length) * 8 + (lanca ? 2 : 0);
      return { nota, det: det.join('; ') || 'todos os testes passaram' };
    },
  },
  {
    id: 'revisao', cargo: 'qa',
    user: `Revise este código de jogo:
\`\`\`js
function curarTime(time, cura) {
  for (let i = 0; i <= time.length; i++) {
    const p = time[i];
    if (p.vivo = true) {
      p.vida = p.vida + cura;
    }
  }
}
// regra: vida máxima é 100
\`\`\``,
    corrigir(t) {
      const low = t.toLowerCase(); let n = 0; const det = [];
      if (/<=|length|índice|indice|fora do|undefined|off.?by/.test(low)) n += 3; else det.push('não achou o <= length');
      if (/===|==|atribui|atribuição|comparação|comparacao|sempre (true|verdadeiro)/.test(low)) n += 3; else det.push('não achou o = no if');
      if (/100|máxim|maxim|limite|clamp|math\.min|ultrapass|passa/.test(low)) n += 3; else det.push('não achou vida > 100');
      const linhas = t.split('\n').filter((l) => /\[(GRAVE|MÉDIO|MEDIO|LEVE)\]/i.test(l));
      if (linhas.length >= 3) n += 1; else det.push('formato [GRAVE|MÉDIO|LEVE] incompleto');
      return { nota: n, det: det.join('; ') || 'achou os 3 bugs' };
    },
  },
  {
    id: 'texto', cargo: 'roteirista', juiz: 0.6,
    user: 'Escreva a conversa antes da corrida: o piloto rival RAVEN (arrogante, frio) provoca 3 vezes e a protagonista LUA (bem-humorada, confiante) responde cada provocação. Total: 6 falas.',
    rubrica: 'Avalie de 0 a 10: PT-BR natural, personalidades distintas e consistentes (Raven frio/arrogante, Lua bem-humorada), falas curtas, sem clichês, formato NOME: fala.',
    corrigir(t) {
      const falas = t.split('\n').filter((l) => /^\s*\**(RAVEN|LUA)\**\s*:/i.test(l));
      let n = 0; const det = [];
      if (falas.length >= 6) n += 2; else det.push(`${falas.length} falas no formato`);
      if (falas.length && falas.every((l) => l.length <= 220)) n += 1; else det.push('falas longas');
      if (/\b(você|não|é|está)\b/i.test(t)) n += 1; else det.push('não parece PT-BR');
      return { nota: n * 2.5, det: det.join('; ') || 'formato ok' }; // 0–10, combinado com o juiz
    },
  },
  {
    id: 'design', cargo: 'game_designer', juiz: 0.5,
    user: 'Desenhe uma mecânica de stamina para um jogo de sobrevivência 2D com ciclo dia/noite.',
    rubrica: 'Avalie de 0 a 10: mecânica concreta e jogável, números coerentes entre si, loop claro, riscos de design pertinentes, nada genérico.',
    corrigir(t) {
      const sec = ['vis', 'loop', 'mecân', 'progress', 'risco'];
      const low = t.toLowerCase();
      const achou = sec.filter((s) => low.includes(s)).length;
      const nums = (t.match(/\d+([.,]\d+)?/g) || []).length;
      const n = (achou / sec.length) * 6 + Math.min(nums / 10, 1) * 4;
      return { nota: n, det: `${achou}/5 seções, ${nums} números` };
    },
  },
  {
    id: 'sintese', cargo: 'pesquisador', juiz: 0.4,
    user: `### Resultados de busca na web
- Guia de coyote time (https://exemplo-dev.com/coyote-time)
  Coyote time é uma janela de 0,08 a 0,15 s após sair da plataforma em que o pulo ainda é aceito. Celeste usa cerca de 0,1 s.
- Buffer de pulo em plataformas (https://exemplo-dev.com/jump-buffer)
  Jump buffer guarda o comando de pulo por 0,1 a 0,2 s antes de tocar o chão. Melhora a sensação de resposta.
- Fórum de física de jogos (https://forum-exemplo.net/t/aceleracao)
  Aceleração alta no chão e menor no ar dá controle sem perder peso; muitos jogos usam metade da aceleração no ar.

### Sua tarefa
Resuma as técnicas que deixam o pulo de um jogo de plataforma mais responsivo.`,
    rubrica: 'Avalie de 0 a 10: fidelidade às fontes dadas (sem inventar), clareza, tópicos curtos, utilidade para um game designer.',
    corrigir(t) {
      const dadas = ['https://exemplo-dev.com/coyote-time', 'https://exemplo-dev.com/jump-buffer', 'https://forum-exemplo.net/t/aceleracao'];
      const urls = t.match(/https?:\/\/[^\s)\]>,]+/g) || [];
      const citadas = dadas.filter((d) => urls.some((u) => u.startsWith(d))).length;
      const inventadas = urls.filter((u) => !dadas.some((d) => u.startsWith(d))).length;
      let n = citadas * 2 + (inventadas === 0 ? 2 : 0) + (/0[,.]1/.test(t) ? 2 : 0);
      return { nota: Math.min(n, 10), det: `${citadas}/3 fontes, ${inventadas} URLs inventadas` };
    },
  },
];
