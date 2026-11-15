-- Bloqueio contra adivinhação de senha do hub: tentativas erradas por IP por hora
CREATE TABLE IF NOT EXISTS tentativas (ip TEXT NOT NULL, hora TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (ip, hora));
