// Seleção v2: finalistas × 11 provas, juízes de texto e de visão, regras de custo × benefício.
// uso: node selecao/rodar2.mjs <.env> [--aplicar] [--so-aplicar]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { PROVAS as PROVAS_V2 } from './provas2.mjs';
import { PROVAS_NOVAS } from './provas3.mjs';
// provas novas substituem as de mesmo id (formatos atuais) e somam as dos cargos novos
const PROVAS = [...PROVAS_V2.filter((p) => !PROVAS_NOVAS.some((n) => n.id === p.id)), ...PROVAS_NOVAS];
import { extrair } from './util.mjs';

const BASE = (process.env.ESTUDIO_URL || '');
const [envPath, ...flags] = process.argv.slice(2);
const linha = readFileSync(envPath, 'utf8').split(/\r?\n/).find((l) => l.startsWith('ESTUDIO_KEY='));
const KEY = linha.slice(linha.indexOf('=') + 1).trim();
const SAIDA = new URL('./respostas2.json', import.meta.url);
const JUIZES_TEXTO = ['nv_ultra', 'gem_35lite', 'groq_oss'];
const JUIZES_VISAO = ['gem_3flash', 'nv_supervl', 'gem_35lite'];
const FORA_DO_TESTE = ['gemini_flash', 'or_free']; // cota pequena: só reserva, não gasta cota em prova

// regras de custo × benefício
const CARGOS_LEVES = new Set(['gerente', 'qa', 'sound_designer', 'concept_artist', 'pesquisador']);
const TAM_CADEIA = 4, MAX_PROV_CADEIA = 2, MAX_TITULAR_PROV = 3, NOTA_MIN = 5, EMPATE = 0.3;
const PESO_COTA = { grande: 0, media: 1, pequena: 2 };

async function api(path, body, tentativas = 3) {
  for (let i = 0; ; i++) {
    const r = await fetch(BASE + path, { method: body ? 'POST' : 'GET', headers: { authorization: `Bearer ${KEY}`, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json();
    const limite = j.ok === false && /HTTP 429|rate|limit/i.test(j.erro || '') && !/quota|exceeded your current/i.test(j.erro || '');
    if (!limite || i >= tentativas) return j;
    await new Promise((s) => setTimeout(s, 20000 * (i + 1))); // limite por minuto: espera e tenta de novo
  }
}

const funcs = (await api('/api/funcionarios')).filter((f) => f.ativo);
const F = Object.fromEntries(funcs.map((f) => [f.id, f]));

async function juiz(prova, candidato, texto, imagem, audio) {
  const lista = (audio ? JUIZES_VISAO.filter((j) => F[j]?.provedor === 'gemini') : imagem ? JUIZES_VISAO : JUIZES_TEXTO).filter((j) => j !== candidato).slice(0, 2);
  const notas = [];
  for (const j of lista) {
    const r = await api('/api/prova', { funcionario: j, imagem, audio,
      system: `Você é um avaliador rigoroso de um estúdio de jogos. ${prova.rubrica} Responda SOMENTE com JSON: {"nota": <0 a 10>, "motivo": "<curto>"}`,
      user: imagem || audio ? `${prova.rubrica}\nPedido original: ${prova.user}` : `TAREFA:\n${prova.user}\n\nRESPOSTA AVALIADA:\n${texto.slice(0, 7000)}` });
    const m = r.ok && String(r.texto).match(/"nota"\s*:\s*(\d+(?:\.\d+)?)/);
    if (m) notas.push(Math.min(10, Number(m[1])));
  }
  return notas.length ? notas.reduce((a, b) => a + b, 0) / notas.length : null;
}

// executa respeitando 2 chamadas simultâneas por provedor
const filas = {};
async function porProvedor(prov, fn) {
  filas[prov] ??= { ativos: 0, espera: [] };
  const q = filas[prov];
  if (q.ativos >= 2) await new Promise((r) => q.espera.push(r));
  q.ativos++;
  try { return await fn(); } finally { q.ativos--; q.espera.shift()?.(); }
}

let resultados = [];
if (!flags.includes('--so-aplicar') && !flags.includes('--so-propor')) {
  const skills = Object.fromEntries((await api('/api/cargos')).map((c) => [c.id, c.skill]));
  const finalistas = funcs.map((f) => f.id).filter((id) => !FORA_DO_TESTE.includes(id));
  console.log(`${finalistas.length} finalistas × ${PROVAS.length} provas = ${finalistas.length * PROVAS.length} provas`);
  const pares = PROVAS.flatMap((p) => finalistas.map((f) => ({ p, f })));
  resultados = await Promise.all(pares.map(({ p, f }) => porProvedor(F[f].provedor, async () => {
    const r = await api('/api/prova', { funcionario: f, system: skills[p.cargo], user: p.user, render: p.render, grande: !!p.grande });
    if (!r.ok) {
      console.log(`✗ ${p.id.padEnd(8)} ${f.padEnd(13)} falhou: ${String(r.erro).slice(0, 80)}`);
      return { prova: p.id, cargo: p.cargo, funcionario: f, nota: 0, ms: r.ms ?? 0, detalhe: 'falhou: ' + String(r.erro).slice(0, 200) };
    }
    const auto = p.corrigir(r.texto, r);
    let nota = auto.nota, det = auto.det;
    if (p.juiz && auto.nota > 0) {
      const img = p.visao && r.preview_b64 ? `data:${r.preview_mime};base64,${r.preview_b64}` : undefined;
      const j = await juiz(p, f, r.texto, img, p.audio && r.audio_b64?.length ? r.audio_b64 : undefined);
      if (j !== null) { nota = auto.nota * (1 - p.juiz) + j * p.juiz; det += ` | juiz ${j.toFixed(1)}`; }
    }
    nota = Math.round(nota * 10) / 10;
    console.log(`✓ ${p.id.padEnd(8)} ${f.padEnd(13)} ${String(nota).padStart(4)}  ${(r.ms / 1000).toFixed(1)}s  ${det}`);
    return { prova: p.id, cargo: p.cargo, funcionario: f, nota, ms: r.ms, detalhe: det, texto: r.texto };
  })));
  writeFileSync(SAIDA, JSON.stringify(resultados, null, 1));
} else if (existsSync(SAIDA)) resultados = JSON.parse(readFileSync(SAIDA, 'utf8'));

// ---------- cadeias com custo × benefício + diversidade ----------
const cargos = [...new Set(resultados.map((r) => r.cargo))];
const ordenar = (a, b) => (Math.abs(b.nota - a.nota) > EMPATE ? b.nota - a.nota : 0)
  || PESO_COTA[F[a.funcionario].cota] - PESO_COTA[F[b.funcionario].cota] || b.nota - a.nota || a.ms - b.ms;
const rank = Object.fromEntries(cargos.map((c) => [c, resultados.filter((r) => r.cargo === c && r.nota >= NOTA_MIN).sort(ordenar)]));
const ordem = [...cargos].sort((a, b) => rank[a].length - rank[b].length);
const titulares = {}, cadeias = {}, motivos = {};
for (const c of ordem) {
  const l = rank[c]; if (l.length < 2) { motivos[c] = 'menos de 2 aprovados — mantém a atual'; continue; }
  const pode = (r) => (titulares[F[r.funcionario].provedor] ?? 0) < MAX_TITULAR_PROV && !(CARGOS_LEVES.has(c) && F[r.funcionario].pesado);
  const tit = l.find((r) => r.nota >= l[0].nota - 1 && pode(r)) ?? l.find(pode) ?? l[0];
  titulares[F[tit.funcionario].provedor] = (titulares[F[tit.funcionario].provedor] ?? 0) + 1;
  const cad = [tit.funcionario], cont = { [F[tit.funcionario].provedor]: 1 };
  for (const r of l) {
    if (cad.length >= TAM_CADEIA) break;
    const p = F[r.funcionario].provedor;
    if (cad.includes(r.funcionario) || (cont[p] ?? 0) >= MAX_PROV_CADEIA) continue;
    cad.push(r.funcionario); cont[p] = (cont[p] ?? 0) + 1;
  }
  if (!['artista_sprite', 'concept_artist', 'level_designer', 'sound_designer'].includes(c)) cad.push('or_free'); // último recurso só em cargos de texto
  cadeias[c] = cad;
}

const rel = ['# Processo seletivo v2\n', `Regras: nota mínima ${NOTA_MIN}; empate (±${EMPATE}) decidido pela cota (grande > média > pequena); modelos pesados não são titulares de cargos leves; máx. ${MAX_PROV_CADEIA} por provedor por cadeia e ${MAX_TITULAR_PROV} titulares por provedor.\n`];
for (const p of PROVAS) {
  const l = resultados.filter((r) => r.prova === p.id).sort((a, b) => b.nota - a.nota || a.ms - b.ms);
  rel.push(`## ${p.cargo} (prova: ${p.id})`, `Equipe: ${cadeias[p.cargo]?.join(' → ') ?? motivos[p.cargo] ?? '-'}\n`, '| # | Funcionário | Cota | Nota | Tempo | Detalhe |', '|---|---|---|---|---|---|',
    ...l.map((x, i) => `| ${i + 1} | ${x.funcionario} | ${F[x.funcionario]?.cota}${F[x.funcionario]?.pesado ? ' (pesado)' : ''} | ${x.nota} | ${(x.ms / 1000).toFixed(1)}s | ${String(x.detalhe).replace(/\|/g, '/')} |`), '');
}
writeFileSync(new URL('./relatorio2.md', import.meta.url), rel.join('\n'));
console.log('\nEQUIPES:'); for (const c of cargos) console.log(`  ${c.padEnd(15)} ${cadeias[c]?.join(' → ') ?? motivos[c]}`);
console.log('titulares por provedor:', JSON.stringify(titulares));

writeFileSync(new URL('./cadeias2.json', import.meta.url), JSON.stringify(cadeias, null, 1));
if (flags.includes('--propor') || flags.includes('--so-propor')) { // reseleção automática: só propõe; aplica com /ok_selecao no Telegram
  const rodada = 'mensal ' + new Date().toISOString().slice(0, 10);
  console.log('proposta:', JSON.stringify(await api('/api/selecao/proposta', { rodada, cadeias, avaliacoes: resultados.map(({ texto, ...x }) => x) })));
}
if (flags.includes('--aplicar') || flags.includes('--so-aplicar')) {
  const rodada = 'v2 ' + new Date().toISOString().slice(0, 16).replace('T', ' ');
  const r = await api('/api/selecao', { rodada, cadeias, avaliacoes: resultados.map(({ texto, ...x }) => x) });
  console.log('aplicado:', JSON.stringify(r));
}
