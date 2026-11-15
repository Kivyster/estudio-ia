-- Categoria de cota de cada funcionário (custo × benefício)
--   grande  = cota alta e confirmada (Groq 1.000 req/dia por modelo, Gemini Flash-Lite)
--   media   = cota razoável ou não publicada (NVIDIA, Cloudflare compartilhada, Z.ai, Gemini novos)
--   pequena = cota mínima (Gemini 3.5 Flash 20/dia, OpenRouter 50/dia somando tudo) → só reserva
-- pesado = 1 para modelos fortes e escassos: nunca titular de cargo fácil
ALTER TABLE funcionarios ADD COLUMN cota TEXT NOT NULL DEFAULT 'media';
ALTER TABLE funcionarios ADD COLUMN pesado INTEGER NOT NULL DEFAULT 0;

INSERT OR REPLACE INTO funcionarios (id, nome, provedor, modelo, cota, pesado) VALUES
  ('groq_oss',      'GPT-OSS 120B (Groq)',        'groq',       'openai/gpt-oss-120b',                     'grande', 0),
  ('groq_oss20',    'GPT-OSS 20B (Groq)',         'groq',       'openai/gpt-oss-20b',                      'grande', 0),
  ('groq_qwen',     'Qwen 3.8 27B (Groq)',        'groq',       'qwen/qwen3.8-27b',                        'grande', 0),
  ('gemini_lite',   'Gemini Flash-Lite',          'gemini',     'gemini-flash-lite-latest',                'grande', 0),
  ('gem_35lite',    'Gemini 3.5 Flash-Lite',      'gemini',     'gemini-3.5-flash-lite',                   'grande', 0),
  ('gem_3flash',    'Gemini 3 Flash',             'gemini',     'gemini-3-flash-preview',                  'media',  0),
  ('gem_hydrogen',  'Gemini 4 Hydrogen',          'gemini',     'gemini-4-hydrogen',                       'media',  1),
  ('gemini_flash',  'Gemini 3.5 Flash',           'gemini',     'gemini-3.5-flash',                        'pequena',0),
  ('nv_ultra',      'Nemotron Ultra 550B (NVIDIA)', 'nvidia',   'nvidia/nemotron-3-ultra-550b-a55b',       'media',  1),
  ('nv_mistral',    'Mistral Large 4 (NVIDIA)',   'nvidia',     'mistralai/mistral-large-4-1t-a52b',       'media',  1),
  ('nv_step5',      'Step 5 (NVIDIA)',            'nvidia',     'stepfun-ai/step-5-preview',               'media',  1),
  ('nv_minimax',    'MiniMax M3.1 Flash (NVIDIA)','nvidia',     'minimaxai/minimax-m3.1-flash',            'media',  0),
  ('nv_gemma',      'Gemma 4 31B (NVIDIA)',       'nvidia',     'google/gemma-4-31b-it',                   'media',  0),
  ('nv_supervl',    'Nemotron Super VL (NVIDIA)', 'nvidia',     'nvidia/nemotron-3.5-super-vl-120b-a12b',  'media',  0),
  ('nv_nemotron',   'Nemotron Lightning (NVIDIA)','nvidia',     'nvidia/nemotron-3.5-lightning-30b-a3b',   'media',  0),
  ('cf_llama70',    'Llama 3.3 70B (Cloudflare)', 'cloudflare', '@cf/meta/llama-3.3-70b-instruct-fp8-fast','media',  0),
  ('cf_qwencoder',  'Qwen Coder 32B (Cloudflare)','cloudflare', '@cf/qwen/qwen2.5-coder-32b-instruct',     'media',  0),
  ('cf_scout',      'Llama 4 Scout (Cloudflare)', 'cloudflare', '@cf/meta/llama-4-scout-17b-16e-instruct', 'media',  0),
  ('zai_glm',       'GLM 4.5 Flash (Z.ai)',       'zai',        'glm-4.5-flash',                           'media',  0),
  ('zai_glm47',     'GLM 4.7 Flash (Z.ai)',       'zai',        'glm-4.7-flash',                           'media',  0),
  ('or_free',       'OpenRouter grátis',          'openrouter', '*free*',                                  'pequena',0);

-- quebrados ou desativados ficam fora
UPDATE funcionarios SET ativo = 0 WHERE id IN ('cf_llama', 'nv_kimi', 'gh_gpt');
