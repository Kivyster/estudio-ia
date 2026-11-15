// Gera migracoes/008_skills.sql a partir de skills/cargos/*.md e skills/modelos/adaptadores.json
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";
const base = new URL('./', import.meta.url);
const linhas = ['-- Mega-skills por cargo + adaptador por família de modelo (gerado por skills/gerar-sql.mjs)',
  'CREATE TABLE IF NOT EXISTS adaptadores (familia TEXT PRIMARY KEY, texto TEXT NOT NULL, params TEXT NOT NULL DEFAULT \'{}\', fonte TEXT);',
  'ALTER TABLE funcionarios ADD COLUMN familia TEXT NOT NULL DEFAULT \'generico\';'];
for (const f of readdirSync(new URL('cargos/', base))) {
  const id = f.replace(/\.md$/, ''), txt = readFileSync(new URL('cargos/' + f, base), 'utf8');
  linhas.push(`UPDATE cargos SET skill = ${q(txt)} WHERE id = ${q(id)};`);
}
const ad = JSON.parse(readFileSync(new URL('modelos/adaptadores.json', base), 'utf8'));
for (const [fam, a] of Object.entries(ad)) linhas.push(`INSERT OR REPLACE INTO adaptadores (familia, texto, params, fonte) VALUES (${q(fam)}, ${q(a.texto)}, ${q(JSON.stringify(a.params))}, ${q(a.fonte)});`);
const familia = { gemini: "id LIKE 'gem%' OR id = 'gemini_lite' OR id = 'gemini_flash'", gptoss: "id IN ('groq_oss','groq_oss20')", qwen: "id IN ('groq_qwen','cf_qwencoder')", nemotron: "id IN ('nv_ultra','nv_supervl','nv_nemotron')", glm: "id LIKE 'zai_%'" };
for (const [fam, cond] of Object.entries(familia)) linhas.push(`UPDATE funcionarios SET familia = ${q(fam)} WHERE ${cond};`);
writeFileSync(new URL('../migracoes/008_skills.sql', base), linhas.join('\n') + '\n');
console.log('ok', linhas.length, 'comandos');
