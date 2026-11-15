// Renderizadores: transformam a especificação (JSON) escrita pelo modelo em arquivo de verdade.
// Medida e forma saem daqui, por código — o modelo só descreve.
import type { Env } from "./env";

export type Arquivo = { nome: string; mime: string; dados: Uint8Array; preview?: boolean };

// falha de infraestrutura (gerador fora do ar / sem cota): não é culpa do modelo, não pausa ninguém
export class ErroInfra extends Error {}

export function extrairJSON(t: string): any {
  const sem = t.replace(/```(?:json)?/gi, "");
  const i = sem.indexOf("{"), f = sem.lastIndexOf("}");
  if (i < 0 || f <= i) throw new Error("a resposta não tem JSON");
  const bruto = sem.slice(i, f + 1);
  try { return JSON.parse(bruto); } catch { /* tenta limpar comentários e vírgulas sobrando */ }
  const limpo = bruto.replace(/^\s*\/\/.*$/gm, "").replace(/,\s*([}\]])/g, "$1");
  return JSON.parse(limpo);
}

// ---------- PNG ----------
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(b: Uint8Array) { let c = 0xffffffff; for (const x of b) c = CRC[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
async function deflate(b: Uint8Array) {
  const s = new Blob([b]).stream().pipeThrough(new CompressionStream("deflate"));
  return new Uint8Array(await new Response(s).arrayBuffer());
}
function chunk(tipo: string, dados: Uint8Array) {
  const out = new Uint8Array(12 + dados.length), dv = new DataView(out.buffer);
  dv.setUint32(0, dados.length);
  out.set(new TextEncoder().encode(tipo), 4); out.set(dados, 8);
  dv.setUint32(8 + dados.length, crc32(out.subarray(4, 8 + dados.length)));
  return out;
}
export async function png(w: number, h: number, rgba: Uint8Array): Promise<Uint8Array> {
  const raw = new Uint8Array((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) raw.set(rgba.subarray(y * w * 4, (y + 1) * w * 4), y * (w * 4 + 1) + 1);
  const ihdr = new Uint8Array(13), dv = new DataView(ihdr.buffer);
  dv.setUint32(0, w); dv.setUint32(4, h); ihdr.set([8, 6, 0, 0, 0], 8);
  const partes = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", await deflate(raw)), chunk("IEND", new Uint8Array())];
  const out = new Uint8Array(partes.reduce((a, p) => a + p.length, 0)); let o = 0;
  for (const p of partes) { out.set(p, o); o += p.length; }
  return out;
}
function hexRGB(h: string): [number, number, number] {
  const m = String(h).replace("#", "").match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) throw new Error(`cor inválida: ${h}`);
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}
export function ampliar(w: number, h: number, rgba: Uint8Array, k: number) {
  const W = w * k, H = h * k, out = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const s = ((Math.floor(y / k) * w) + Math.floor(x / k)) * 4, d = (y * W + x) * 4;
    out[d] = rgba[s]; out[d + 1] = rgba[s + 1]; out[d + 2] = rgba[s + 2]; out[d + 3] = rgba[s + 3];
  }
  return { W, H, out };
}
// fundo xadrez no preview pra mostrar a transparência
export function xadrez(W: number, H: number, rgba: Uint8Array, k: number) {
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const d = (y * W + x) * 4; const a = rgba[d + 3] / 255;
    const bg = ((Math.floor(x / k) + Math.floor(y / k)) & 1) ? 200 : 235;
    for (let c = 0; c < 3; c++) rgba[d + c] = Math.round(rgba[d + c] * a + bg * (1 - a));
    rgba[d + 3] = 255;
  }
}

// Integrador: arquivos do jogo web (texto), com caminhos seguros
const MIMES: Record<string, string> = { html: "text/html", js: "text/javascript", css: "text/css", md: "text/markdown", json: "application/json" };
export function renderRepo(t: string): Arquivo[] {
  const j = extrairJSON(t);
  const lista = (Array.isArray(j.arquivos) ? j.arquivos : []).slice(0, 12);
  if (!lista.length) throw new Error("integrador não devolveu arquivos");
  // index.html e motor/ são fixos do estúdio: o que o integrador mandar nesses caminhos é ignorado
  return lista.filter((a: any) => { const c = String(a.caminho ?? "").replace(/^\/+/, ""); return c !== "index.html" && !c.startsWith("motor/"); }).map((a: any) => {
    const c = String(a.caminho ?? "").replace(/\\/g, "/").replace(/^\/+/, "");
    if (!c || c.includes("..") || c.startsWith("assets/") || !/^[\w./-]+$/.test(c)) throw new Error(`caminho inválido: ${c}`);
    const ext = c.split(".").pop() ?? "";
    if (!MIMES[ext]) throw new Error(`tipo de arquivo não permitido: ${c}`);
    return { nome: c, mime: MIMES[ext], dados: new TextEncoder().encode(String(a.conteudo ?? "")) };
  });
}

export async function renderizar(env: Env, tipo: string, texto: string, estilo: any = null): Promise<Arquivo[]> {
  if (tipo === "design") return (await import("./dados")).renderDesign(texto, estilo?.tile ?? 16);
  if (tipo === "roteiro") return (await import("./dados")).renderRoteiro(texto);
  if (tipo === "estilo") return (await import("./estilo")).renderEstilo(texto);
  if (tipo === "sprite_kit") return (await import("./spritekit")).renderSpriteKit(env, texto, estilo);
  if (tipo === "repo") return renderRepo(texto);
  if (tipo === "mapa") return (await import("./tilekit")).renderFase(texto, estilo, env);
  if (tipo === "som") return (await import("./audio")).renderSons(texto);
  if (tipo === "musica") return (await import("./audio")).renderMusica(texto);
  if (tipo === "cenario") return (await import("./cenario")).renderCenario(texto, estilo);
  return [];
}
