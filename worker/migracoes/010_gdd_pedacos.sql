-- GDD em pedaços: cada linha do D1 aceita ~2 MB, então o PDF é dividido em partes de 1 MB
CREATE TABLE IF NOT EXISTS gdd_partes (gdd_id INTEGER NOT NULL, ordem INTEGER NOT NULL, dados TEXT NOT NULL, PRIMARY KEY (gdd_id, ordem));
