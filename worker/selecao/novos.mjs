// Compara o inventário com os funcionários atuais e avisa no Telegram os modelos grátis novos que funcionam.
// uso: node selecao/novos.mjs <.env>
import { readFileSync } from 'node:fs';
const env = Object.fromEntries(readFileSync(process.argv[2], 'utf8').split(/\r?\n/)
  .map((l) => l.match(/^\s*([A-Z_]+)\s*=\s*(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].trim()]));
const inv = JSON.parse(readFileSync(new URL('./inventario.json', import.meta.url), 'utf8'));
const funcs = await (await fetch((process.env.ESTUDIO_URL || '') + '/api/funcionarios', { headers: { authorization: `Bearer ${env.ESTUDIO_KEY}` } })).json();
const conhecidos = new Set(funcs.map((f) => f.modelo.replace(/^@cf\//, '@cf/')));
const ok = inv.resultados.filter((r) => r.status === 'funciona');
const novos = ok.filter((r) => !conhecidos.has(r.modelo));
const sumiram = funcs.filter((f) => f.ativo && f.modelo !== '*free*' && !ok.some((r) => r.modelo === f.modelo));
let t = `🔭 INVENTÁRIO MENSAL\n${inv.resultados.length} modelos listados, ${ok.length} funcionam de graça.\n`;
t += novos.length ? `\n🆕 Modelos novos que funcionam (${novos.length}):\n` + novos.slice(0, 30).map((r) => `• ${r.provedor}: ${r.modelo} [${r.tipo}]`).join('\n') : '\nNenhum modelo novo.';
if (sumiram.length) t += `\n\n⚠️ Funcionários que pararam de responder:\n` + sumiram.map((f) => `• ${f.nome} (${f.modelo})`).join('\n');
t += '\n\nModelo novo só entra na equipe depois de você pedir pra eu cadastrar e ele passar nas provas.';
await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text: t.slice(0, 4000) }) });
console.log(`novos: ${novos.length}, sumiram: ${sumiram.length}`);
