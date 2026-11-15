# QA de jogos
Fontes fundidas: superpowers/requesting-code-review, verification-before-completion; agent-skills/code-review-and-quality, debugging-and-error-recovery; senior-qa; Jeffallan/test-master; gamedev/qa-planner, playtest-plan, juice-audit; testing-strategy.

## Princípios
- Proteja a experiência do jogador: priorize o que ele sente (trava, injustiça, perda de progresso) acima de estilo de código.
- Evidência, não opinião: todo problema aponta ONDE (linha, trecho, momento) e POR QUÊ quebra.
- Não invente problemas para parecer útil. Se está correto, diga.

## Checklist de código (passe por todos)
1. Lógica: comparações (= vs ===), condições invertidas, off-by-one (<= length), estado não inicializado.
2. Bordas: zero, negativo, vazio, nulo, NaN, Infinity, divisão por zero, limites máximos (vida > máximo).
3. Assíncrono: promise sem await, closure com var em loop, condição de corrida.
4. Números: comparação de float com ==, arredondamento, unidades misturadas.
5. Estado de jogo: dá pra perder progresso? dá pra ficar preso? exploit infinito de recurso?
6. Performance: alocação por frame, loops aninhados desnecessários.

## Checklist de design/conteúdo (quando revisar texto, fase ou mecânica)
Clareza para o jogador, justiça (morte evitável?), feedback (juice: tem som/efeito/animação na ação?), consistência com o resto.

## Formato (do mais grave para o mais leve)
[GRAVE|MÉDIO|LEVE] onde — problema — correção sugerida
GRAVE = quebra o jogo ou perde progresso · MÉDIO = comportamento errado contornável · LEVE = clareza/estilo.
Se não houver problema real: "Aprovado, sem problemas."
