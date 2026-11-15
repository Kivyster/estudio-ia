#!/usr/bin/env node
// Assistente de instalação do Estúdio IA.
//   node scripts/setup.mjs                    pergunta o que falta e instala tudo
//   node scripts/setup.mjs --config setup.config.json   sem perguntas (respostas no arquivo; segredos no .env)
//   node scripts/setup.mjs --dry-run          só mostra o que faria
// Pode rodar de novo: o que já foi feito é pulado (estado em .setup-estado.json, ignorado pelo git).
// Segredos (chaves de API) ficam no arquivo .env local, nunca no git e nunca impressos na tela.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync, cpSync, rmSync, readdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(fileURLToPath(new URL('..', import.meta.url)));
const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const CONFIG = args.includes('--config') ? args[args.indexOf('--config') + 1] : null;
const ENV_ARQ = join(RAIZ, '.env'), ESTADO_ARQ = join(RAIZ, '.setup-estado.json');
const W = process.platform === 'win32';

// ---------- utilidades ----------
const verde = (s) => `\x1b[32m${s}\x1b[0m`, amarelo = (s) => `\x1b[33m${s}\x1b[0m`, vermelho = (s) => `\x1b[31m${s}\x1b[0m`, negrito = (s) => `\x1b[1m${s}\x1b[0m`;
const passo = (n, t) => console.log(`\n${negrito(`[${n}]`)} ${t}`);
const ok = (t) => console.log(`  ${verde('✔')} ${t}`);
const aviso = (t) => console.log(`  ${amarelo('!')} ${t}`);
const falha = (t) => { console.error(`\n${vermelho('✘')} ${t}\n`); process.exit(1); };
function sh(cmd, argv = [], op = {}) {
  if (DRY && !op.leitura) { console.log(`  (simulado) ${cmd} ${argv.join(' ').slice(0, 100)}`); return { ok: true, out: '', err: '' }; }
  // no Windows (shell) argumentos com espaço ou aspas precisam de citação; nos outros sistemas vão direto
  const cita = (x) => (W && /[\s"&|<>^%]/.test(x) ? `"${String(x).replace(/"/g, "\\\"")}"` : x);
  const r = spawnSync(cmd, W ? argv.map(cita) : argv, { cwd: op.cwd ?? RAIZ, input: op.input, encoding: 'utf8', shell: W, stdio: op.inherit ? 'inherit' : 'pipe', env: { ...process.env, ...(op.env ?? {}), GITHUB_TOKEN: '' } });
  return { ok: r.status === 0, out: (r.stdout ?? '') + '', err: (r.stderr ?? '') + '' };
}
const wrangler = (argv, op = {}) => sh('npx', ['wrangler', ...argv], op);
let rl = null;
const pergunta = (q, padrao = '') => new Promise((res) => { rl ??= readline.createInterface({ input: process.stdin, output: process.stdout }); rl.question(`${q}${padrao ? ` [${padrao}]` : ''}: `, (a) => res(a.trim() || padrao)); });
const simNao = async (q, padrao = true) => { const a = (await pergunta(`${q} (${padrao ? 'S/n' : 's/N'})`)).toLowerCase(); return a ? a.startsWith('s') || a.startsWith('y') : padrao; };
function perguntaSecreta(q) {
  return new Promise((res) => {
    const r = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const escrever = r._writeToOutput; r._writeToOutput = (s) => { if (s.startsWith(q)) escrever.call(r, s); else escrever.call(r, '*'); };
    r.question(q, (a) => { r.close(); console.log(); res(a.trim()); });
  });
}
function lerEnv() { const o = {}; if (existsSync(ENV_ARQ)) for (const l of readFileSync(ENV_ARQ, 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) o[m[1]] = m[2].replace(/^"|"$/g, ''); } return o; }
function gravarEnv(o) { writeFileSync(ENV_ARQ, '# Segredos do Estúdio IA — NÃO COMMITE ESTE ARQUIVO (já está no .gitignore)\n' + Object.entries(o).map(([k, v]) => `${k}=${v}`).join('\n') + '\n'); }
const estado = existsSync(ESTADO_ARQ) ? JSON.parse(readFileSync(ESTADO_ARQ, 'utf8')) : {};
const salvarEstado = () => DRY || writeFileSync(ESTADO_ARQ, JSON.stringify(estado, null, 1));
const nomeSeguro = (s) => String(s).toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

// provedor → variável de ambiente da chave, onde conseguir, e o que ele faz bem
const PROVEDORES = {
  gemini: { chave: 'GEMINI_API_KEY', onde: 'https://aistudio.google.com/apikey', nota: 'RECOMENDADO: é quem ouve áudio e vê imagem (crítico) e escreve o código do jogo. Grátis, sem cartão.' },
  groq: { chave: 'GROQ_API_KEY', onde: 'https://console.groq.com/keys', nota: 'rápido; gerente, programador e QA. Grátis, sem cartão.' },
  nvidia: { chave: 'NVIDIA_API_KEY', onde: 'https://build.nvidia.com (Get API Key)', nota: 'modelos grandes (Nemotron); game designer e reservas. Grátis.' },
  openrouter: { chave: 'OPENROUTER_API_KEY', onde: 'https://openrouter.ai/keys', nota: 'reserva final (modelos :free). Grátis.' },
  zai: { chave: 'ZAI_API_KEY', onde: 'https://z.ai (API Keys)', nota: 'GLM Flash; QA e sons. Grátis.' },
  deepseek: { chave: 'DEEPSEEK_API_KEY', onde: 'https://platform.deepseek.com/api_keys', nota: 'PAGO (bem barato, sem plano grátis): entra como reserva em todos os cargos. Opcional.', pago: true },
};

// ---------- modo --verificar: diz em JSON o que falta (para qualquer agente ou script ler) ----------
if (args.includes('--verificar')) {
  const e = lerEnv(), c = CONFIG && existsSync(CONFIG) ? JSON.parse(readFileSync(CONFIG, 'utf8')) : (estado.cfg ?? {});
  const tem = (cmd, a = ['--version']) => spawnSync(cmd, a, { encoding: 'utf8', shell: W }).status === 0;
  const ghOk = tem('gh') && spawnSync('gh', ['auth', 'status'], { encoding: 'utf8', shell: W, env: { ...process.env, GITHUB_TOKEN: '' } }).status === 0;
  const wr = tem('npx') && /logged in|You are logged/i.test(spawnSync('npx', ['wrangler', 'whoami'], { encoding: 'utf8', shell: W, cwd: join(RAIZ, 'worker') }).stdout ?? '');
  const provedores = Object.fromEntries(Object.entries(PROVEDORES).map(([id, p]) => [id, { chave: p.chave, definida: !!e[p.chave], pago: !!p.pago, onde: p.onde }]));
  const faltando = [];
  if (Number(process.versions.node.split('.')[0]) < 20) faltando.push('node>=20');
  if (!tem('git')) faltando.push('git');
  if (!tem('gh')) faltando.push('gh (GitHub CLI)'); else if (!ghOk) faltando.push('gh auth login');
  if (!wr) faltando.push('npx wrangler login (conta Cloudflare)');
  if (!existsSync(CONFIG ?? '') && !estado.cfg) faltando.push('setup.config.json (nome, repoAssets, telegram, robo)');
  if (!Object.values(provedores).some((p) => p.definida && !p.pago) && !e.CUSTOM_BASE_URL) faltando.push('ao menos 1 chave de API de modelo no .env (GEMINI_API_KEY é a mais importante)');
  if (c.telegram && !e.TELEGRAM_BOT_TOKEN) faltando.push('TELEGRAM_BOT_TOKEN no .env (ou telegram:false)');
  console.log(JSON.stringify({ pronto_para_instalar: faltando.length === 0, faltando, configuracao: c, provedores, ja_instalado: { banco: !!estado.dbId, worker: estado.workerUrl ?? null, hub: estado.hubUrl ?? null },
    observacao: 'GITHUB_ASSETS_TOKEN não entra aqui: só pode ser criado depois que o repositório existe; o setup para e pede.' }, null, 1));
  process.exit(0);
}

// ---------- 0. pré-requisitos ----------
console.log(negrito('\n🎮  Estúdio IA — instalação\n') + 'Um escritório de agentes com IAs gratuitas que fazem jogos 2D, controlado por Telegram e por um hub em pixel art.\n');
passo(0, 'Conferindo o que precisa estar instalado');
if (Number(process.versions.node.split('.')[0]) < 20) falha('Precisa do Node.js 20 ou mais novo (https://nodejs.org).');
ok(`Node ${process.versions.node}`);
if (!sh('git', ['--version'], { leitura: true }).ok) falha('Instale o git (https://git-scm.com).');
if (!sh('gh', ['--version'], { leitura: true }).ok) falha('Instale o GitHub CLI (https://cli.github.com) e rode: gh auth login');
const gh = sh('gh', ['api', 'user', '-q', '.login'], { leitura: true });
if (!gh.ok) falha('O GitHub CLI não está logado. Rode: gh auth login');
const usuarioGh = gh.out.trim(); ok(`GitHub: ${usuarioGh}`);
if (!existsSync(join(RAIZ, 'worker', 'node_modules'))) { console.log('  instalando dependências do Worker…'); if (!sh('npm', ['install', '--legacy-peer-deps', '--silent'], { cwd: join(RAIZ, 'worker') }).ok) falha('npm install falhou em worker/.'); }
const who = wrangler(['whoami'], { leitura: true });
if (!/logged in|You are logged/i.test(who.out + who.err)) {
  aviso('Você ainda não entrou na Cloudflare. Vou abrir o navegador para o login (conta grátis serve).');
  sh('npx', ['wrangler', 'login'], { inherit: true });
  if (!/logged in|You are logged/i.test(wrangler(['whoami'], { leitura: true }).out)) falha('Login na Cloudflare não concluído. Rode: npx wrangler login');
}
ok('Cloudflare conectada');

// ---------- 1. respostas ----------
passo(1, 'Configuração');
let cfg = CONFIG ? JSON.parse(readFileSync(CONFIG, 'utf8')) : (estado.cfg ?? {});
const env = lerEnv();
if (!CONFIG) {
  cfg.nome = nomeSeguro(cfg.nome ?? await pergunta('Nome do seu estúdio (vira o nome do Worker; letras, números e hífen)', 'estudio'));
  cfg.repoAssets = nomeSeguro(cfg.repoAssets ?? await pergunta('Nome do repositório PRIVADO onde ficam os jogos e a biblioteca de peças', `${cfg.nome}-assets`));
  cfg.telegram = cfg.telegram ?? await simNao('Quer controlar pelo Telegram? (recomendado)', true);
  cfg.robo = cfg.robo ?? await simNao('Ativar o robô que testa cada jogo num navegador de verdade (GitHub Actions)?', true);
}
cfg.nome = nomeSeguro(cfg.nome ?? 'estudio'); cfg.repoAssets = nomeSeguro(cfg.repoAssets ?? `${cfg.nome}-assets`);
estado.cfg = cfg; salvarEstado();

// chaves: usa o .env e pergunta só o que falta
console.log('\n  Chaves de API gratuitas (nenhuma exige cartão). Deixe em branco para pular um provedor.');
for (const [id, p] of Object.entries(PROVEDORES)) {
  if (env[p.chave]) { ok(`${id}: chave encontrada no .env`); continue; }
  if (CONFIG) { aviso(`${id}: sem chave no .env (provedor desligado)`); continue; }
  console.log(`\n  ${negrito(id)} — ${p.nota}\n  Crie em: ${p.onde}`);
  const v = await perguntaSecreta(`  Cole a chave de ${id} (não aparece na tela): `);
  if (v) env[p.chave] = v;
}
if (!CONFIG && !env.CUSTOM_BASE_URL && await simNao('\nTem um modelo próprio ou outra API compatível com OpenAI (LM Studio/Ollama por túnel, Together, Mistral…) para usar como reserva?', false)) {
  env.CUSTOM_BASE_URL = await pergunta('  URL base da API (ex.: https://meu-tunel.exemplo.com/v1)');
  env.CUSTOM_MODEL = await pergunta('  Nome do modelo (como a API o chama)');
  env.CUSTOM_API_KEY = await perguntaSecreta('  Chave da API (deixe em branco se não tiver): ');
}
const ativos = Object.entries(PROVEDORES).filter(([, p]) => env[p.chave]).map(([id]) => id);
if (env.CUSTOM_BASE_URL) { ativos.push('custom'); ok(`custom: ${env.CUSTOM_BASE_URL} (modelo ${env.CUSTOM_MODEL ?? '?'})`); }
if (!ativos.filter((a) => !PROVEDORES[a]?.pago).length) falha('Preciso de pelo menos 1 chave de API. A do Gemini é a mais importante. Preencha o .env (veja .env.example) e rode de novo.');
if (!ativos.includes('gemini')) aviso('Sem Gemini: o crítico não ouve áudio nem vê imagem, e a qualidade cai. Dá pra instalar assim, mas recomendo a chave do Gemini.');
if (ativos.length < 2) aviso('Com 1 provedor só, uma cota estourada para o escritório. Recomendo pelo menos 2.');

// (o token do GitHub é pedido no passo 3, depois que o repositório existe)
if (cfg.telegram && !env.TELEGRAM_BOT_TOKEN && !CONFIG) {
  console.log(`\n  ${negrito('Telegram')} — no Telegram, converse com @BotFather, envie /newbot e copie o token. Depois mande qualquer mensagem pro seu bot.`);
  env.TELEGRAM_BOT_TOKEN = await perguntaSecreta('  Cole o token do bot: ');
}
if (cfg.telegram && env.TELEGRAM_BOT_TOKEN && !env.TELEGRAM_CHAT_ID) {
  const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getUpdates`).then((x) => x.json()).catch(() => null);
  const id = r?.result?.map((u) => u.message?.chat?.id).filter(Boolean).pop();
  if (id) { env.TELEGRAM_CHAT_ID = String(id); ok('Telegram: achei o seu chat (você já falou com o bot).'); }
  else aviso('Telegram: mande uma mensagem qualquer para o seu bot e rode o setup de novo para eu descobrir o seu chat.');
}
env.ESTUDIO_KEY ||= randomBytes(24).toString('hex');
env.HUB_SENHA ||= randomBytes(5).toString('hex');
if (!DRY) gravarEnv(env);
ok('Respostas e chaves guardadas no .env (local, fora do git)');

// ---------- 2. banco ----------
passo(2, 'Banco de dados (Cloudflare D1)');
const W_DIR = join(RAIZ, 'worker'), H_DIR = join(RAIZ, 'hub');
if (!estado.dbId) {
  const lista = wrangler(['d1', 'list', '--json'], { leitura: true });
  let achado = null; try { achado = JSON.parse(lista.out).find((d) => d.name === cfg.nome); } catch {}
  if (achado) estado.dbId = achado.uuid;
  else {
    const r = wrangler(['d1', 'create', cfg.nome], { cwd: W_DIR });
    const m = (r.out + r.err).match(/database_id"?\s*[=:]\s*"([0-9a-f-]{36})"/i);
    if (!m && !DRY) falha(`Não consegui criar o banco D1.\n${(r.out + r.err).slice(0, 500)}`);
    estado.dbId = m?.[1] ?? 'SIMULADO';
  }
  salvarEstado();
}
ok(`Banco "${cfg.nome}" (${estado.dbId})`);
const wranglerJson = (extra = {}) => readFileSync(join(W_DIR, 'wrangler.template.jsonc'), 'utf8')
  .replace('"name": "estudio"', `"name": "${cfg.nome}"`).replace('COLE-O-ID-DO-BANCO', estado.dbId).replace('"database_name": "estudio"', `"database_name": "${cfg.nome}"`)
  .replace('SEU-USUARIO/estudio-assets', `${usuarioGh}/${cfg.repoAssets}`).replace('https://estudio-hub.SEU-SUBDOMINIO.workers.dev', extra.hubUrl ?? 'http://localhost:5180');
if (!DRY) writeFileSync(join(W_DIR, 'wrangler.jsonc'), wranglerJson({ hubUrl: estado.hubUrl }));

if (!estado.migrado) {
  const arquivos = ['schema.sql', 'seed.sql', ...readdirSync(join(W_DIR, 'migracoes')).sort().map((f) => `migracoes/${f}`)];
  for (const f of arquivos) {
    const r = wrangler(['d1', 'execute', cfg.nome, '--remote', '--file', f], { cwd: W_DIR });
    if (!r.ok) falha(`Falhou aplicando ${f}:\n${(r.err || r.out).slice(0, 600)}`);
  }
  // skills do banco = arquivos .md; desliga funcionários de provedores sem chave
  const tmp = join(tmpdir(), `estudio-skills-${Date.now()}.sql`);
  const sql = sh('node', [join(RAIZ, 'scripts', 'sincronizar-skills.mjs')], { leitura: true }).out
    + `UPDATE funcionarios SET ativo = 0 WHERE provedor NOT IN (${["'cloudflare'", ...ativos.map((a) => `'${a}'`)].join(',')});\n`
    + (ativos.includes('deepseek') ? "UPDATE funcionarios SET ativo = 1 WHERE provedor = 'deepseek';\nUPDATE cargos SET cadeia = json_insert(cadeia, '$[#]', 'deepseek_chat') WHERE cadeia NOT LIKE '%deepseek_chat%' AND id NOT IN ('critico');\n" : '')
    + (ativos.includes('custom') ? `UPDATE funcionarios SET ativo = 1, modelo = '${String(env.CUSTOM_MODEL ?? '').replace(/'/g, "''")}' WHERE id = 'custom_1';\nUPDATE cargos SET cadeia = json_insert(cadeia, '$[#]', 'custom_1') WHERE cadeia NOT LIKE '%custom_1%' AND id NOT IN ('critico');\n` : '');
  if (!DRY) { writeFileSync(tmp, sql); const r = wrangler(['d1', 'execute', cfg.nome, '--remote', '--file', tmp], { cwd: W_DIR }); rmSync(tmp, { force: true }); if (!r.ok) falha('Falhou sincronizando as skills.'); }
  estado.migrado = true; salvarEstado();
}
ok(`Tabelas, ${readdirSync(join(RAIZ, 'worker', 'skills', 'cargos')).length} cargos com skills e elenco de modelos prontos (desligados: provedores sem chave)`);

// ---------- 3. repositório de assets ----------
passo(3, `Repositório privado ${usuarioGh}/${cfg.repoAssets} (jogos, motor e biblioteca de 10 mil peças)`);
const repoCompleto = `${usuarioGh}/${cfg.repoAssets}`;
const existe = sh('gh', ['repo', 'view', repoCompleto], { leitura: true }).ok;
if (!existe) {
  const tmp = mkdtempSync(join(tmpdir(), 'estudio-assets-'));
  cpSync(join(RAIZ, 'assets-template'), tmp, { recursive: true });
  const g = (a) => sh('git', a, { cwd: tmp });
  if (!DRY) { g(['init', '-q', '-b', 'main']); g(['add', '-A']); g(['-c', 'user.name=Estudio IA', '-c', 'user.email=estudio@example.com', 'commit', '-q', '-m', 'Motor, biblioteca de pecas CC0 (Kenney) e robo de teste']); }
  const r = sh('gh', ['repo', 'create', repoCompleto, '--private', '--source', tmp, '--push', '--description', 'Jogos, motor e biblioteca do meu Estudio IA'], { cwd: tmp });
  if (!r.ok) falha(`Não consegui criar o repositório:\n${(r.err || r.out).slice(0, 500)}`);
  rmSync(tmp, { recursive: true, force: true });
  ok('Repositório criado e enviado (privado)');
} else ok('Repositório já existe (nada a fazer)');
if (!env.GITHUB_ASSETS_TOKEN && !CONFIG && !DRY) {
  console.log(`\n  Agora o repositório existe. Crie o token em https://github.com/settings/personal-access-tokens/new\n  (Only select repositories → ${cfg.repoAssets}; Contents: Read and write).`);
  env.GITHUB_ASSETS_TOKEN = await perguntaSecreta('  Cole o token: ');
  gravarEnv(env);
}
if (!env.GITHUB_ASSETS_TOKEN) falha('Falta o GITHUB_ASSETS_TOKEN no .env. Crie o token (docs/CONFIGURACAO.md) e rode o setup de novo.');

// ---------- 4. Worker ----------
passo(4, 'Publicando o Worker (o cérebro do escritório)');
const publicarWorker = () => { const r = wrangler(['deploy'], { cwd: W_DIR }); if (!r.ok) falha(`Falhou publicar o Worker:\n${(r.err || r.out).slice(0, 800)}`); return (r.out + r.err).match(/https:\/\/[\w.-]+\.workers\.dev/)?.[0]; };
estado.workerUrl = publicarWorker() ?? estado.workerUrl ?? 'https://SIMULADO.workers.dev'; salvarEstado();
const subdominio = estado.workerUrl.replace(/^https:\/\/[^.]+\./, '');
estado.hubUrl = `https://${cfg.nome}-hub.${subdominio}`; salvarEstado();
const segredos = { ESTUDIO_KEY: env.ESTUDIO_KEY, HUB_SENHA: env.HUB_SENHA, GITHUB_ASSETS_TOKEN: env.GITHUB_ASSETS_TOKEN, TELEGRAM_BOT_TOKEN: env.TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID: env.TELEGRAM_CHAT_ID, TAVILY_API_KEY: env.TAVILY_API_KEY };
for (const p of Object.values(PROVEDORES)) segredos[p.chave] = env[p.chave];
segredos.CUSTOM_BASE_URL = env.CUSTOM_BASE_URL; segredos.CUSTOM_API_KEY = env.CUSTOM_API_KEY;
for (const [k, v] of Object.entries(segredos)) if (v) { const r = wrangler(['secret', 'put', k], { cwd: W_DIR, input: v }); if (!r.ok) falha(`Falhou gravar o segredo ${k}.`); }
ok(`Worker no ar: ${estado.workerUrl}`);
if (!DRY) writeFileSync(join(W_DIR, 'wrangler.jsonc'), wranglerJson({ hubUrl: estado.hubUrl }));
publicarWorker(); ok('CORS do hub configurado');

// ---------- 5. hub ----------
passo(5, 'Publicando o hub (escritório em pixel art)');
if (!DRY) { writeFileSync(join(H_DIR, 'web', 'config.js'), `// Gerado por scripts/setup.mjs\nwindow.ESTUDIO_URL = "${estado.workerUrl}";\n`); writeFileSync(join(H_DIR, 'wrangler.jsonc'), readFileSync(join(H_DIR, 'wrangler.template.jsonc'), 'utf8').replace('"estudio-hub"', `"${cfg.nome}-hub"`)); }
const rh = wrangler(['deploy'], { cwd: H_DIR }); if (!rh.ok) falha(`Falhou publicar o hub:\n${(rh.err || rh.out).slice(0, 600)}`);
ok(`Hub: ${estado.hubUrl}`);

// ---------- 6. integrações ----------
passo(6, 'Integrações');
if (cfg.telegram && env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID && !DRY) {
  const r = await fetch(`${estado.workerUrl}/api/telegram/registrar`, { method: 'POST', headers: { authorization: `Bearer ${env.ESTUDIO_KEY}` } }).then((x) => x.json()).catch(() => null);
  r?.ok ? ok('Telegram conectado (mande /status pro seu bot)') : aviso(`Telegram: não consegui registrar o webhook (${JSON.stringify(r)?.slice(0, 120)})`);
} else aviso('Telegram não configurado (você pode usar só o hub).');
if (cfg.robo) {
  for (const [k, v] of [['ESTUDIO_KEY', env.ESTUDIO_KEY], ['ESTUDIO_URL', estado.workerUrl]]) sh('gh', ['secret', 'set', k, '--repo', repoCompleto], { input: v });
  ok('Robô de teste: segredos gravados no repositório de assets (GitHub Actions já roda sozinho a cada jogo novo)');
}

// ---------- 7. teste final ----------
passo(7, 'Teste final');
if (!DRY) {
  const raiz = await fetch(estado.workerUrl).then((x) => x.text()).catch(() => '');
  /Escrit/.test(raiz) ? ok('Worker responde') : aviso('O Worker ainda não respondeu (pode levar 1 minuto para propagar).');
  const f = await fetch(`${estado.workerUrl}/api/funcionarios`, { headers: { authorization: `Bearer ${env.ESTUDIO_KEY}` } }).then((x) => x.json()).catch(() => null);
  if (Array.isArray(f)) { const n = f.filter((x) => x.ativo).length; ok(`${n} funcionários (modelos de IA) ativos`); if (n < 4) aviso('Poucos modelos ativos: adicione mais chaves no .env e rode o setup de novo.'); }
  const arq = await fetch(`https://api.github.com/repos/${repoCompleto}/contents/biblioteca/indice.json`, { headers: { authorization: `Bearer ${env.GITHUB_ASSETS_TOKEN}`, 'user-agent': 'estudio-ia' } });
  arq.ok ? ok('Token do GitHub lê a biblioteca de peças') : aviso(`O token do GitHub não conseguiu ler o repositório (HTTP ${arq.status}). Confira as permissões (Contents: Read and write).`);
}
console.log(`\n${negrito(verde('✅ Pronto!'))}

  Hub:       ${estado.hubUrl}
  Senha do hub: veja HUB_SENHA no arquivo .env
  Worker:    ${estado.workerUrl}
  Assets:    https://github.com/${repoCompleto}

  Para criar seu primeiro jogo: abra o hub, clique em "Enviar PDF" e mande o GDD (documento de design) do seu jogo.
  ${CONFIG ? '' : 'Dica: qualquer agente de IA (Claude Code, Codex, Gemini CLI, Cursor…) pode ler o AGENTS.md e ajudar a escrever o GDD.'}
`);
rl?.close();
