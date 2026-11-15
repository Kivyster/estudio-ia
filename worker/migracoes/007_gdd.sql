-- GDD em PDF enviado pelo hub (o mais recente aparece no telão da sala de reunião)
CREATE TABLE IF NOT EXISTS gdd (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  dados TEXT NOT NULL,   -- base64 do PDF (até ~1,4 MB)
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);
