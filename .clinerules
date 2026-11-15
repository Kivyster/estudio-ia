<!-- GERADO por scripts/sincronizar-agentes.mjs a partir do AGENTS.md. Não edite aqui. -->
# Guia para agentes de IA (qualquer ferramenta)

> Este é o arquivo-fonte das instruções. Ele é lido diretamente por Codex, Cursor, Windsurf, Gemini CLI, Antigravity, Jules, OpenCode, Aider, Zed, Copilot e outros que seguem o padrão `AGENTS.md`; para os que usam outro nome de arquivo (`CLAUDE.md`, `GEMINI.md`, `.cursor/rules`, `.github/copilot-instructions.md`…) há cópias geradas por `node scripts/sincronizar-agentes.mjs`. **Edite só este arquivo** e rode o script.

Este repositório é o **Estúdio IA**: um escritório de agentes (IAs gratuitas) que produz jogos 2D. Seu trabalho é **ajudar a pessoa a instalar, configurar e personalizar** — sem gastar o tempo dela com o que o código já resolve.

## O que você precisa conseguir fazer

Basta **executar comandos de terminal e ler/criar arquivos**. Nenhum recurso específico de uma ferramenta é necessário (sem MCP, sem skills proprietárias). Tudo que você faria é: perguntar, escrever dois arquivos pequenos e rodar `node scripts/setup.mjs`.

- **Se você não tem terminal** (chat comum, LM Studio, etc.): conduza a entrevista abaixo, escreva o conteúdo de `setup.config.json` na resposta e instrua a pessoa a rodar `node scripts/setup.mjs` ela mesma — o assistente de instalação é independente de IA e pergunta tudo no terminal.
- **Modelos pequenos/locais**: siga a seção "Roteiro exato" literalmente, um passo por vez; não improvise comandos.

## Regras

1. **Nunca peça segredos no chat** (chaves de API, tokens, senhas). A pessoa os coloca no arquivo `.env` (copie de `.env.example`) ou digita no terminal quando o `setup.mjs` pedir (digitação oculta). Se ela colar um segredo no chat, avise para revogá-lo e criar outro.
2. **Não invente.** Antes de afirmar algo sobre provedor, cota ou funcionalidade, leia o código (`worker/src`) ou `docs/`.
3. **Confirme antes de criar coisas na conta da pessoa** (banco, Worker, repositório): diga o que será criado e o nome. O setup só cria recursos **gratuitos**; se algo pedir cartão ou plano pago, pare e avise.
4. Responda no idioma da pessoa. Seja direto. Não leia nem imprima o conteúdo do `.env`.

## Roteiro exato (instalação guiada)

**Passo 1 — verifique o ambiente.** Rode:
```bash
node scripts/setup.mjs --verificar
```
Ele imprime JSON e **não instala nada**. Leia `faltando` (lista do que falta: node, git, gh, login, chaves…) e `provedores` (quais chaves existem). Se `faltando` não estiver vazio, explique cada item (links em `docs/CONFIGURACAO.md`) e espere a pessoa resolver; rode `--verificar` de novo até `pronto_para_instalar` ser `true`.

**Passo 2 — entreviste** (uma pergunta por vez; só o que ainda não souber):
| Pergunta | Campo | Padrão |
|---|---|---|
| Nome do estúdio (letras, números, hífen; vira o nome do Worker e do banco) | `nome` | `estudio` |
| Nome do repositório PRIVADO de jogos | `repoAssets` | `<nome>-assets` |
| Quer controlar pelo Telegram? (precisa criar um bot no @BotFather) | `telegram` | `true` |
| Quer o robô que joga cada jogo no GitHub Actions? | `robo` | `true` |
| Quais chaves de API gratuitas já tem? (explique cada provedor em 1 linha com `provedores` do `--verificar`; **mínimo 1; Gemini é o mais importante**; 2 ou mais aguentam melhor as cotas) | (vai no `.env`) | — |
| Tem outra API compatível com OpenAI (DeepSeek, LM Studio/Ollama por túnel, Together…)? | `CUSTOM_*` no `.env` | não |

**Passo 3 — escreva a configuração (sem segredos).** Crie `setup.config.json` na raiz:
```json
{ "nome": "estudio", "repoAssets": "estudio-assets", "telegram": true, "robo": true }
```
Crie `.env` copiando `.env.example` **sem valores** e peça que a pessoa preencha as chaves **no arquivo, fora do chat**, dizendo exatamente quais variáveis e onde criar cada uma (`docs/CONFIGURACAO.md`). Rode `--verificar --config setup.config.json` de novo até `pronto_para_instalar: true`.

**Passo 4 — instale.**
```bash
node scripts/setup.mjs --dry-run --config setup.config.json   # mostra o que será feito (nada é criado)
node scripts/setup.mjs --config setup.config.json             # instala de verdade
```
É **idempotente**: se falhar no meio, corrija a causa e rode de novo. O setup cria o repositório privado e então **para pedindo um token do GitHub** (Contents: read/write só desse repositório): explique como criar (`docs/CONFIGURACAO.md`, seção 3), a pessoa o coloca em `GITHUB_ASSETS_TOKEN` no `.env`, e você roda o setup de novo.

**Passo 5 — verifique.** O setup termina com um teste. Confirme com a pessoa: o hub abre? a senha (`HUB_SENHA` no `.env`) funciona? `/status` responde no Telegram? Mostre a URL do hub.

### Problemas comuns
| Sintoma | Causa provável | O que fazer |
|---|---|---|
| `gh` não logado | GitHub CLI sem login | `gh auth login` |
| `wrangler login` abre o navegador e trava | login da Cloudflare pendente | concluir no navegador; `npx wrangler whoami` |
| Para em "Falta o GITHUB_ASSETS_TOKEN" | token ainda não criado | `docs/CONFIGURACAO.md` seção 3; pôr no `.env`; rodar de novo |
| `/status` não responde no Telegram | não mandou mensagem ao bot / webhook não registrado | mandar qualquer mensagem ao bot e rodar o setup de novo |
| Hub: "senha incorreta" | senha errada ou bloqueio por muitas tentativas (1 h) | ler `HUB_SENHA` no `.env`; esperar a próxima hora |
| Poucos funcionários ativos | poucas chaves | adicionar chaves ao `.env`, rodar o setup de novo |
| Tarefa "falhou" por cota | cota diária do provedor acabou | esperar a renovação (varia por provedor) ou adicionar outro provedor ao `.env` |

## Depois de instalado

- **Ajudar a escrever o GDD**: use `docs/GDD-MODELO.md`. Um bom GDD pede: gênero e visão (de lado/de cima), controles, mecânicas do núcleo, inimigos, a **fase 1** em detalhe (tamanho, o que ensina, itens/inimigos), visual (paleta/clima), som, vitória/derrota. O marco 1 é sempre o núcleo jogável; peça pouco por vez.
- **Personalizar**: `docs/PERSONALIZAR.md` (skills dos cargos, modelos, cargos novos, pacotes de arte, motor).
- **Depurar**: `npx wrangler tail` (em `worker/`), a tabela `eventos` (`npx wrangler d1 execute <nome> --remote --command "SELECT * FROM eventos ORDER BY id DESC LIMIT 20"`), o painel do hub e o relatório do robô em `projetos.ultimo_teste`.

## Mapa do código

- `worker/src/office.ts` — fila, execução, cadeia de fallback entre modelos, crítico, revisões.
- `worker/src/projetos.ts` — projetos em marcos, teste do robô, correções.
- `worker/src/render.ts` + `spritekit.ts`, `tilekit.ts`, `cenario.ts`, `audio.ts`, `estilo.ts`, `dados.ts` — renderizadores: transformam a especificação JSON dos modelos em arquivos reais e validam.
- `worker/src/providers.ts` — provedores de modelo (Gemini, Groq, NVIDIA, OpenRouter, Z.ai, DeepSeek, Cloudflare e `custom` = qualquer API compatível com OpenAI).
- `worker/src/biblioteca.ts` — busca e uso das peças CC0.
- `worker/skills/cargos/*.md` — a "mega-skill" de cada cargo (prompt de sistema; Markdown puro, independente de qualquer ferramenta). `worker/migracoes/` — banco. `worker/selecao/` — processo seletivo mensal.
- `assets-template/motor/` — o motor do jogo (`motor.js` + `API.md`).
- `hub/web/` — o escritório em pixel art.
- `scripts/setup.mjs` (instalador), `scripts/sincronizar-skills.mjs`, `scripts/sincronizar-agentes.mjs`.
