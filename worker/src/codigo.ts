// Checagem de código antes de seguir pra equipe: sintaxe (acorn) e armadilhas comuns de jogo no navegador.
import { parse } from "acorn";

export function checarSintaxe(nome: string, codigo: string): string | null {
  try {
    parse(codigo, { ecmaVersion: "latest", sourceType: "script", allowReturnOutsideFunction: true, allowAwaitOutsideFunction: false });
    return null;
  } catch (e: any) {
    const l = e?.loc?.line ?? "?", c = e?.loc?.column ?? "?";
    const linha = String(codigo.split("\n")[(Number(l) || 1) - 1] ?? "").trim().slice(0, 120);
    return `${nome}: erro de sintaxe na linha ${l}, coluna ${c}: ${String(e?.message ?? e).replace(/\s*\(\d+:\d+\)$/, "")} → "${linha}"`;
  }
}

// avisos que não impedem rodar, mas quebram o jogo do estúdio
export function armadilhas(codigo: string): string[] {
  const a: string[] = [];
  if (/^\s*(import|export)\s/m.test(codigo)) a.push("usa import/export (o jogo é script comum, sem módulos)");
  if (/requestAnimationFrame\s*\(/.test(codigo)) a.push("usa requestAnimationFrame (o motor já tem o loop)");
  if (/addEventListener\(\s*["']key(down|up)/.test(codigo)) a.push("escuta teclado direto (use Motor.tecla/Motor.apertou)");
  if (/document\.write|alert\(|prompt\(/.test(codigo)) a.push("usa document.write/alert/prompt");
  return a;
}

// blocos de código de uma resposta em Markdown (programador)
export function blocosJS(texto: string): string[] {
  return [...texto.matchAll(/```(?:js|javascript)\s*\n([\s\S]*?)```/gi)].map((m) => m[1]);
}
