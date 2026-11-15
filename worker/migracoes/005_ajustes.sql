-- Ajustes de 15/11/2026: medidor de cota, aprovação por /ok, sprite híbrido, reseleção com proposta

-- limites conhecidos por funcionário (NULL = desconhecido; o medidor descobre quando estoura)
ALTER TABLE funcionarios ADD COLUMN limite_req_dia INTEGER;
ALTER TABLE funcionarios ADD COLUMN limite_tok_dia INTEGER;
ALTER TABLE funcionarios ADD COLUMN limite_descoberto INTEGER;   -- pedidos feitos no dia em que a cota estourou
ALTER TABLE funcionarios ADD COLUMN descoberto_em TEXT;

UPDATE funcionarios SET limite_req_dia = 1000, limite_tok_dia = 200000 WHERE provedor = 'groq';
UPDATE funcionarios SET limite_req_dia = 20 WHERE id = 'gemini_flash';
UPDATE funcionarios SET limite_req_dia = 50 WHERE id = 'or_free';

-- uso por dia (UTC) e funcionário
CREATE TABLE IF NOT EXISTS uso (
  dia TEXT NOT NULL,
  funcionario TEXT NOT NULL,
  pedidos INTEGER NOT NULL DEFAULT 0,
  tokens INTEGER NOT NULL DEFAULT 0,
  erros_cota INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (dia, funcionario)
);

-- configurações e propostas pendentes (ex.: resultado da reseleção esperando /ok_selecao)
CREATE TABLE IF NOT EXISTS config (chave TEXT PRIMARY KEY, valor TEXT NOT NULL, em TEXT NOT NULL DEFAULT (datetime('now')));

-- GitHub Models foi encerrado pelo GitHub em 30/07/2026
DELETE FROM funcionarios WHERE id = 'gh_gpt';

-- Editor: Gemini Flash-Lite titular (Qwen/Groq tem limite de 8 mil tokens/min, menor que uma entrega grande)
UPDATE cargos SET cadeia = '["gemini_lite","groq_qwen","gem_35lite","nv_supervl","or_free"]' WHERE id = 'editor';

-- Artista de Sprite: modo híbrido (o modelo descreve; o gerador desenha a forma; o código faz grade, paleta e animação)
UPDATE cargos SET tipo = 'sprite_hibrido', skill = 'Você é diretor de arte de pixel art. Você NÃO desenha pixels: você descreve o personagem para um gerador de imagem, e um programa converte a imagem em sprite com grade e paleta exatas.
Responda SOMENTE com JSON válido (sem comentários):
{"nome":"pinguim_slide","prompt_en":"<em inglês, 25 a 60 palavras: UM personagem/objeto só, corpo inteiro, de lado ou de frente, silhueta clara, cores chapadas, poucos detalhes, estilo pixel art/game sprite>",
 "tamanho":16,"cores":6,"animacao":"idle","frames":4,"descricao":"<1 frase em PT-BR>"}
Regras:
- tamanho: 16 ou 32 (use 16 para inimigos e itens simples, 32 para protagonista).
- cores: de 4 a 12.
- animacao: "idle" (respira: achata e estica), "pulo" (sobe e desce), "flutuar" (balança devagar) ou "nenhuma".
- frames: de 2 a 6.
- O prompt NÃO deve pedir fundo, cenário, texto nem mais de um personagem.' WHERE id = 'artista_sprite';
