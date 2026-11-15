# Personalizando

## Mudar o que um cargo faz
Edite `worker/skills/cargos/<cargo>.md` (é o prompt de sistema do cargo). Depois grave no banco:
```bash
node scripts/sincronizar-skills.mjs > skills.sql
cd worker && npx wrangler d1 execute <nome> --remote --file ../skills.sql
```
Mantenha o **formato de resposta** descrito na skill: o renderizador espera aquele JSON.
A "régua" que o crítico usa por cargo fica na coluna `cargos.critica` (migrações `013`, `018`, `019`…).

## Trocar os modelos de um cargo
A coluna `cargos.cadeia` é a lista de funcionários em ordem (1º = titular, os demais = reservas):
```bash
npx wrangler d1 execute <nome> --remote --command "UPDATE cargos SET cadeia='[\"gemini_flash\",\"groq_oss\"]' WHERE id='programador'"
```
Os modelos estão na tabela `funcionarios`. Para adicionar um, faça `INSERT` com `provedor` (`gemini|groq|nvidia|openrouter|zai|cloudflare`), `modelo` e `familia` (ajustes por fabricante em `worker/skills/modelos/adaptadores.json`). Para usar outro provedor compatível com a API da OpenAI, acrescente-o em `BASES` em `worker/src/providers.ts` e a variável da chave em `worker/src/env.ts`.

O **processo seletivo** (`worker/selecao/`) mede cada modelo em provas por cargo e propõe as melhores cadeias. Gasta bastante cota:
```bash
ESTUDIO_URL=https://seu-worker.workers.dev node worker/selecao/rodar2.mjs .env
```

## Adicionar um cargo
1. `INSERT INTO cargos (id, nome, tipo, cadeia, skill)` com `tipo` = um renderizador existente (`texto`, `sprite_kit`, `mapa`, `som`, `musica`, `cenario`, `estilo`, `design`, `roteiro`, `repo`) — ou crie um renderizador novo em `worker/src/render.ts`.
2. Crie `worker/skills/cargos/<id>.md` e sincronize.
3. Avise o Gerente que ele existe: acrescente-o na lista "Equipe disponível" de `worker/skills/cargos/gerente.md`.
4. Hub (opcional): o nome em `CARGOS` de `hub/web/app.js` e a sala em `hub/web/mundo.js`.

## Adicionar pacotes de arte
Coloque as folhas PNG em `biblioteca/<pacote>/` do seu repositório de assets e acrescente as peças em `biblioteca/indice.json` (`id`, `arquivo`, `x`, `y`, `w`, `h`, `cat`, `tags`, `pacote`). Os rótulos do Kenney foram gerados por visão (Gemini) numerando as células de cada folha e conferidos por amostragem. Mais pacotes CC0: https://kenney.nl/assets e https://opengameart.org (confira a licença de cada um).

## Mudar o motor do jogo
`assets-template/motor/motor.js` (código) e `API.md` (o manual que os modelos recebem). O Worker copia `motor/` e `index.html` do repositório de assets para cada jogo a cada marco: edite no **seu** repositório privado. Se mudar a API, atualize o `API.md`.

## Mudar o visual do hub
`hub/web/` (HTML, CSS e JS puros). Publique de novo com `cd hub && npx wrangler deploy`.

## Mudar limites
Em `worker/src/office.ts`: tarefas em paralelo (`POR_CICLO`), nota mínima do crítico e revisões (`NOTA_MIN`, `MAX_REVISOES`), teto de cota (`TETO_COTA`), pausas. Em `worker/src/projetos.ts`: rodadas de correção e número de marcos. Depois de mudar o código, publique com `cd worker && npx wrangler deploy`.
