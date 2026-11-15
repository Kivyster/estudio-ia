// mesmo extrator de JSON do Worker (tolera ``` , comentários e vírgulas sobrando)
export function extrair(t) {
  const sem = String(t).replace(/```(?:json)?/gi, '');
  const i = sem.indexOf('{'), f = sem.lastIndexOf('}');
  if (i < 0 || f <= i) throw new Error('sem JSON');
  const bruto = sem.slice(i, f + 1);
  try { return JSON.parse(bruto); } catch {}
  return JSON.parse(bruto.replace(/^\s*\/\/.*$/gm, '').replace(/,\s*([}\]])/g, '$1'));
}

// Executa código gerado por modelo FORA deste processo: Node com --permission (sem acesso a arquivos,
// sem criar processos), limite de 3 s. vm.runInContext não é sandbox de segurança.
import { spawnSync } from 'node:child_process';
export function rodarIsolado(codigo, nomeFuncao, casos) {
  const script = `${codigo}\n;const __f = ${nomeFuncao}; const __c = ${JSON.stringify(casos)};` +
    `const __r = __c.map((a) => { try { return { ok: true, v: __f(...structuredClone(a)) }; } catch (e) { return { ok: false, e: String(e && e.message) }; } });` +
    `process.stdout.write(JSON.stringify(__r));`;
  const r = spawnSync(process.execPath, ['--permission', '-e', script], { timeout: 3000, encoding: 'utf8', maxBuffer: 1 << 20 });
  if (r.status !== 0) throw new Error((r.stderr || 'falhou').split('\n').find((l) => /Error/.test(l)) || 'não executou');
  return JSON.parse(r.stdout);
}
