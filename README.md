# 🎮 Estúdio IA

**Um estúdio de jogos 2D onde IAs gratuitas são os funcionários.** Você manda um documento de design (GDD, em PDF) e uma equipe de 15 cargos — gerente, game designer, level designer, artista de sprite, artista de cenário, compositor, programador, QA, crítico… — cada um com um modelo de IA diferente, planeja, produz, se critica e monta um **jogo que roda no navegador**. Tudo em nuvem, no plano grátis, controlado pelo Telegram e por um escritório em pixel art.

> [English README](README.en.md)

```
 você ──PDF do GDD──▶  Hub (escritório pixel art)  ──▶  Worker (Cloudflare)  ──▶  15 cargos × modelos grátis
 Telegram ◀── avisos ──────────────────────────────────────┘                          │
                                                                                     ▼
                          repositório privado (GitHub) ◀── jogo, arte, fases, sons, música
                                   │
                                   └──▶ robô abre o jogo num navegador, JOGA e reporta erros ──▶ corrige e repete
```

## O que ele faz de diferente

- **Qualidade por código, não por sorte.** Modelo de texto não desenha pixel nem calcula salto; então os cargos descrevem e o **código executa**: sprites por partes com sombreamento e animação por ossos, fases com tileset e *autotile* + **validação de caminho simulando o pulo**, cenário em camadas, efeitos sonoros estilo sfxr, música chiptune por padrões.
- **Todo mundo é revisado.** Um **crítico** (que *vê* a arte e *ouve* o áudio) dá nota 0–10 e manda refazer abaixo de 7.
- **Motor de jogo próprio** (`assets-template/motor`): física de plataforma (coyote time, plataforma fina, rampas), inimigos prontos, câmera, diálogo com escolhas, HUD, pausa. Os modelos só escrevem o jogo em cima dele — o jogo sempre abre.
- **Robô que joga.** A cada marco, o GitHub Actions abre o jogo no Chromium, sai do título, anda, pula, tenta atravessar a fase e devolve o relatório pra equipe.
- **Biblioteca de ~10 mil peças CC0** (Kenney), já rotuladas por categoria e etiquetas, usadas como base de personagens e tiles.
- **Bíblia de estilo.** No marco 1 um diretor de arte define paleta, escala e regras; o código *prende* toda arte nessa paleta.
- **Gratuito de ponta a ponta** (Cloudflare Workers + D1, Gemini/Groq/NVIDIA/OpenRouter/Z.ai — e DeepSeek ou qualquer API compatível com OpenAI como reserva, GitHub). Sem cartão.

## Instalação (≈15 minutos)

Você precisa de: [Node.js 20+](https://nodejs.org), [git](https://git-scm.com), [GitHub CLI](https://cli.github.com) (`gh auth login`), uma conta grátis na [Cloudflare](https://dash.cloudflare.com/sign-up) e **pelo menos uma chave de API gratuita** (a do [Gemini](https://aistudio.google.com/apikey) é a mais importante).

```bash
git clone https://github.com/SEU-USUARIO/estudio-ia.git
cd estudio-ia
node scripts/setup.mjs
```

O assistente **pergunta o que falta** (nome, chaves de API, Telegram…), cria o banco, o repositório privado, publica o Worker e o hub, liga o Telegram e o robô de teste, e termina com um teste. Pode rodar de novo a qualquer hora: o que já está feito é pulado. As chaves ficam só no seu `.env`, que nunca vai para o git nem aparece na tela.

**Funciona com qualquer agente de IA — ou sem nenhum.** O instalador (`scripts/setup.mjs`) é um programa Node comum, independente de IA. Se quiser que um agente conduza (ele faz as perguntas, escreve a configuração e roda o setup), abra a pasta na ferramenta que você usa e diga *"configure o estúdio"*:

| Ferramenta | Lê |
|---|---|
| Claude Code | `CLAUDE.md` (importa o `AGENTS.md`) e a skill em `.claude/skills` |
| Codex, OpenCode, Jules, Aider, Zed e outros | `AGENTS.md` |
| Gemini CLI, Antigravity | `GEMINI.md` / `AGENTS.md` e `.agents/skills` |
| Cursor | `.cursor/rules/estudio.mdc` |
| GitHub Copilot | `.github/copilot-instructions.md` |
| Windsurf · Cline/Roo | `.windsurfrules` · `.clinerules` |
| DeepSeek, LM Studio, Ollama e outros chats ou harnesses | cole o `AGENTS.md` como instrução do sistema, ou rode `node scripts/setup.mjs` você mesmo |

Todas as cópias vêm de **um arquivo só** (`AGENTS.md`; regenere com `node scripts/sincronizar-agentes.mjs`). O agente só precisa rodar comandos e ler/criar arquivos — nenhum recurso proprietário. `node scripts/setup.mjs --verificar` imprime em JSON o que ainda falta, para qualquer agente (até modelos pequenos) seguir o roteiro. O agente **nunca** pede chaves no chat.

Guia passo a passo (onde criar cada chave, Telegram, token do GitHub): [`docs/CONFIGURACAO.md`](docs/CONFIGURACAO.md).

## Usando

1. Abra o hub (a URL aparece no fim do setup; a senha está em `HUB_SENHA` no `.env`).
2. Clique em **Enviar PDF** e mande o GDD do seu jogo. [`docs/GDD-MODELO.md`](docs/GDD-MODELO.md) tem um modelo.
3. A equipe trabalha em **marcos** (até 6): cada um planeja, produz, integra e é testado no navegador. Você acompanha no hub (painel **Jogos** tem o botão **Jogar**; **Entregas** mostra prévias e toca os sons) e pelo Telegram.

Comandos do Telegram: `/status`, `/pedido <texto>` (o gerente planeja e espera seu `/ok`), `/ok N`, `/cancelar N`, `/tarefa <cargo> <texto>` (manda direto a um cargo), `/resultado N`, `/cargos`, `/pedidos`.

## Personalizando

Tudo é editável — veja [`docs/PERSONALIZAR.md`](docs/PERSONALIZAR.md): mudar o que cada cargo faz (`worker/skills/cargos/*.md`), trocar os modelos de cada cargo, adicionar cargos, adicionar pacotes de arte, mudar o motor do jogo, o visual do hub.

Como as peças se encaixam: [`docs/COMO-FUNCIONA.md`](docs/COMO-FUNCIONA.md).

## Estrutura

```
worker/            o escritório: API, fila, cargos, renderizadores (sprite, fase, cenário, áudio…), banco (migrações + skills)
hub/               o escritório em pixel art (site estático)
assets-template/   vira o seu repositório PRIVADO: motor do jogo, biblioteca de peças CC0, robô de teste
scripts/           setup.mjs (assistente de instalação)
docs/              guias
AGENTS.md          instruções para QUALQUER agente de IA configurar tudo por você (CLAUDE.md, GEMINI.md, .cursor, .github… são cópias geradas)
```

## Limites honestos

- É um **gerador de protótipos jogáveis**, não um substituto para um time de arte. Sprites e fases ficam bons para jogos indie simples (plataforma, vista de cima); chefes elaborados, animação complexa e jogos 3D estão fora do escopo.
- O plano grátis tem cotas diárias por provedor: projetos grandes podem levar horas, e o escritório pausa quem estoura a cota.
- Os modelos erram: por isso existem validadores, crítico e robô de teste. Ainda assim, revise o que sai.

## Licença

Código: [MIT](LICENSE). Arte e peças de terceiros (CC0 e MIT): veja [`CREDITS.md`](CREDITS.md).
