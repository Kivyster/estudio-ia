#!/usr/bin/env node
// Gera os arquivos de instruções de cada ferramenta de agente a partir do AGENTS.md (única fonte).
//   node scripts/sincronizar-agentes.mjs          grava os arquivos
//   node scripts/sincronizar-agentes.mjs --check  só confere se estão em dia (sai com 1 se não)
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const fonte = readFileSync(join(RAIZ, 'AGENTS.md'), 'utf8').replace(/\r\n/g, '\n');
const AVISO = '<!-- GERADO por scripts/sincronizar-agentes.mjs a partir do AGENTS.md. Não edite aqui. -->\n';
const DESC = 'Instala, configura e personaliza o Estúdio IA (escritório de agentes que faz jogos 2D com IAs gratuitas). Use quando a pessoa pedir para configurar, instalar ou ajustar o estúdio, ou ajudar a escrever o GDD.';

const arquivos = {
  // Claude Code: importa o AGENTS.md (mantém uma única fonte)
  'CLAUDE.md': `${AVISO}@AGENTS.md\n`,
  // Gemini CLI / Antigravity: lê GEMINI.md
  'GEMINI.md': AVISO + fonte,
  // Cursor
  '.cursor/rules/estudio.mdc': `---\ndescription: ${DESC}\nalwaysApply: true\n---\n${AVISO}${fonte}`,
  // GitHub Copilot (chat e agente)
  '.github/copilot-instructions.md': AVISO + fonte,
  // Windsurf
  '.windsurfrules': AVISO + fonte,
  // Cline / Roo
  '.clinerules': AVISO + fonte,
  // Agent Skills (padrão aberto SKILL.md: Claude Code em .claude/skills; Codex, Gemini CLI e outros em .agents/skills)
  '.claude/skills/estudio-setup/SKILL.md': `---\nname: estudio-setup\ndescription: ${DESC}\n---\n${AVISO}${fonte}`,
  '.agents/skills/estudio-setup/SKILL.md': `---\nname: estudio-setup\ndescription: ${DESC}\n---\n${AVISO}${fonte}`,
};

let fora = 0;
for (const [caminho, conteudo] of Object.entries(arquivos)) {
  const alvo = join(RAIZ, caminho);
  const atual = existsSync(alvo) ? readFileSync(alvo, 'utf8').replace(/\r\n/g, '\n') : null;
  if (process.argv.includes('--check')) { if (atual !== conteudo) { console.log('desatualizado:', caminho); fora++; } continue; }
  mkdirSync(dirname(alvo), { recursive: true });
  if (atual !== conteudo) { writeFileSync(alvo, conteudo); console.log('gravado:', caminho); }
}
if (process.argv.includes('--check')) { console.log(fora ? `${fora} arquivo(s) fora de sincronia` : 'tudo em dia'); process.exit(fora ? 1 : 0); }
