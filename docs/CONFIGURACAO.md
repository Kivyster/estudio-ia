# Configuração passo a passo

O `node scripts/setup.mjs` faz quase tudo. Este guia mostra **onde criar cada chave** e o que fazer à mão.

## 1. Contas (todas grátis, sem cartão)

| Conta | Para quê | Link |
|---|---|---|
| Cloudflare | Worker (cérebro), banco D1, hub | https://dash.cloudflare.com/sign-up |
| GitHub | repositório privado dos jogos + robô de teste | https://github.com/signup |
| Telegram (opcional) | controlar e receber avisos | https://telegram.org |

Instale: [Node.js 20+](https://nodejs.org), [git](https://git-scm.com), [GitHub CLI](https://cli.github.com) e rode `gh auth login`.

## 2. Chaves de API dos modelos (todas gratuitas)

Preencha no `.env` (cópia de `.env.example`) as que tiver. **Mínimo 1; recomendo 2 ou mais.**

| Variável | Onde criar | Para quê |
|---|---|---|
| `GEMINI_API_KEY` | https://aistudio.google.com/apikey | **a mais importante**: único que ouve áudio e vê imagem (crítico), bom em código |
| `GROQ_API_KEY` | https://console.groq.com/keys | muito rápido (gerente, programador, QA) |
| `NVIDIA_API_KEY` | https://build.nvidia.com → Get API Key | modelos grandes (Nemotron): design e reservas |
| `OPENROUTER_API_KEY` | https://openrouter.ai/keys | reserva final (modelos `:free`) |
| `ZAI_API_KEY` | https://z.ai → API Keys | GLM Flash: QA e sons |
| `TAVILY_API_KEY` (opcional) | https://tavily.com | pesquisa na web do cargo Pesquisador |
| `DEEPSEEK_API_KEY` (opcional, **pago**) | https://platform.deepseek.com/api_keys | reserva barata em todos os cargos (não há plano grátis) |
| `CUSTOM_BASE_URL`, `CUSTOM_MODEL`, `CUSTOM_API_KEY` (opcional) | seu provedor | qualquer API compatível com OpenAI como reserva (Together, Mistral, Azure OpenAI, vLLM…) |

**Modelo local (LM Studio, Ollama)?** O Worker roda na nuvem e não enxerga o `localhost` do seu computador. Dá para usar como reserva expondo o servidor local por um túnel (por exemplo `cloudflared tunnel --url http://localhost:1234`) e pondo a URL do túnel (terminando em `/v1`) em `CUSTOM_BASE_URL`. Só funciona com o computador ligado e o modelo carregado, e modelos locais costumam ser lentos demais para os 15 cargos: use como reserva, não como titular.

Os limites gratuitos mudam com o tempo. O escritório mede o uso de cada modelo por dia e passa para o próximo da cadeia quando um estoura.

## 3. Token do GitHub (só do repositório de assets)

O Worker grava os jogos num repositório **privado** seu. Ele precisa de um token com acesso **só** a esse repositório:

1. Deixe o setup criar o repositório (passo 3 do assistente) — ele para e pede o token.
2. Abra https://github.com/settings/personal-access-tokens/new
3. *Token name*: `estudio`; *Expiration*: 1 ano; *Repository access*: **Only select repositories** → escolha o repositório de assets.
4. *Permissions → Repository permissions → Contents*: **Read and write**. Mais nada.
5. Gere, copie e cole no terminal quando o setup pedir (ou ponha em `GITHUB_ASSETS_TOKEN` no `.env` e rode o setup de novo).

## 4. Telegram (opcional)

1. No Telegram, converse com **@BotFather** → `/newbot` → escolha nome e usuário → copie o **token**.
2. Cole em `TELEGRAM_BOT_TOKEN` (ou no terminal quando o setup pedir).
3. **Mande uma mensagem qualquer** para o seu bot. O setup descobre o seu `TELEGRAM_CHAT_ID` sozinho (só esse chat controla o escritório; mensagens de outras pessoas são ignoradas).
4. Teste: `/status`.

## 5. Depois do setup

- **Hub**: a URL aparece no fim; a senha está em `HUB_SENHA` no `.env`. Depois de 8 senhas erradas na mesma hora o IP é bloqueado até a próxima hora.
- **Rodar de novo**: `node scripts/setup.mjs` pula o que já existe. Para adicionar uma chave nova, ponha no `.env` e rode de novo.
- **Atualizar** (ao baixar uma versão nova deste repositório): o setup não reaplica migrações num banco já instalado. Aplique só as novas com `cd worker && npx wrangler d1 execute <nome> --remote --file migracoes/0NN_xxx.sql` e rode `node scripts/setup.mjs` para republicar o Worker e o hub.

## Remover tudo

- Worker e hub: https://dash.cloudflare.com → Workers & Pages → apagar `<nome>` e `<nome>-hub`.
- Banco: Storage & Databases → D1 → apagar `<nome>`.
- Repositório de assets: `gh repo delete <usuario>/<nome>-assets`.
- Revogue o token do GitHub e as chaves de API nos sites dos provedores.
