# 🎮 Estúdio IA (AI Studio)

**A 2D game studio where free AI models are the employees.** Send a design document (GDD, as a PDF) and a team of 15 roles — manager, game designer, level designer, sprite artist, scenery artist, composer, programmer, QA, critic… — each backed by a different model, plans, produces, reviews itself and assembles a **game that runs in the browser**. Everything runs in the cloud on free tiers, controlled from Telegram and a pixel-art office.

> Portuguese is the primary language: the role prompts ("skills"), the assistant's questions and most docs are in PT-BR. This README summarizes the project; the setup wizard and `CLAUDE.md` agent guide are in Portuguese, and any AI agent (e.g. Claude Code) can translate the conversation for you.

```
 you ──GDD PDF──▶  Hub (pixel-art office)  ──▶  Worker (Cloudflare)  ──▶  15 roles × free models
 Telegram ◀── notifications ───────────────────────────┘                          │
                                                                                  ▼
                       private GitHub repo ◀── game code, art, levels, sounds, music
                              │
                              └──▶ a robot opens the game in a real browser, PLAYS it, reports bugs ──▶ fix & repeat
```

## What makes it different

- **Quality from code, not luck.** Text models can't draw pixels or compute a jump, so roles *describe* and **code executes**: part-based sprites with shading and skeletal animation, levels with tilesets, autotiling and **path validation that simulates the jump**, layered parallax scenery, sfxr-style sound effects, tracker-style chiptune music.
- **Everything is reviewed.** A **critic** that can *see* art and *hear* audio scores 0–10 and sends work back below 7.
- **Its own game engine** (`assets-template/motor`): platformer physics (coyote time, one-way platforms, slopes), ready-made enemies, camera, branching dialogue, HUD, pause. Models only write the game on top of it, so the game always boots.
- **A robot that plays.** After each milestone, GitHub Actions opens the game in Chromium, leaves the title screen, walks, jumps, tries to cross the level, and reports back.
- **~10k CC0 art pieces** (Kenney), labeled by category and tags, used as bases for characters and tiles.
- **Style bible.** An art director defines palette, scale and rules in milestone 1; code snaps all art to that palette.
- **Free end to end** (Cloudflare Workers + D1, Gemini/Groq/NVIDIA/OpenRouter/Z.ai, GitHub). No credit card.

## Install (~15 minutes)

You need: [Node.js 20+](https://nodejs.org), [git](https://git-scm.com), [GitHub CLI](https://cli.github.com) (`gh auth login`), a free [Cloudflare](https://dash.cloudflare.com/sign-up) account and **at least one free API key** ([Gemini](https://aistudio.google.com/apikey) matters most).

```bash
git clone https://github.com/YOUR-USER/estudio-ia.git
cd estudio-ia
node scripts/setup.mjs
```

The wizard **asks for what's missing** (name, API keys, Telegram…), creates the database and a private repository, deploys the Worker and the hub, connects Telegram and the test robot, and ends with a smoke test. It is idempotent: re-run it any time. Keys live only in your local `.env` (git-ignored, never printed).

**Prefer an AI agent to drive it?** Open the folder in [Claude Code](https://claude.com/claude-code) and say *"set up the studio"*. [`CLAUDE.md`](CLAUDE.md) tells the agent how to interview you, write the config and run the setup — without ever asking for secrets in chat.

See [`docs/CONFIGURACAO.md`](docs/CONFIGURACAO.md) (where to create each key), [`docs/COMO-FUNCIONA.md`](docs/COMO-FUNCIONA.md) (architecture), [`docs/PERSONALIZAR.md`](docs/PERSONALIZAR.md) (customizing roles, models, art packs, engine) and [`docs/GDD-MODELO.md`](docs/GDD-MODELO.md) (GDD template).

## Honest limits

- It generates **playable prototypes**, not a replacement for an art team. Good for simple indie games (platformers, top-down); elaborate bosses, complex animation and 3D are out of scope.
- Free tiers have daily quotas: big projects can take hours.
- Models make mistakes — hence validators, the critic and the test robot. Still review what comes out.

## License

Code: [MIT](LICENSE). Third-party art (CC0 and MIT): see [`CREDITS.md`](CREDITS.md).
