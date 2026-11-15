-- Escritório de agentes — banco D1

CREATE TABLE IF NOT EXISTS funcionarios (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  provedor TEXT NOT NULL,          -- gemini | groq | openrouter | nvidia | zai | github | cloudflare
  modelo TEXT NOT NULL,
  ativo INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'ocioso',   -- ocioso | trabalhando | pausado
  pausado_ate TEXT,                         -- cota estourada: volta sozinho depois disso
  falhas_seguidas INTEGER NOT NULL DEFAULT 0,
  tarefas_feitas INTEGER NOT NULL DEFAULT 0,
  tokens_usados INTEGER NOT NULL DEFAULT 0,
  ultima_atividade TEXT
);

CREATE TABLE IF NOT EXISTS cargos (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  skill TEXT NOT NULL,             -- instruções exatas do cargo (system prompt)
  cadeia TEXT NOT NULL,            -- JSON: ids de funcionários, titular primeiro, depois reservas
  pesquisa_web INTEGER NOT NULL DEFAULT 0,  -- injeta busca Tavily antes de chamar o modelo
  pesado INTEGER NOT NULL DEFAULT 0         -- 1 = só roda no braço Oracle (fase 4)
);

CREATE TABLE IF NOT EXISTS pedidos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  texto TEXT NOT NULL,
  origem TEXT NOT NULL DEFAULT 'api',
  status TEXT NOT NULL DEFAULT 'planejando',  -- planejando | em_andamento | concluido | falhou
  criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  concluido_em TEXT
);

CREATE TABLE IF NOT EXISTS tarefas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pedido_id INTEGER,
  cargo TEXT NOT NULL,
  entrada TEXT NOT NULL,
  depende_de TEXT NOT NULL DEFAULT '[]',   -- JSON: ids de tarefas que precisam terminar antes
  status TEXT NOT NULL DEFAULT 'pendente', -- pendente | rodando | concluida | falhou
  funcionario TEXT,
  resultado TEXT,
  erro TEXT,
  tentativas INTEGER NOT NULL DEFAULT 0,
  tokens INTEGER NOT NULL DEFAULT 0,
  criada_em TEXT NOT NULL DEFAULT (datetime('now')),
  iniciada_em TEXT,
  concluida_em TEXT
);
CREATE INDEX IF NOT EXISTS idx_tarefas_status ON tarefas(status);
CREATE INDEX IF NOT EXISTS idx_tarefas_pedido ON tarefas(pedido_id);

CREATE TABLE IF NOT EXISTS eventos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  em TEXT NOT NULL DEFAULT (datetime('now')),
  funcionario TEXT,
  tipo TEXT NOT NULL,
  texto TEXT
);
CREATE INDEX IF NOT EXISTS idx_eventos_em ON eventos(em);

-- Processo seletivo: nota de cada funcionário em cada prova
CREATE TABLE IF NOT EXISTS avaliacoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rodada TEXT NOT NULL,
  funcionario TEXT NOT NULL,
  prova TEXT NOT NULL,
  nota REAL NOT NULL,
  ms INTEGER,
  detalhe TEXT,
  em TEXT NOT NULL DEFAULT (datetime('now'))
);
