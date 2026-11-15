# Como funciona

## Fluxo
1. **GDD (PDF)** chega pelo hub → o hub extrai o texto e cria um **projeto**.
2. Cada **marco** (até 6) começa com um pedido ao **Gerente**, que planeja tarefas e dependências. No marco 1, antes dele, o **Diretor de arte** define a **bíblia de estilo** (paleta fechada, escala, luz, regras).
3. As tarefas rodam em paralelo (3 por minuto, respeitando dependências). Cada cargo tem uma **cadeia de modelos**: se um falha ou estoura a cota, passa ao próximo. Falha de infraestrutura não pune o modelo.
4. A saída do modelo é uma **especificação JSON** (ou Markdown + bloco JSON). O **renderizador** do cargo a valida e gera os arquivos (PNG, `.tmj`, `.wav`…). Especificação inválida volta ao modelo com o erro exato.
5. O **Crítico** (outro modelo, que vê imagens e ouve áudio quando é Gemini) dá nota 0–10 com a régua do cargo; abaixo de 7 volta para refazer (até 2 vezes).
6. O **Integrador** monta `js/jogo.js` em cima do **motor** (`assets-template/motor`); o código é checado (sintaxe, armadilhas) e os assets citados precisam existir.
7. Tudo é gravado no repositório privado; o **robô** (GitHub Actions + Chromium) abre o jogo, joga e reporta. Falhou → o Integrador corrige (até 3 rodadas). Passou → próximo marco.
8. O **Editor** consolida o relatório do marco; avisos no Telegram.

## Cargos
| Cargo | Entrega | Validador / renderizador |
|---|---|---|
| gerente | plano de tarefas (JSON) | cargos e dependências válidos |
| diretor_arte | bíblia de estilo | paleta (contraste, cores distintas), regras |
| game_designer | documento + `config.json` | física do pulo (altura/distância em tiles), números |
| roteirista | texto + `dialogos.json` | tamanho de fala, escolhas apontam para cenas existentes |
| level_designer | fase (grade) | caminho jogável simulando o pulo; tileset pintado por código ou tiles Kenney |
| artista_sprite | sprite por partes + animações | silhueta, cores, quadros mudam; peça CC0 de base opcional |
| concept_artist (cenário) | camadas de parallax | profundidade, ordem dos fatores |
| sound_designer | efeitos estilo sfxr | duração, volume, som mudo |
| compositor | música chiptune | notas, escala, loop |
| programador | código (Markdown) | sintaxe dos blocos |
| qa | revisão | recebe o relatório do robô |
| critico | nota e problemas | — |
| integrador | `js/*.js` do jogo | sintaxe, assets existentes, usa o motor |
| editor | relatório final | — |
| pesquisador | pesquisa com fontes | — |

## Princípio central
Modelos de texto **descrevem**, o **código executa e mede**. Tudo o que tem medida (pixel, tile, salto, nota, compasso) sai de código; o modelo não "desenha". Quando algo não passa na validação, o erro volta ao modelo com a causa.

## Dados
Banco D1: `funcionarios` (modelos), `cargos` (skill, cadeia, régua do crítico), `pedidos`, `tarefas`, `arquivos` (saídas), `projetos` (marco, memória, estilo, config, último teste), `eventos`, `uso` (cota por dia), `avaliacoes` (processo seletivo).
