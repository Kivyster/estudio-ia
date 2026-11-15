// Resumo da seleção v2 no Telegram (lê respostas2.json e as equipes já aplicadas no D1).
// uso: node selecao/telegram2.mjs <.env> [arquivo de observações]
import { readFileSync } from 'node:fs';
import { existsSync } from 'node:fs';

const env = Object.fromEntries(readFileSync(process.argv[2], 'utf8').split(/\r?\n/)
  .map((l) => l.match(/^\s*([A-Z_]+)\s*=\s*(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].trim()]));
const res = JSON.parse(readFileSync(new URL('./respostas2.json', import.meta.url), 'utf8'));
const api = async (p) => (await fetch((process.env.ESTUDIO_URL || '') + p, { headers: { authorization: `Bearer ${env.ESTUDIO_KEY}` } })).json();
const cargos = Object.fromEntries((await api('/api/cargos')).map((c) => [c.id, c]));
const F = Object.fromEntries((await api('/api/funcionarios')).map((f) => [f.id, f]));
// se houver proposta recém-calculada, mostra ela (e não a equipe atual)
const PROPOSTA = existsSync(new URL('./cadeias2.json', import.meta.url)) && process.argv.includes('--proposta')
  ? JSON.parse(readFileSync(new URL('./cadeias2.json', import.meta.url), 'utf8')) : null;
const NOME_PROVA = { json: 'gerente', codigo: 'programador', revisao: 'qa', texto: 'roteirista', design: 'game_designer', sintese: 'pesquisador',
  sprite: 'artista_sprite', imagem: 'concept_artist', mapa: 'level_designer', som: 'sound_designer', editor: 'editor' };
const med = ['🥇', '🥈', '🥉'];
const msgs = [];

const falhas = res.filter((r) => String(r.detalhe).startsWith('falhou'));
msgs.push(`📊 PROCESSO SELETIVO v2 — resultado
${new Set(res.map((r) => r.funcionario)).size} finalistas × 11 provas = ${res.length} provas
Falharam (travaram, vazio ou limite): ${falhas.length}

Regras aplicadas:
• nota mínima 5 pra entrar na equipe
• empate (±0,3) → ganha quem tem cota maior
• modelo pesado não é titular de cargo leve
• máx. 2 do mesmo provedor por equipe, máx. 3 titulares por provedor
• OpenRouter grátis entra só como último recurso`);

for (const [prova, cargo] of Object.entries(NOME_PROVA)) {
  const l = res.filter((r) => r.prova === prova).sort((a, b) => b.nota - a.nota || a.ms - b.ms);
  const eq = PROPOSTA?.[cargo] ?? JSON.parse(cargos[cargo]?.cadeia ?? '[]');
  let t = `👔 ${(cargos[cargo]?.nome ?? cargo).toUpperCase()}\nEquipe: ${eq.join(' → ')}\n\nTop 5:\n`;
  t += l.slice(0, 5).map((r, i) => `${med[i] ?? `${i + 1}º`} ${r.funcionario} — ${r.nota} (${(r.ms / 1000).toFixed(1)}s, cota ${F[r.funcionario]?.cota})`).join('\n');
  const ruins = l.filter((r) => r.nota < 5).length;
  if (ruins) t += `\n\n${ruins} reprovados (nota < 5 ou falha)`;
  msgs.push(t);
}

const geral = {};
for (const r of res) (geral[r.funcionario] ??= []).push(r.nota);
const ord = Object.entries(geral).map(([f, n]) => [f, n.reduce((a, b) => a + b, 0) / n.length, n.filter((x) => x === 0).length]).sort((a, b) => b[1] - a[1]);
msgs.push('🏆 PLACAR GERAL (média das 11 provas)\n' + ord.map(([f, m, z], i) => `${med[i] ?? `${i + 1}º`} ${f} — ${m.toFixed(1)}${z ? ` (${z} falhas)` : ''}`).join('\n'));

if (process.argv[3]) msgs.push('📝 OBSERVAÇÕES\n' + readFileSync(process.argv[3], 'utf8'));
for (const text of msgs) {
  const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text: text.slice(0, 4000) }) });
  if (!r.ok) console.log('falhou', r.status);
}
console.log(`enviadas ${msgs.length} mensagens`);
