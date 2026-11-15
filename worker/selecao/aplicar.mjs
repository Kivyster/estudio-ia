// Aplica o resultado do processo seletivo com regra de diversidade:
// - cada cargo: no máximo 2 funcionários do mesmo provedor
// - titulares espalhados: cada provedor pode ser titular de no máximo 2 cargos,
//   desde que o escolhido esteja a até 1 ponto do melhor daquele cargo
// uso: node selecao/aplicar.mjs <caminho do .env>
import { readFileSync } from 'node:fs';

const BASE = (process.env.ESTUDIO_URL || '');
const linha = readFileSync(process.argv[2], 'utf8').split(/\r?\n/).find((l) => l.startsWith('ESTUDIO_KEY='));
const KEY = linha.slice(linha.indexOf('=') + 1).trim();
const res = JSON.parse(readFileSync(new URL('./respostas.json', import.meta.url), 'utf8'));

const PROVEDOR = { groq: 'groq', gemini: 'gemini', zai: 'zai', nv: 'nvidia', or: 'openrouter', gh: 'github', cf: 'cloudflare' };
const prov = (f) => PROVEDOR[f.split('_')[0]];
const MAX_POR_PROVEDOR_CARGO = 2, MAX_TITULAR_POR_PROVEDOR = 2, TOLERANCIA = 1.0, TAM = 4, MINIMA = 5;

const cargos = [...new Set(res.map((r) => r.cargo))];
const rank = Object.fromEntries(cargos.map((c) => [c,
  res.filter((r) => r.cargo === c && r.nota >= MINIMA).sort((a, b) => b.nota - a.nota || a.ms - b.ms)]));

// cargos com menos opções escolhem titular primeiro
const ordem = [...cargos].sort((a, b) => rank[a].length - rank[b].length);
const titularesPorProv = {}; const cadeias = {};
for (const c of ordem) {
  const l = rank[c]; if (l.length < 2) continue;
  const topo = l[0].nota;
  const tit = l.find((r) => r.nota >= topo - TOLERANCIA && (titularesPorProv[prov(r.funcionario)] ?? 0) < MAX_TITULAR_POR_PROVEDOR) ?? l[0];
  titularesPorProv[prov(tit.funcionario)] = (titularesPorProv[prov(tit.funcionario)] ?? 0) + 1;
  const cadeia = [tit.funcionario]; const cont = { [prov(tit.funcionario)]: 1 };
  for (const r of l) {
    if (cadeia.length >= TAM) break;
    if (cadeia.includes(r.funcionario)) continue;
    if ((cont[prov(r.funcionario)] ?? 0) >= MAX_POR_PROVEDOR_CARGO) continue;
    cadeia.push(r.funcionario); cont[prov(r.funcionario)] = (cont[prov(r.funcionario)] ?? 0) + 1;
  }
  cadeias[c] = cadeia;
}

for (const c of cargos) console.log(`${c.padEnd(14)} ${(cadeias[c] ?? ['(mantém)']).map((f) => `${f}[${prov(f)}]`).join(' → ')}`);

const rodada = new Date().toISOString().slice(0, 16).replace('T', ' ');
const r = await fetch(BASE + '/api/selecao', {
  method: 'POST', headers: { authorization: `Bearer ${KEY}`, 'content-type': 'application/json' },
  body: JSON.stringify({ rodada, cadeias, avaliacoes: res.map(({ texto, ...x }) => x) }),
});
console.log('aplicado:', r.status, await r.text());
