# Guia para o agente (Claude Code ou similar)

Este repositório é o **Estúdio IA**: um escritório de agentes (IAs gratuitas) que produz jogos 2D. Seu trabalho aqui é **ajudar a pessoa a instalar, configurar e personalizar** — sem gastar o tempo dela com o que o código já resolve.

## Regras

1. **Nunca peça segredos no chat** (chaves de API, tokens, senhas). A pessoa coloca no arquivo `.env` (copie de `.env.example`) ou digita no terminal quando o `setup.mjs` pedir (a digitação é oculta). Se ela colar um segredo no chat, avise que ele deve ser revogado e recriado.
2. **Não invente.** Antes de afirmar algo sobre um provedor, cota ou funcionalidade, leia o código (`worker/src`) ou a documentação em `docs/`.
3. **Confirme antes de criar coisas na conta da pessoa** (banco, Worker, repositório): diga o que vai ser criado e o nome. O setup só cria recursos **gratuitos**; se algo pedir cartão ou plano pago, pare e avise.
4. Responda no idioma da pessoa. Seja direto.

## Instalação guiada (quando a pessoa pedir "configure o estúdio")

### 1. Confira o ambiente
Rode `node --version` (precisa ≥ 20), `git --version`, `gh auth status`. Se faltar algo, diga o que instalar (links no README) e espere.

### 2. Entreviste (uma pergunta por vez, só o que ainda não souber)
- Que **nome** dar ao estúdio? (vira o nome do Worker e do banco; padrão `estudio`)
- Qual o **nome do repositório privado** de jogos? (padrão `<nome>-assets`)
- Quer controlar pelo **Telegram**? (recomendado; precisa criar um bot no @BotFather)
- Quer o **robô de teste** que joga cada jogo no GitHub Actions? (recomendado; usa minutos grátis do Actions)
- Quais chaves de API gratuitas a pessoa **já tem**? Explique em uma linha cada provedor (de `scripts/setup.mjs`, tabela `PROVEDORES`) e onde criar. **Mínimo: 1 provedor; Gemini é o mais importante**; com 2 ou mais o estúdio aguenta bem as cotas.
- Que **tipo de jogo** quer fazer primeiro? (só para você ajudar depois com o GDD; não é configuração)

### 3. Monte a configuração (sem segredos)
Crie `setup.config.json` (ignorado pelo git):
```json
{ "nome": "estudio", "repoAssets": "estudio-assets", "telegram": true, "robo": true }
```
Crie `.env` a partir de `.env.example` **vazio** e peça que a pessoa preencha as chaves **no arquivo, fora do chat**. Diga exatamente quais variáveis e onde criar (veja `docs/CONFIGURACAO.md`).

### 4. Rode o setup
```bash
node scripts/setup.mjs --dry-run --config setup.config.json   # mostra o que será feito
node scripts/setup.mjs --config setup.config.json             # instala de verdade
```
Sem `--config` o setup pergunta tudo no terminal (a pessoa pode preferir). Ele é **idempotente**: se falhar no meio, corrija a causa e rode de novo.
O setup precisa de um token do GitHub (Contents: read/write só do repositório de assets), que só pode ser criado depois que o repositório existe: ele para e explica. Passo a passo em `docs/CONFIGURACAO.md`.

### 5. Verifique
O setup termina com um teste. Confirme com a pessoa: o hub abre? a senha (`HUB_SENHA` no `.env`) funciona? `/status` responde no Telegram? Mostre a URL do hub.

### Problemas comuns
| Sintoma | Causa provável | O que fazer |
|---|---|---|
| `gh: not logged in` | GitHub CLI sem login | `gh auth login` |
| `wrangler login` abre o navegador e trava | login da Cloudflare pendente | concluir no navegador; `npx wrangler whoami` |
| setup para em "Falta o GITHUB_ASSETS_TOKEN" | token ainda não criado | `docs/CONFIGURACAO.md`, seção do token; colocar no `.env`; rodar de novo |
| `/status` não responde no Telegram | não mandou mensagem ao bot / webhook não registrado | mandar qualquer mensagem ao bot, rodar o setup de novo |
| Hub abre mas "senha incorreta" | senha errada ou bloqueio por muitas tentativas (1 h) | ler `HUB_SENHA` no `.env`; esperar a próxima hora |
| Poucos funcionários ativos | poucas chaves | adicionar chaves ao `.env`, rodar o setup de novo |
| Tarefa "falhou" por cota | cota diária do provedor acabou | esperar a renovação (o horário varia por provedor) ou adicionar outro provedor ao `.env` |

## Depois de instalado

- **Ajudar a escrever o GDD**: use `docs/GDD-MODELO.md`. Um bom GDD pede: gênero e visão (de lado/de cima), controles, mecânicas do núcleo, inimigos, a **fase 1** em detalhe (tamanho, o que ensina, quantidade de itens/inimigos), visual (paleta/clima), som, vitória/derrota. Marco 1 sempre é o núcleo jogável; peça pouco por vez.
- **Personalizar**: `docs/PERSONALIZAR.md` (skills dos cargos, modelos, cargos novos, pacotes de arte, motor).
- **Depurar**: `npx wrangler tail` (logs do Worker, rode em `worker/`), tabela `eventos` do banco (`npx wrangler d1 execute <nome> --remote --command "SELECT * FROM eventos ORDER BY id DESC LIMIT 20"`), o painel do hub, e o resultado do robô em `projetos.ultimo_teste`.

## Mapa do código

- `worker/src/office.ts` — fila, execução, cadeia de fallback entre modelos, crítico, revisões.
- `worker/src/projetos.ts` — projetos em marcos, teste do robô, correções.
- `worker/src/render.ts` + `spritekit.ts`, `tilekit.ts`, `cenario.ts`, `audio.ts`, `estilo.ts`, `dados.ts` — os renderizadores: transformam a especificação JSON dos modelos em arquivos reais e validam.
- `worker/src/biblioteca.ts` — busca e uso das peças CC0.
- `worker/skills/cargos/*.md` — a "mega-skill" de cada cargo (o prompt de sistema). `worker/migracoes/` — banco. `worker/selecao/` — processo seletivo mensal que escolhe os melhores modelos por cargo.
- `assets-template/motor/motor.js` e `API.md` — o motor do jogo.
- `hub/web/` — o escritório pixel art.
