// Bíblia de estilo do projeto: o Diretor de arte define paleta, escala, luz e regras no marco 1;
// o código valida, gera a cartela de cores e todos os cargos de arte passam a obedecer.
import { png, extrairJSON, type Arquivo } from "./render";

type V3 = [number, number, number];
const hex = (h: string): V3 => { const m = String(h).replace("#", "").match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i); if (!m) throw new Error(`cor inválida na paleta: ${h}`); return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)]; };
const lum = ([r, g, b]: V3) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
// distância perceptual simples (redmean)
export function distCor(a: V3, b: V3) { const rm = (a[0] + b[0]) / 2, dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2]; return Math.sqrt((2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db); }
export const paraHex = (c: V3) => "#" + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
export const deHex = hex;

export type Estilo = {
  nome_estilo: string; paleta: Record<string, string>; tile: number; resolucao: [number, number]; tamanho_personagem: number;
  luz: string; contorno: string; clima: string; regras: string[]; referencias: string[]; som?: string; fundo?: string;
};

export function validarEstilo(s: any): Estilo {
  const pal = s.paleta && typeof s.paleta === "object" ? s.paleta : {};
  const cores = Object.entries(pal).map(([k, v]) => [k, hex(String(v))] as [string, V3]);
  if (cores.length < 8 || cores.length > 24) throw new Error(`paleta precisa de 8 a 24 cores nomeadas (veio ${cores.length})`);
  const ls = cores.map(([, c]) => lum(c));
  if (Math.min(...ls) > 45) throw new Error("paleta sem cor bem escura (contorno/sombra): inclua uma com luminância < 45");
  if (Math.max(...ls) < 200) throw new Error("paleta sem cor bem clara (brilho/texto): inclua uma com luminância > 200");
  for (let i = 0; i < cores.length; i++) for (let j = i + 1; j < cores.length; j++)
    if (distCor(cores[i][1], cores[j][1]) < 22) throw new Error(`cores quase iguais na paleta: ${cores[i][0]} e ${cores[j][0]}`);
  const tile = [8, 16, 24, 32].includes(Number(s.tile)) ? Number(s.tile) : 16;
  const res: [number, number] = Array.isArray(s.resolucao) && s.resolucao.length === 2 ? [Number(s.resolucao[0]) || 320, Number(s.resolucao[1]) || 180] : [320, 180];
  const regras = (Array.isArray(s.regras) ? s.regras : []).map(String).slice(0, 12);
  if (regras.length < 4) throw new Error("bíblia precisa de pelo menos 4 regras de estilo concretas");
  return {
    nome_estilo: String(s.nome_estilo ?? "estilo do projeto").slice(0, 80), paleta: Object.fromEntries(cores.map(([k, c]) => [k, paraHex(c)])),
    tile, resolucao: res, tamanho_personagem: [16, 24, 32, 48, 64].includes(Number(s.tamanho_personagem)) ? Number(s.tamanho_personagem) : tile * 2,
    luz: /direit/.test(String(s.luz)) ? "cima-direita" : "cima-esquerda", contorno: String(s.contorno ?? "seletivo").slice(0, 120),
    clima: String(s.clima ?? "").slice(0, 400), regras, referencias: (Array.isArray(s.referencias) ? s.referencias : []).map(String).slice(0, 6),
    som: s.som ? String(s.som).slice(0, 300) : undefined, fundo: s.fundo ? String(s.fundo).slice(0, 300) : undefined,
  };
}

// texto que vai na entrada de cada cargo de arte/código
export function textoDoEstilo(e: Estilo): string {
  return `## Bíblia de estilo do projeto (OBRIGATÓRIO seguir)
Estilo: ${e.nome_estilo}. Clima: ${e.clima}
Paleta fechada (use SÓ estas cores, pelos nomes): ${Object.entries(e.paleta).map(([k, v]) => `${k} ${v}`).join(" · ")}
Tile: ${e.tile}px · resolução do jogo: ${e.resolucao[0]}x${e.resolucao[1]} · personagem principal: ${e.tamanho_personagem}px · luz: ${e.luz} · contorno: ${e.contorno}
Regras:
${e.regras.map((r) => `- ${r}`).join("\n")}${e.fundo ? `\nCenário/fundo: ${e.fundo}` : ""}${e.som ? `\nSom: ${e.som}` : ""}${e.referencias.length ? `\nReferências: ${e.referencias.join(", ")}` : ""}`;
}

// prende uma cor à cor mais próxima da paleta do projeto
export function prenderNaPaleta(c: string, e: Estilo | null): string {
  if (!e) return c;
  if (e.paleta[c]) return e.paleta[c];
  const alvo = hex(c); let melhor = c, d = Infinity;
  for (const v of Object.values(e.paleta)) { const dd = distCor(alvo, hex(v)); if (dd < d) { d = dd; melhor = v; } }
  return melhor;
}

// cartela: faixas da paleta + escala de tile e personagem
export async function renderEstilo(t: string): Promise<Arquivo[]> {
  const e = validarEstilo(extrairJSON(t));
  const cores = Object.values(e.paleta).map(hex), n = cores.length, C = 32, W = Math.max(n * C, 256), H = C + 64;
  const img = new Uint8Array(W * H * 4);
  const pinta = (x: number, y: number, c: V3) => { const i = (y * W + x) * 4; img[i] = c[0]; img[i + 1] = c[1]; img[i + 2] = c[2]; img[i + 3] = 255; };
  const fundo = cores.reduce((a, c) => (lum(c) < lum(a) ? c : a));
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) pinta(x, y, fundo);
  cores.forEach((c, i) => { for (let y = 0; y < C; y++) for (let x = i * C; x < (i + 1) * C; x++) pinta(x, y, c); });
  // escala: um tile e a caixa do personagem principal, lado a lado
  const claro = cores.reduce((a, c) => (lum(c) > lum(a) ? c : a)), meio = cores[Math.floor(n / 2)];
  for (let y = 0; y < e.tile; y++) for (let x = 0; x < e.tile; x++) pinta(8 + x, C + 8 + y, (x + y) % 2 ? meio : claro);
  const P = Math.min(56, e.tamanho_personagem);
  for (let y = 0; y < P; y++) for (let x = 0; x < P; x++) if (x === 0 || y === 0 || x === P - 1 || y === P - 1) pinta(16 + e.tile + x, C + 4 + y, claro);
  return [
    { nome: "estilo_paleta.png", mime: "image/png", dados: await png(W, H, img), preview: true },
    { nome: "estilo.json", mime: "application/json", dados: new TextEncoder().encode(JSON.stringify(e, null, 1)) },
  ];
}
