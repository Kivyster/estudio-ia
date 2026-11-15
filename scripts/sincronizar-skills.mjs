// Gera SQL que iguala as skills do banco aos arquivos worker/skills/cargos/*.md
// uso: node scripts/sincronizar-skills.mjs > saida.sql
import { readFileSync, readdirSync } from 'node:fs';
const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";
const dir = new URL('../worker/skills/cargos/', import.meta.url);
for (const f of readdirSync(dir)) if (f.endsWith('.md'))
  console.log(`UPDATE cargos SET skill = ${q(readFileSync(new URL(f, dir), 'utf8'))} WHERE id = ${q(f.replace(/\.md$/, ''))};`);
