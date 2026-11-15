// Inventário: testa TODOS os modelos de TODAS as APIs com a menor chamada possível.
// Chat: "Responda só: ok" com poucos tokens de saída. Imagem: 1 imagem pequena.
// Nunca imprime chaves. Saída: selecao/inventario.json
// uso: node selecao/inventario.mjs <caminho do .env>
import { readFileSync, writeFileSync } from 'node:fs';

const env = Object.fromEntries(readFileSync(process.argv[2], 'utf8').split(/\r?\n/)
  .map((l) => l.match(/^\s*([A-Z_]+)\s*=\s*(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].trim()]));
const segredos = Object.values(env).filter((v) => v && v.length > 8);
const red = (s) => { let o = String(s ?? ''); for (const v of segredos) o = o.split(v).join('<x>'); return o.replace(/\s+/g, ' ').slice(0, 180); };
const ACC = env.CLOUDFLARE_ACCOUNT_ID;
const PERGUNTA = [{ role: 'user', content: 'Responda só: ok' }];
const NAO_CHAT = /embed|rerank|reward|guard|safety|safeguard|parse|whisper|tts|orpheus|transcri|audio|live|lyria|robotics|computer-use|deep-research|decision|aqa|clip|ocr|detector|retriever|nemoretriever|-vl-1b|bge|e5-|nv-embed|translate/i;

async function req(url, opts, ms = 45000) {
  const t0 = Date.now();
  try {
    const r = await fetch(url, { ...opts, signal: AbortSignal.timeout(ms) });
    const txt = await r.text(); let j = null; try { j = JSON.parse(txt); } catch {}
    return { ok: r.ok, s: r.status, j, txt, h: r.headers, ms: Date.now() - t0 };
  } catch (e) { return { ok: false, s: 0, j: null, txt: `timeout/erro: ${e.name}`, h: new Headers(), ms: Date.now() - t0 }; }
}
const classifica = (r) => {
  if (r.ok) return 'funciona';
  const t = (r.txt || '').toLowerCase();
  if (r.s === 0) return 'sem resposta';
  if (r.s === 429 && /quota|exceeded|billing|balance|recharge|resource package/.test(t)) return 'sem cota grátis';
  if (r.s === 429) return 'limite momentâneo';
  if (r.s === 403 && /free plan|not available|paid/.test(t)) return 'só plano pago';
  if (r.s === 404 || r.s === 410 || /not found|deprecated|end of life|no longer available/.test(t)) return 'indisponível/desativado';
  return `erro ${r.s}`;
};
const lim = (h) => ({
  req_dia: h.get('x-ratelimit-limit-requests') ?? undefined,
  req_restantes: h.get('x-ratelimit-remaining-requests') ?? undefined,
  tok_min: h.get('x-ratelimit-limit-tokens') ?? undefined,
});

async function emLotes(itens, n, fn) {
  const out = []; let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < itens.length) { const k = i++; out[k] = await fn(itens[k]); } }));
  return out;
}

const res = [];
const add = (provedor, modelo, tipo, r, extra = {}) => {
  const linha = { provedor, modelo, tipo, status: classifica(r), ms: r.ms, ...extra };
  if (linha.status !== 'funciona') linha.erro = red(r.j?.error?.message ?? r.j?.errors?.[0]?.message ?? r.j?.detail ?? r.txt);
  res.push(linha);
  console.log(`${linha.status === 'funciona' ? '✓' : '✗'} ${provedor.padEnd(10)} ${modelo.slice(0, 50).padEnd(50)} ${linha.status}`);
};

// ---------- GEMINI ----------
{
  const l = await req('https://generativelanguage.googleapis.com/v1beta/models?pageSize=300', { headers: { 'x-goog-api-key': env.GEMINI_API_KEY } });
  const modelos = (l.j?.models || []).filter((m) => m.supportedGenerationMethods.includes('generateContent')).map((m) => m.name.replace('models/', ''));
  const chat = modelos.filter((m) => !NAO_CHAT.test(m) && !/image|banana/.test(m));
  const img = modelos.filter((m) => /image|banana/.test(m));
  await emLotes(chat, 3, async (m) => {
    const r = await req(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, { method: 'POST',
      headers: { 'x-goog-api-key': env.GEMINI_API_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: 'Responda só: ok' }] }], generationConfig: { maxOutputTokens: 400 } }) });
    add('gemini', m, 'chat', r);
  });
  for (const m of img) {
    const r = await req(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, { method: 'POST',
      headers: { 'x-goog-api-key': env.GEMINI_API_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: 'a red apple icon' }] }], generationConfig: { responseModalities: ['IMAGE', 'TEXT'] } }) }, 90000);
    add('gemini', m, 'imagem', r);
  }
  for (const m of modelos.filter((m) => NAO_CHAT.test(m))) res.push({ provedor: 'gemini', modelo: m, tipo: 'outro (não testado)', status: 'não testado' });
}

// ---------- GROQ ----------
{
  const l = await req('https://api.groq.com/openai/v1/models', { headers: { authorization: `Bearer ${env.GROQ_API_KEY}` } });
  for (const m of (l.j?.data || []).map((x) => x.id)) {
    if (NAO_CHAT.test(m) || /allam/.test(m)) { res.push({ provedor: 'groq', modelo: m, tipo: 'outro (não testado)', status: 'não testado' }); continue; }
    const r = await req('https://api.groq.com/openai/v1/chat/completions', { method: 'POST',
      headers: { authorization: `Bearer ${env.GROQ_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: m, messages: PERGUNTA, max_tokens: 200, ...(m.includes('gpt-oss') ? { reasoning_effort: 'low' } : {}) }) });
    add('groq', m, 'chat', r, { limites: lim(r.h) });
  }
}

// ---------- OPENROUTER (só :free) ----------
{
  const l = await req('https://openrouter.ai/api/v1/models', {});
  const free = (l.j?.data || []).filter((m) => m.id.endsWith(':free'));
  await emLotes(free, 2, async (m) => {
    const r = await req('https://openrouter.ai/api/v1/chat/completions', { method: 'POST',
      headers: { authorization: `Bearer ${env.OPENROUTER_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: m.id, messages: PERGUNTA, max_tokens: 200 }) }, 90000);
    add('openrouter', m.id, 'chat', r, { contexto: m.context_length });
  });
}

// ---------- NVIDIA ----------
{
  const l = await req('https://integrate.api.nvidia.com/v1/models', { headers: { authorization: `Bearer ${env.NVIDIA_API_KEY}` } });
  const ids = (l.j?.data || []).map((x) => x.id);
  const chat = ids.filter((m) => !NAO_CHAT.test(m));
  for (const m of ids.filter((m) => NAO_CHAT.test(m))) res.push({ provedor: 'nvidia', modelo: m, tipo: 'outro (não testado)', status: 'não testado' });
  await emLotes(chat, 3, async (m) => {
    const r = await req('https://integrate.api.nvidia.com/v1/chat/completions', { method: 'POST',
      headers: { authorization: `Bearer ${env.NVIDIA_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: m, messages: PERGUNTA, max_tokens: 200 }) }, 40000);
    add('nvidia', m, 'chat', r);
  });
}

// ---------- Z.AI ----------
{
  const l = await req('https://api.z.ai/api/paas/v4/models', { headers: { authorization: `Bearer ${env.ZAI_API_KEY}` } });
  const ids = [...new Set([...(l.j?.data || []).map((x) => x.id), 'glm-4.5-flash', 'glm-4.7-flash'])];
  for (const m of ids) {
    let r = await req('https://api.z.ai/api/paas/v4/chat/completions', { method: 'POST',
      headers: { authorization: `Bearer ${env.ZAI_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: m, messages: PERGUNTA, max_tokens: 200, thinking: { type: 'disabled' } }) });
    if (r.s === 400 && /always engages in thinking/i.test(r.txt))
      r = await req('https://api.z.ai/api/paas/v4/chat/completions', { method: 'POST',
        headers: { authorization: `Bearer ${env.ZAI_API_KEY}`, 'content-type': 'application/json' },
        body: JSON.stringify({ model: m, messages: PERGUNTA, max_tokens: 400, thinking: { type: 'enabled' } }) });
    add('zai', m, 'chat', r);
  }
}

// ---------- CLOUDFLARE WORKERS AI ----------
{
  const l = await req(`https://api.cloudflare.com/client/v4/accounts/${ACC}/ai/models/search?per_page=300`, { headers: { authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}` } });
  const ativos = (l.j?.result || []).filter((m) => !(m.properties || []).some((p) => p.property_id === 'planned_deprecation_date'));
  for (const m of ativos) {
    const tarefa = m.task?.name || '';
    let input;
    if (tarefa === 'Text Generation' && !NAO_CHAT.test(m.name) && !/lora/.test(m.name)) input = { messages: PERGUNTA, max_tokens: 64 };
    else if (tarefa === 'Text-to-Image') input = { prompt: 'a red apple icon, flat, white background', steps: 4 };
    else { res.push({ provedor: 'cloudflare', modelo: m.name, tipo: `${tarefa} (não testado)`, status: 'não testado' }); continue; }
    let r = await req(`https://api.cloudflare.com/client/v4/accounts/${ACC}/ai/run/${m.name}`, { method: 'POST',
      headers: { authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`, 'content-type': 'application/json' }, body: JSON.stringify(input) }, 90000);
    if (!r.ok && tarefa === 'Text-to-Image' && r.s === 400) { // alguns modelos (flux-2) pedem multipart
      const fd = new FormData(); fd.append('prompt', input.prompt);
      r = await req(`https://api.cloudflare.com/client/v4/accounts/${ACC}/ai/run/${m.name}`, { method: 'POST',
        headers: { authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}` }, body: fd }, 90000);
    }
    add('cloudflare', m.name, tarefa === 'Text-to-Image' ? 'imagem' : 'chat', r);
  }
}

// GitHub Models: encerrado pelo GitHub em 30/07/2026 (removido)

// ---------- COTAS QUE AS APIs INFORMAM ----------
const cotas = {};
{ const k = await req('https://openrouter.ai/api/v1/key', { headers: { authorization: `Bearer ${env.OPENROUTER_API_KEY}` } });
  cotas.openrouter = k.j?.data?.free_model_daily_requests ?? k.j?.data; }
{ const t = await req('https://api.tavily.com/usage', { headers: { authorization: `Bearer ${env.TAVILY_API_KEY}` } });
  cotas.tavily = t.ok ? t.j : `sem endpoint (${t.s})`; }

writeFileSync(new URL('./inventario.json', import.meta.url), JSON.stringify({ em: new Date().toISOString(), resultados: res, cotas }, null, 1));
const ok = res.filter((r) => r.status === 'funciona');
console.log(`\nTOTAL: ${res.length} modelos listados, ${res.filter((r) => r.status !== 'não testado').length} testados, ${ok.length} funcionam`);
