-- Hub: saber em qual tarefa (e cargo) cada funcionário está agora
ALTER TABLE funcionarios ADD COLUMN tarefa_atual INTEGER;
ALTER TABLE funcionarios ADD COLUMN cargo_atual TEXT;
