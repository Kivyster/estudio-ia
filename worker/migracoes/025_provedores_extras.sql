-- 025: DeepSeek e provedor "custom" (qualquer API compatível com OpenAI).
-- Entram DESLIGADOS (ativo=0); o setup liga e acrescenta como reserva nas cadeias quando a pessoa fornece a chave.
INSERT OR IGNORE INTO funcionarios (id, nome, provedor, modelo, ativo, familia) VALUES
  ('deepseek_chat',     'DeepSeek Chat',     'deepseek', 'deepseek-chat',     0, 'generico'),
  ('deepseek_reasoner', 'DeepSeek Reasoner', 'deepseek', 'deepseek-reasoner', 0, 'generico'),
  ('custom_1',          'Modelo próprio',    'custom',   'troque-pelo-modelo', 0, 'generico');
