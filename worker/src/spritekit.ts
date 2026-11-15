// Sprite por código com técnica de pixel artist: o modelo descreve PARTES (formas vetoriais + material),
// o código rasteriza e aplica volume, rampa de cor com hue shift, sombra de contato, contorno seletivo,
// anti-aliasing manual, limpeza de pixel órfão e animação por ossos (re-rasteriza cada quadro, sem borrar).
import { png, ampliar, xadrez, extrairJSON, type Arquivo } from "./render";
import { pecaDaBiblioteca } from "./biblioteca";
import { prenderNaPaleta, type Estilo } from "./estilo";

type V = [number, number];
type Parte = {
  nome: string; cor: string; material: string; forma: string; z: number; osso: string; dither: boolean;
  cx: number; cy: number; rx: number; ry: number; x: number; y: number; w: number; h: number; raio: number;
  pontos: V[]; esp: number; pivo: V; rot: number;
};
export type Mat = { niveis: number; contraste: number; brilho: boolean; emissivo?: boolean; aspero?: boolean };
export const MATERIAIS: Record<string, Mat> = {
  pele: { niveis: 3, contraste: 0.9, brilho: false }, tecido: { niveis: 3, contraste: 1, brilho: false, aspero: true },
  couro: { niveis: 4, contraste: 1.1, brilho: false }, cabelo: { niveis: 4, contraste: 1.2, brilho: true },
  metal: { niveis: 5, contraste: 1.6, brilho: true }, madeira: { niveis: 4, contraste: 1.1, brilho: false, aspero: true },
  pedra: { niveis: 4, contraste: 1.2, brilho: false, aspero: true }, gema: { niveis: 4, contraste: 1.5, brilho: true },
  plastico: { niveis: 3, contraste: 1, brilho: true }, organico: { niveis: 3, contraste: 1, brilho: false },
  brilho: { niveis: 2, contraste: 0.4, brilho: false, emissivo: true }, olho: { niveis: 1, contraste: 0, brilho: false, emissivo: true },
};

// ---------- cor ----------
export const hex2rgb = (h: string): V3 => { const m = String(h).replace("#", "").match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i); if (!m) throw new Error(`cor inválida: ${h}`); return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)]; };
export type V3 = [number, number, number];
function rgb2hsl([r, g, b]: V3): V3 {
  r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = mx === r ? ((g - b) / d + (g < b ? 6 : 0)) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
function hsl2rgb([h, s, l]: V3): V3 {
  h = ((h % 360) + 360) % 360; s = Math.max(0, Math.min(1, s)); l = Math.max(0, Math.min(1, l));
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}
// desloca o matiz em direção a um alvo (sombra → azul/roxo 250°, luz → amarelo 55°)
const puxar = (h: number, alvo: number, graus: number) => { let d = ((alvo - h + 540) % 360) - 180; return h + Math.sign(d) * Math.min(Math.abs(d), graus); };
// rampa: índice 0 = mais escuro … n-1 = mais claro; a cor base fica no meio
export function rampa(base: V3, m: Mat): V3[] {
  const [h, s, l] = rgb2hsl(base); const n = m.niveis; if (n === 1) return [base];
  const meio = Math.floor((n - 1) / 2), out: V3[] = [];
  for (let i = 0; i < n; i++) {
    const k = i - meio; // negativo = sombra
    if (k === 0) { out.push(base); continue; }
    const passo = 0.11 * m.contraste * Math.abs(k);
    out.push(k < 0
      ? hsl2rgb([puxar(h, 250, 14 * -k), Math.min(1, s * 1.08 + 0.04), l - passo])
      : hsl2rgb([puxar(h, 55, 10 * k), s * 0.92, l + passo * 0.85]));
  }
  return out;
}
export const escurecer = (c: V3, f: number): V3 => { const [h, s, l] = rgb2hsl(c); return hsl2rgb([puxar(h, 250, 20), Math.min(1, s + 0.1), l * f]); };
export const misturar = (a: V3, b: V3, t = 0.5): V3 => [0, 1, 2].map((i) => Math.round(a[i] * (1 - t) + b[i] * t)) as V3;

// ---------- formas ----------
function dentro(p: Parte, x: number, y: number): boolean {
  // transforma o centro do pixel para o espaço local (desfaz a rotação do osso em volta do pivô)
  if (p.rot) { const c = Math.cos(-p.rot), s = Math.sin(-p.rot), dx = x - p.pivo[0], dy = y - p.pivo[1]; x = p.pivo[0] + dx * c - dy * s; y = p.pivo[1] + dx * s + dy * c; }
  switch (p.forma) {
    case "elipse": return ((x - p.cx) / p.rx) ** 2 + ((y - p.cy) / p.ry) ** 2 <= 1;
    case "ret": {
      if (x < p.x || y < p.y || x > p.x + p.w || y > p.y + p.h) return false;
      const r = Math.min(p.raio, p.w / 2, p.h / 2); if (r <= 0) return true;
      const qx = Math.max(p.x + r - x, 0, x - (p.x + p.w - r)), qy = Math.max(p.y + r - y, 0, y - (p.y + p.h - r));
      return qx * qx + qy * qy <= r * r;
    }
    case "poli": {
      let ins = false; const P = p.pontos;
      for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
        const [xi, yi] = P[i], [xj, yj] = P[j];
        if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) ins = !ins;
      }
      return ins;
    }
    case "linha": {
      const r2 = (p.esp / 2) ** 2;
      for (let i = 1; i < p.pontos.length; i++) {
        const [ax, ay] = p.pontos[i - 1], [bx, by] = p.pontos[i], vx = bx - ax, vy = by - ay;
        const t = Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / (vx * vx + vy * vy || 1)));
        if ((x - ax - t * vx) ** 2 + (y - ay - t * vy) ** 2 <= r2) return true;
      }
      return false;
    }
  }
  return false;
}

function lerParte(o: any, i: number, N: number): Parte {
  const n = (v: any, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
  const pts: V[] = (Array.isArray(o.pontos) ? o.pontos : []).slice(0, 24).map((q: any) => [n(q?.[0]), n(q?.[1])] as V);
  let forma = String(o.forma ?? "elipse"); if (forma === "circulo") forma = "elipse";
  if (!["elipse", "ret", "poli", "linha"].includes(forma)) throw new Error(`forma desconhecida na parte ${o.nome}: ${forma}`);
  if ((forma === "poli" && pts.length < 3) || (forma === "linha" && pts.length < 2)) throw new Error(`parte ${o.nome}: pontos insuficientes`);
  const r = n(o.r, 0);
  const p: Parte = {
    nome: String(o.nome ?? `parte${i}`), cor: String(o.cor ?? ""), material: MATERIAIS[o.material] ? o.material : "tecido",
    forma, z: n(o.z, i), osso: String(o.osso ?? "corpo"), dither: !!o.dither,
    cx: n(o.cx), cy: n(o.cy), rx: Math.max(0.5, n(o.rx, r)), ry: Math.max(0.5, n(o.ry, r)),
    x: n(o.x), y: n(o.y), w: n(o.w), h: n(o.h), raio: n(o.raio), pontos: pts, esp: Math.max(1, n(o.espessura, 1.5)),
    pivo: [n(o.pivo?.[0], NaN), n(o.pivo?.[1], NaN)], rot: 0,
  };
  if (!Number.isFinite(p.pivo[0])) p.pivo = forma === "elipse" ? [p.cx, p.cy - p.ry] : forma === "ret" ? [p.x + p.w / 2, p.y] : pts[0] ?? [N / 2, N / 2];
  return p;
}

// ---------- animação por ossos ----------
const OSSOS_PERNA = (o: string) => /perna|pe_|pé/.test(o), OSSOS_BRACO = (o: string) => /braco|braço|mao|mão|arma/.test(o);
function pose(tipo: string, i: number, n: number, N: number) {
  const t = (i / n) * Math.PI * 2, s = Math.sin(t), u = N / 32;
  return (p: Parte): { dx: number; dy: number; rot: number; giro?: number } => {
    const lado = /_d$|direit/.test(p.osso) ? 1 : -1, cabeca = /cabe/.test(p.osso);
    switch (tipo) {
      case "andar":
        if (OSSOS_PERNA(p.osso)) return { dx: 0, dy: 0, rot: lado * s * 0.45 };
        if (OSSOS_BRACO(p.osso)) return { dx: 0, dy: Math.round(Math.abs(s) * -u), rot: -lado * s * 0.4 };
        return { dx: 0, dy: Math.round(Math.abs(s) * -u), rot: 0 };
      case "ataque": {
        const f = i / Math.max(1, n - 1); // antecipação → golpe → recuperação
        const ang = f < 0.4 ? -1.1 * (f / 0.4) : f < 0.7 ? -1.1 + 2.4 * ((f - 0.4) / 0.3) : 1.3 * (1 - (f - 0.7) / 0.3);
        const golpe = f > 0.4 && f < 0.8, prep = f <= 0.4;
        const avanco = golpe ? Math.round(2 * u) : prep ? -Math.round(u) : 0;
        if (OSSOS_BRACO(p.osso)) return lado === 1 ? { dx: avanco, dy: 0, rot: ang } : { dx: avanco, dy: 0, rot: golpe ? -0.6 : 0.3 * f };
        if (OSSOS_PERNA(p.osso)) return { dx: 0, dy: 0, rot: golpe ? lado * 0.35 : prep ? -lado * 0.15 : 0 };
        return { dx: avanco, dy: golpe ? Math.round(u) : 0, rot: 0 };
      }
      case "dano": { // tranco pra trás, cabeça joga, braços abrem; o 1º quadro pisca branco
        const f = i / Math.max(1, n - 1), forca = 1 - f;
        const base = { dx: -Math.round(2 * u * forca), dy: 0, rot: 0 };
        if (/cabe/.test(p.osso)) return { ...base, rot: -0.35 * forca };
        if (OSSOS_BRACO(p.osso)) return { ...base, rot: lado * -0.7 * forca };
        if (OSSOS_PERNA(p.osso)) return { dx: 0, dy: 0, rot: lado * 0.15 * forca };
        return base;
      }
      case "morte": { // cai de costas girando sobre os pés; membros amolecem
        const f = i / Math.max(1, n - 1);
        const giro = -1.45 * Math.min(1, f * 1.15);
        if (OSSOS_BRACO(p.osso)) return { dx: 0, dy: 0, rot: -0.5 * f, giro }; // braços acompanham a queda (arma cai junto)
        if (/cabe/.test(p.osso)) return { dx: 0, dy: 0, rot: 0.3 * f, giro };
        return { dx: 0, dy: 0, rot: OSSOS_PERNA(p.osso) ? lado * 0.2 * f : 0, giro };
      }
      case "pulo": { const h = Math.round(Math.abs(s) * N * 0.14); return { dx: 0, dy: -h, rot: OSSOS_PERNA(p.osso) ? lado * 0.25 * Math.abs(s) : OSSOS_BRACO(p.osso) ? -lado * 0.6 * Math.abs(s) : 0 }; }
      case "flutuar": return { dx: 0, dy: Math.round(s * N * 0.05), rot: OSSOS_BRACO(p.osso) ? lado * 0.15 * s : 0 };
      case "nenhuma": return { dx: 0, dy: 0, rot: 0 };
      default: // idle: respira (cabeça e tronco descem 1px na metade dos quadros, braços balançam de leve)
        return { dx: 0, dy: (s < 0 && !OSSOS_PERNA(p.osso)) ? Math.max(1, Math.round(u)) * (cabeca || OSSOS_BRACO(p.osso) || p.osso === "corpo" ? 1 : 0) : 0, rot: OSSOS_BRACO(p.osso) ? lado * 0.06 * s : 0 };
    }
  };
}
function comoPoligono(p: Parte): V[] {
  if (p.forma === "ret") { const r = Math.min(p.raio, p.w / 2, p.h / 2); if (r <= 0) return [[p.x, p.y], [p.x + p.w, p.y], [p.x + p.w, p.y + p.h], [p.x, p.y + p.h]];
    const pts: V[] = []; const cantos: [number, number, number][] = [[p.x + p.w - r, p.y + r, -Math.PI / 2], [p.x + p.w - r, p.y + p.h - r, 0], [p.x + r, p.y + p.h - r, Math.PI / 2], [p.x + r, p.y + r, Math.PI]];
    for (const [cx, cy, a0] of cantos) for (let k = 0; k <= 3; k++) { const a = a0 + (k / 3) * (Math.PI / 2); pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } return pts; }
  if (p.forma === "elipse") return Array.from({ length: 20 }, (_, k) => { const a = (k / 20) * Math.PI * 2; return [p.cx + Math.cos(a) * p.rx, p.cy + Math.sin(a) * p.ry] as V; });
  return p.pontos;
}
function mover(p: Parte, d: { dx: number; dy: number; rot: number; giro?: number }, origem?: V): Parte {
  const q = { ...p, pontos: p.pontos.map(([a, b]) => [a + d.dx, b + d.dy] as V), pivo: [p.pivo[0] + d.dx, p.pivo[1] + d.dy] as V, rot: d.rot };
  q.cx += d.dx; q.cy += d.dy; q.x += d.dx; q.y += d.dy;
  if (d.giro && origem) {
    const c = Math.cos(d.giro), s = Math.sin(d.giro), gira = ([x, y]: V): V => [origem[0] + (x - origem[0]) * c - (y - origem[1]) * s, origem[1] + (x - origem[0]) * s + (y - origem[1]) * c];
    if (q.forma !== "linha") { q.pontos = comoPoligono(q).map(gira); q.forma = "poli"; } else q.pontos = q.pontos.map(gira);
    q.pivo = gira(q.pivo);
  }
  return q;
}

// ---------- rasterização + sombreamento de um quadro ----------
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => v / 16 - 0.5);
function quadro(partes: Parte[], N: number, cores: Record<string, V3>, luz: V3, detalhes: { x: number; y: number; cor: string }[]): Uint8Array {
  const ordem = [...partes].sort((a, b) => a.z - b.z);
  const dono = new Int16Array(N * N).fill(-1);
  for (let k = 0; k < ordem.length; k++) for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (dentro(ordem[k], x + 0.5, y + 0.5)) dono[y * N + x] = k;

  // volume: distância até a borda da própria parte (chamfer) → altura em domo → normal pelo gradiente
  const dist = new Float32Array(N * N), INF = 1e6;
  for (let i = 0; i < N * N; i++) dist[i] = dono[i] < 0 ? 0 : INF;
  const mesma = (i: number, j: number) => dono[i] === dono[j];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x; if (dono[i] < 0) continue;
    const a = x > 0 && mesma(i, i - 1) ? dist[i - 1] + 1 : 1, b = y > 0 && mesma(i, i - N) ? dist[i - N] + 1 : 1;
    dist[i] = Math.min(dist[i], a, b);
  }
  for (let y = N - 1; y >= 0; y--) for (let x = N - 1; x >= 0; x--) {
    const i = y * N + x; if (dono[i] < 0) continue;
    const a = x < N - 1 && mesma(i, i + 1) ? dist[i + 1] + 1 : 1, b = y < N - 1 && mesma(i, i + N) ? dist[i + N] + 1 : 1;
    dist[i] = Math.min(dist[i], a, b);
  }
  const maxD = new Float32Array(ordem.length);
  for (let i = 0; i < N * N; i++) if (dono[i] >= 0) maxD[dono[i]] = Math.max(maxD[dono[i]], dist[i]);
  const alt = (x: number, y: number, k: number) => {
    if (x < 0 || y < 0 || x >= N || y >= N) return 0; const i = y * N + x;
    if (dono[i] !== k) return 0; const t = dist[i] / Math.max(1, maxD[k]); return Math.sqrt(t * (2 - t)); // perfil circular
  };

  const rampas = ordem.map((p) => rampa(cores[p.cor] ?? hex2rgb(p.cor), MATERIAIS[p.material]));
  const idx = new Int16Array(N * N).fill(-1); // nível da rampa escolhido
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x, k = dono[i]; if (k < 0) continue;
    const p = ordem[k], m = MATERIAIS[p.material], R = rampas[k];
    if (m.emissivo) { idx[i] = R.length - 1; continue; }
    const s = Math.max(1.5, maxD[k] * 0.6);
    let nx = (alt(x - 1, y, k) - alt(x + 1, y, k)) * s, ny = (alt(x, y - 1, k) - alt(x, y + 1, k)) * s, nz = 1;
    const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    let I = nx * luz[0] + ny * luz[1] + nz * luz[2]; // -1..1
    // sombra de contato: parte mais à frente bloqueando a luz logo acima/ao lado
    const lx = Math.round(x - Math.sign(luz[0])), ly = Math.round(y - Math.sign(luz[1]));
    if (lx >= 0 && ly >= 0 && lx < N && ly < N && dono[ly * N + lx] > k) I -= 0.35;
    if (p.dither || m.aspero) I += BAYER[(y & 3) * 4 + (x & 3)] * (p.dither ? 0.22 : 0.08);
    let v = Math.round(((I - 0.25) / 0.75) * (R.length - 1) * 0.5 + (R.length - 1) / 2 + 0.15);
    idx[i] = Math.max(0, Math.min(R.length - 1, v));
  }

  // limpeza: pixel órfão (nível diferente de todos os 4 vizinhos da mesma parte) assume o nível da maioria
  for (let y = 1; y < N - 1; y++) for (let x = 1; x < N - 1; x++) {
    const i = y * N + x, k = dono[i]; if (k < 0) continue;
    const viz = [i - 1, i + 1, i - N, i + N].filter((j) => dono[j] === k).map((j) => idx[j]);
    if (viz.length === 4 && !viz.includes(idx[i])) { const c: Record<number, number> = {}; viz.forEach((v) => (c[v] = (c[v] ?? 0) + 1)); idx[i] = Number(Object.entries(c).sort((a, b) => b[1] - a[1])[0][0]); }
  }

  const out = new Uint8Array(N * N * 4);
  const pinta = (i: number, c: V3) => { out[i * 4] = c[0]; out[i * 4 + 1] = c[1]; out[i * 4 + 2] = c[2]; out[i * 4 + 3] = 255; };
  for (let i = 0; i < N * N; i++) if (dono[i] >= 0) pinta(i, rampas[dono[i]][idx[i]]);

  // brilho especular: 1 pixel no ponto mais iluminado de cada parte brilhante
  ordem.forEach((p, k) => {
    if (!MATERIAIS[p.material].brilho) return; let melhor = -1, mv = -9;
    for (let i = 0; i < N * N; i++) if (dono[i] === k) { const x = i % N, y = (i / N) | 0, v = -x * luz[0] - y * luz[1] + dist[i] * 0.5; if (v > mv) { mv = v; melhor = i; } }
    if (melhor >= 0 && maxD[k] >= 2) pinta(melhor, misturar(rampas[k][rampas[k].length - 1], [255, 255, 240], 0.6));
  });

  // linha interna entre partes de cores diferentes: a parte de trás ganha 1px do seu tom mais escuro
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x, k = dono[i]; if (k < 0) continue;
    const frente = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => { const a = x + dx, b = y + dy; if (a < 0 || b < 0 || a >= N || b >= N) return false; const j = dono[b * N + a]; return j > k && ordem[j].cor !== ordem[k].cor; });
    if (frente && maxD[k] >= 2) pinta(i, rampas[k][0]);
  }

  // contorno seletivo: escuro no lado da sombra, mais claro no lado da luz; cor puxada da parte vizinha
  const cont = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x; if (dono[i] >= 0) continue;
    let viz = -1, ladoLuz = false, ortog = 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const a = x + dx, b = y + dy; if (a < 0 || b < 0 || a >= N || b >= N) continue; const j = dono[b * N + a];
      if (j >= 0) { ortog++; if (viz < 0 || j > viz) viz = j; if (dx * luz[0] + dy * luz[1] > 0) ladoLuz = true; }
    }
    if (viz < 0) continue;
    const base = rampas[viz][0];
    let c = ladoLuz ? escurecer(base, 0.62) : escurecer(base, 0.38);
    if (ortog >= 2) c = misturar(c, rampas[viz][0], 0.45); // canto interno: pixel intermediário (anti-aliasing manual)
    cont[i * 4] = c[0]; cont[i * 4 + 1] = c[1]; cont[i * 4 + 2] = c[2]; cont[i * 4 + 3] = 255;
  }
  for (let i = 0; i < N * N; i++) if (cont[i * 4 + 3]) { out[i * 4] = cont[i * 4]; out[i * 4 + 1] = cont[i * 4 + 1]; out[i * 4 + 2] = cont[i * 4 + 2]; out[i * 4 + 3] = 255; }

  // detalhes de 1 pixel (olho, boca, botão, cicatriz) por último, exatos
  for (const d of detalhes as { x: number; y: number; cor: string }[]) if (d.x >= 0 && d.y >= 0 && d.x < N && d.y < N) pinta(d.y * N + d.x, cores[d.cor] ?? hex2rgb(d.cor));
  return out;
}

// ---------- análise automática (vai junto pro crítico) ----------
function analisar(frames: Uint8Array[], N: number) {
  const f = frames[0]; let n = 0, x0 = N, x1 = -1, y0 = N, y1 = -1; const cores = new Set<number>();
  frames.forEach((q) => { for (let i = 0; i < N * N; i++) if (q[i * 4 + 3]) cores.add((q[i * 4] << 16) | (q[i * 4 + 1] << 8) | q[i * 4 + 2]); });
  for (let i = 0; i < N * N; i++) if (f[i * 4 + 3]) { n++; const x = i % N, y = (i / N) | 0; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const lum = (i: number) => 0.2126 * f[i * 4] + 0.7152 * f[i * 4 + 1] + 0.0722 * f[i * 4 + 2];
  let mn = 255, mx = 0; for (let i = 0; i < N * N; i++) if (f[i * 4 + 3]) { mn = Math.min(mn, lum(i)); mx = Math.max(mx, lum(i)); }
  const mudam = frames.slice(1).filter((q) => q.some((v, i) => v !== f[i])).length;
  const area = Math.max(1, (x1 - x0 + 1) * (y1 - y0 + 1));
  return { pintado: n / (N * N), ocupacao_caixa: n / area, caixa: `${x1 - x0 + 1}x${y1 - y0 + 1}`, cores: cores.size, contraste_luminancia: Math.round(mx - mn), quadros_que_mudam: `${mudam}/${frames.length - 1}` };
}

export async function renderSpriteKit(env: any, t: string, estilo: Estilo | null = null): Promise<Arquivo[]> {
  const s = extrairJSON(t);
  const N = [16, 24, 32, 48, 64].includes(Number(s.tamanho)) ? Number(s.tamanho) : estilo?.tamanho_personagem ?? 32;
  // bíblia do projeto: cada cor base é presa à cor mais próxima da paleta fechada (ou pega pelo nome)
  const paletaPedida: Record<string, string> = { ...(s.paleta ?? {}) };
  const trocadas: string[] = [];
  if (estilo) for (const k of Object.keys(paletaPedida)) { const antes = String(paletaPedida[k]).toLowerCase(); paletaPedida[k] = prenderNaPaleta(estilo.paleta[paletaPedida[k]] ?? paletaPedida[k], estilo); if (!estilo.paleta[antes] && paletaPedida[k].toLowerCase() !== antes) trocadas.push(`${k}: ${antes}→${paletaPedida[k]}`); }
  const cores: Record<string, V3> = {}; for (const [k, v] of Object.entries(paletaPedida)) cores[k] = hex2rgb(String(v));
  if (estilo) for (const [k, v] of Object.entries(estilo.paleta)) if (!cores[k]) cores[k] = hex2rgb(v);
  if (Object.keys(paletaPedida).length > (estilo ? 16 : 10)) throw new Error(`paleta com mais de ${estilo ? 16 : 10} cores base (a rampa cria os tons)`);
  const partes: Parte[] = (Array.isArray(s.partes) ? s.partes : []).slice(0, 40).map((o: any, i: number) => lerParte(o, i, N));
  const base = s.base ? await pecaDaBiblioteca(env, s.base, N, cores) : null;
  if (partes.length < (base ? 1 : 4)) throw new Error("poucas partes: um sprite elaborado precisa de 4 ou mais (corpo, cabeça, membros, detalhe)");
  if (estilo) for (const p of partes) if (!cores[p.cor] && /^#/.test(p.cor)) p.cor = prenderNaPaleta(p.cor, estilo);
  for (const p of partes) if (!cores[p.cor] && !/^#[0-9a-f]{6}$/i.test(p.cor)) throw new Error(`parte ${p.nome} usa cor fora da paleta: ${p.cor}`);
  const dir = String(estilo?.luz ?? s.luz ?? "cima-esquerda");
  const luz: V3 = (() => { const lx = /direit/.test(dir) ? 0.55 : -0.55, ly = /baixo/.test(dir) ? 0.45 : -0.6, l = Math.hypot(lx, ly, 0.6); return [lx / l, ly / l, 0.6 / l]; })();
  const detalhes: { x: number; y: number; cor: string }[] = (Array.isArray(s.detalhes) ? s.detalhes : []).slice(0, 60).map((d: any) => ({ x: Number(d.x) | 0, y: Number(d.y) | 0, cor: cores[String(d.cor)] || !estilo ? String(d.cor) : prenderNaPaleta(String(d.cor), estilo) }));

  const anims: { tipo: string; frames: number }[] = (Array.isArray(s.animacoes) ? s.animacoes : [s.animacao ?? { tipo: "idle", frames: 4 }])
    .slice(0, 4).map((a: any) => ({ tipo: String(a?.tipo ?? a ?? "idle"), frames: Math.max(1, Math.min(8, Number(a?.frames) || 4)) }));
  const linhas: Uint8Array[][] = anims.map((a) => Array.from({ length: a.tipo === "nenhuma" ? 1 : a.frames }, (_, i) => {
    const pz = pose(a.tipo, i, a.frames, N);
    const pes: V = a.tipo === "morte" ? [Math.round(N * 0.72), N - 2] : [N / 2, N - 2]; // cai pra trás: gira mais à direita pra caber no quadro
    const q = quadro(partes.map((p) => mover(p, pz(p), pes)), N, cores, luz, a.tipo === "morte" && i > 0 ? [] : detalhes.map((d) => ({ ...d, x: d.x + pz({ osso: "cabeca" } as Parte).dx, y: d.y + pz({ osso: "cabeca" } as Parte).dy })));
    if (a.tipo === "dano" && i === 0) for (let k = 0; k < q.length; k += 4) if (q[k + 3]) { q[k] = q[k] + (255 - q[k]) * 0.7; q[k + 1] = q[k + 1] + (255 - q[k + 1]) * 0.7; q[k + 2] = q[k + 2] + (255 - q[k + 2]) * 0.7; }
    if (base) { const dy = pz({ osso: "corpo" } as Parte).dy; for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const sy = y - dy; if (sy < 0 || sy >= N) continue; const si = (sy * N + x) * 4, di = (y * N + x) * 4; if (base[si + 3] && !q[di + 3]) q.set(base.subarray(si, si + 4), di); } }
    return q;
  }));
  const todos = linhas.flat();
  const met = analisar(todos, N);
  if (met.pintado < 0.08) throw new Error(`sprite quase vazio (${Math.round(met.pintado * 100)}% pintado) — formas fora da grade ${N}x${N}?`);
  if (met.ocupacao_caixa > 0.95) throw new Error("a silhueta é um bloco retangular");
  if (todos.length > 1 && met.quadros_que_mudam.startsWith("0/")) throw new Error("animação sem movimento: confira os ossos das partes");

  // sprite sheet: uma linha por animação
  const cols = Math.max(...linhas.map((l) => l.length)), W = cols * N, H = linhas.length * N, sheet = new Uint8Array(W * H * 4);
  linhas.forEach((l, r) => l.forEach((q, c) => { for (let y = 0; y < N; y++) sheet.set(q.subarray(y * N * 4, (y + 1) * N * 4), ((r * N + y) * W + c * N) * 4); }));
  const k = Math.max(1, Math.min(12, Math.floor(1024 / Math.max(W, H))));
  const z = ampliar(W, H, sheet, k); xadrez(z.W, z.H, z.out, k);
  const nome = String(s.nome ?? "sprite").replace(/[^\w-]/g, "_").slice(0, 40);
  const meta = { nome, tamanho: N, animacoes: anims.map((a, r) => ({ ...a, linha: r, quadros: linhas[r].length })), analise: { ...met, cores_trocadas_pela_paleta: trocadas } };
  return [
    { nome: `${nome}_sheet.png`, mime: "image/png", dados: await png(W, H, sheet) },
    { nome: `${nome}_preview.png`, mime: "image/png", dados: await png(z.W, z.H, z.out), preview: true },
    { nome: `${nome}.json`, mime: "application/json", dados: new TextEncoder().encode(JSON.stringify(meta, null, 1)) },
  ];
}
