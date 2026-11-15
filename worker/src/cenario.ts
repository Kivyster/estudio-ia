// Cenário por código: camadas de parallax em pixel art (céu, astros, nuvens, montanhas, colinas, árvores, cidade,
// caverna, água, neblina), na paleta do projeto, emendando sem costura na horizontal. Não depende de gerador de imagem.
import { png, extrairJSON, type Arquivo } from "./render";
import { hex2rgb, misturar, type V3 } from "./spritekit";
import { prenderNaPaleta, type Estilo } from "./estilo";

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const h1 = (x: number, s: number) => { let h = (x * 374761393 + s * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

// ruído periódico (emenda sem costura): soma de senos com número inteiro de ciclos na largura
function onda(W: number, seed: number, oitavas: number, rug: number): (x: number) => number {
  const comps: [number, number, number][] = [];
  for (let o = 0; o < oitavas; o++) { const ciclos = Math.max(1, Math.round((1 + h1(o, seed) * 2) * 2 ** o)); comps.push([ciclos, h1(o + 50, seed) * Math.PI * 2, rug ** o]); }
  const soma = comps.reduce((a, c) => a + c[2], 0);
  return (x) => comps.reduce((a, [c, f, amp]) => a + Math.sin((x / W) * Math.PI * 2 * c + f) * amp, 0) / soma; // -1..1
}

type Camada = { tipo: string; cores: V3[]; base: number; altura: number; rug: number; dens: number; fator: number; seed: number; neve: boolean };

function pintarCamada(c: Camada, W: number, H: number, luzEsq: boolean): Uint8Array {
  const out = new Uint8Array(W * H * 4);
  const px = (x: number, y: number, cor: V3, a = 255) => { x = ((x % W) + W) % W; if (y < 0 || y >= H) return; const i = (y * W + x) * 4; out[i] = cor[0]; out[i + 1] = cor[1]; out[i + 2] = cor[2]; out[i + 3] = a; };
  const C = c.cores, escuro = C[0], meio = C[Math.min(1, C.length - 1)], claro = C[C.length - 1];
  const yBase = Math.round(H * c.base);
  switch (c.tipo) {
    case "ceu": { // degradê em faixas com dithering ordenado entre elas (de cima = cores[0] até o horizonte = última)
      for (let y = 0; y < H; y++) { const t = (y / (H * Math.max(0.3, c.base))) * (C.length - 1), i = Math.min(C.length - 2, Math.floor(t)), f = Math.min(1, t - i);
        for (let x = 0; x < W; x++) px(x, y, f > BAYER[(y & 3) * 4 + (x & 3)] ? C[Math.min(C.length - 1, i + 1)] : C[i]); }
      break;
    }
    case "estrelas": for (let k = 0; k < W * H * 0.004 * c.dens; k++) { const x = Math.floor(h1(k, c.seed) * W), y = Math.floor(h1(k, c.seed + 1) ** 1.6 * H * c.base); const g = h1(k, c.seed + 2) > 0.92;
      px(x, y, claro); if (g) { px(x + 1, y, meio); px(x - 1, y, meio); px(x, y + 1, meio); px(x, y - 1, meio); } } break;
    case "sol": case "lua": { const r = Math.round(H * 0.08 * (c.altura * 4 || 1)), cx = Math.round(W * 0.36), cy = Math.round(H * c.base);
      for (let y = -r * 2; y <= r * 2; y++) for (let x = -r * 2; x <= r * 2; x++) { const d = Math.hypot(x, y);
        if (d <= r) px(cx + x, cy + y, c.tipo === "lua" && Math.hypot(x + r * 0.4, y - r * 0.2) < r * 0.75 ? meio : (x + y < -r * 1.05 ? claro : C[Math.max(0, C.length - 2)]));
        else if (d <= r * 1.4 && BAYER[((y + 99) & 3) * 4 + ((x + 99) & 3)] > (d - r) / (r * 0.4)) px(cx + x, cy + y, meio, 140); }
      break; }
    case "nuvens": { const n = Math.max(2, Math.round(6 * c.dens));
      for (let k = 0; k < n; k++) { const cx = h1(k, c.seed) * W, cy = H * c.base * (0.4 + h1(k, c.seed + 3) * 0.6), larg = W * (0.08 + h1(k, c.seed + 5) * 0.1), alt = larg * 0.35;
        const bolhas = 4 + Math.floor(h1(k, c.seed + 7) * 4);
        for (let y = Math.floor(cy - alt * 1.6); y <= Math.ceil(cy); y++) for (let x = Math.floor(cx - larg); x <= Math.ceil(cx + larg); x++) {
          let dentro = false, topo = 9;
          for (let b = 0; b < bolhas; b++) { const bx = cx - larg * 0.8 + (b / (bolhas - 1)) * larg * 1.6, br = alt * (0.7 + h1(b + k * 9, c.seed) * 0.6); const d = Math.hypot(x - bx, (y - cy) * 1.2); if (d < br) { dentro = true; topo = Math.min(topo, (y - (cy - br / 1.2)) / br); } }
          if (dentro) px(Math.round(x), y, y > cy - alt * 0.25 ? meio : topo < 0.25 ? claro : C[Math.max(0, C.length - 2)]);
        } }
      break; }
    case "montanhas": case "colinas": {
      const f = onda(W, c.seed, c.tipo === "montanhas" ? 5 : 3, c.tipo === "montanhas" ? 0.55 * (0.6 + c.rug) : 0.4);
      const topoDe = (x: number) => { let v = f(x); if (c.tipo === "montanhas") v = 1 - Math.abs(v) * 2; return Math.round(yBase - (v * 0.5 + 0.5) * H * c.altura); };
      const topos = Array.from({ length: W }, (_, x) => topoDe(x)), tp = (x: number) => topos[((x % W) + W) % W];
      const alturaMax = H * c.altura, linhaNeve = yBase - alturaMax * 0.62;
      // lado iluminado por encosta, suavizado (maioria numa janela de 9 colunas) pra não virar listra
      // luz por inclinação suave (média larga) + dithering: transição gradual entre encosta clara e escura, sem listras
      const incl = Array.from({ length: W }, (_, x) => (tp(x + 6) - tp(x - 6)) / 12);
      const luzX = incl.map((_, x) => { let m = 0; for (let d = -5; d <= 5; d++) m += incl[((x + d) % W + W) % W]; m /= 11; return Math.max(0, Math.min(1, 0.5 + (luzEsq ? m : -m) * 2.2)); });
      for (let x = 0; x < W; x++) {
        const yt = tp(x), L = luzX[x], iluminado = L > 0.5;
        const neveFundo = linhaNeve + Math.round((h1(Math.floor(x / 3), c.seed + 11) - 0.5) * 6) + Math.round(Math.sin(x / 5) * 2);
        for (let y = yt; y < H; y++) {
          // quanto mais fundo na montanha, menos luz (base some na neblina/escuro)
          const prof = Math.min(1, (y - yt) / Math.max(8, yBase - yt + 1));
          const luzAqui = L * (1 - prof * 0.45);
          let cor = c.tipo === "montanhas" ? (luzAqui > BAYER[(y & 3) * 4 + (x & 3)] ? meio : escuro) : escuro;
          if (c.tipo === "montanhas" && y - yt < 1 && iluminado) cor = misturar(meio, claro, 0.35);
          if (c.tipo === "colinas") cor = y - yt < 1 ? claro : y - yt < 3 ? meio : escuro;
          if (c.neve && c.tipo === "montanhas" && yt < linhaNeve && y < neveFundo) cor = luzAqui > BAYER[(y & 3) * 4 + (x & 3)] * 0.8 ? claro : misturar(claro, meio, 0.45);
          px(x, y, cor);
        }
      }
      break; }
    case "arvores": { const f = onda(W, c.seed, 3, 0.5); const passo = Math.max(4, Math.round(14 / Math.max(0.3, c.dens)));
      for (let x = 0; x < W; x++) { const yt = yBase + Math.round(f(x) * 3); for (let y = yt; y < H; y++) px(x, y, escuro); }
      for (let k = 0; k * passo < W; k++) { const x0 = k * passo + Math.floor(h1(k, c.seed) * passo * 0.6), alt = Math.round(H * c.altura * (0.5 + h1(k, c.seed + 1) * 0.5)), pinheiro = c.rug > 0.5 ? true : h1(k, c.seed + 2) > 0.5;
        for (let y = 0; y < alt; y++) { const larg = pinheiro ? Math.round((y / alt) * alt * 0.35 * (1 + ((y % 4) / 8))) : Math.round(Math.sqrt(Math.max(0, 1 - ((y - alt * 0.45) / (alt * 0.45)) ** 2)) * alt * 0.3);
          for (let dx = -larg; dx <= larg; dx++) px(x0 + dx, yBase - alt + y, (luzEsq ? dx < -larg * 0.3 : dx > larg * 0.3) && y > 1 ? meio : escuro); } }
      break; }
    case "cidade": { let x = 0, k = 0;
      while (x < W) { const larg = Math.round(W * (0.03 + h1(k, c.seed) * 0.05)), alt = Math.round(H * c.altura * (0.3 + h1(k, c.seed + 1) * 0.7)), y0 = yBase - alt;
        for (let y = y0; y < H; y++) for (let dx = 0; dx < larg && x + dx < W; dx++) px(x + dx, y, dx === 0 ? meio : escuro);
        for (let wy = y0 + 3; wy < yBase - 2; wy += 4) for (let wx = 2; wx < larg - 2; wx += 3) if (h1(wx * 31 + wy, c.seed + k) < 0.35 * c.dens) px(x + wx, wy, claro);
        x += larg + Math.floor(h1(k, c.seed + 2) * 3); k++; }
      for (let y = yBase; y < H; y++) for (let x2 = 0; x2 < W; x2++) px(x2, y, escuro);
      break; }
    case "caverna": { const fT = onda(W, c.seed, 4, 0.6), fB = onda(W, c.seed + 9, 4, 0.6);
      for (let x = 0; x < W; x++) { const pont = h1(Math.floor(x / 6), c.seed) > 0.75 ? (6 - Math.abs((x % 6) - 3) * 2) * c.altura * 6 : 0;
        const yt = Math.round(H * 0.12 + fT(x) * H * 0.06 + pont), yb = Math.round(yBase - fB(x) * H * 0.05);
        for (let y = 0; y < yt; y++) px(x, y, y > yt - 2 ? meio : escuro); for (let y = yb; y < H; y++) px(x, y, y < yb + 2 ? meio : escuro); }
      break; }
    case "agua": for (let y = yBase; y < H; y++) for (let x = 0; x < W; x++) { const t = (y - yBase) / Math.max(1, H - yBase);
        let cor = t < 0.15 ? meio : escuro; if (Math.sin((x / W) * Math.PI * 2 * Math.round(W / 24) + y * 1.7) > 0.93 - t * 0.2 && h1(x + y * W, c.seed) > 0.4) cor = claro; px(x, y, cor, 230); } break;
    case "neblina": for (let y = 0; y < H; y++) { const a = Math.max(0, 1 - Math.abs(y - yBase) / (H * Math.max(0.05, c.altura))) * 0.8;
        for (let x = 0; x < W; x++) if (a > BAYER[(y & 3) * 4 + (x & 3)]) px(x, y, claro, 120); } break;
    default: throw new Error(`tipo de camada desconhecido: ${c.tipo}`);
  }
  return out;
}

export async function renderCenario(t: string, estilo: Estilo | null): Promise<Arquivo[]> {
  const s = extrairJSON(t);
  const [W0, H] = estilo?.resolucao ?? [320, 180], W = W0 * 2; // 2 telas de largura: repete sem costura
  const camadasIn = (Array.isArray(s.camadas) ? s.camadas : []).slice(0, 8);
  if (camadasIn.length < 3) throw new Error("cenário precisa de pelo menos 3 camadas (céu + 2 planos), do fundo pra frente");
  if (camadasIn[0]?.tipo !== "ceu" && camadasIn[0]?.tipo !== "caverna") throw new Error("a primeira camada (mais ao fundo) tem que ser \"ceu\" (ou \"caverna\")");
  const corDe = (v: any): V3 => { const n = String(v); const h = estilo?.paleta[n] ?? (estilo ? prenderNaPaleta(n, estilo) : n); return hex2rgb(h); };
  const luzEsq = !/direit/.test(estilo?.luz ?? s.luz ?? "");
  const nome = String(s.nome ?? "cenario").replace(/[^\w-]/g, "_").slice(0, 30);
  const camadas: Camada[] = camadasIn.map((c: any, i: number) => {
    const cores = (Array.isArray(c.cores) ? c.cores : []).slice(0, 6).map(corDe);
    if (cores.length < (c.tipo === "ceu" ? 2 : 1)) throw new Error(`camada ${i} (${c.tipo}) sem cores suficientes (céu: 2+, outras: 1 a 3, da escura pra clara)`);
    const num = (v: any, d: number, a: number, b: number) => (Number.isFinite(Number(v)) ? Math.max(a, Math.min(b, Number(v))) : d);
    return { tipo: String(c.tipo), cores, base: num(c.base, 0.7, 0, 1), altura: num(c.altura, 0.3, 0, 1), rug: num(c.rugosidade, 0.5, 0, 1), dens: num(c.densidade, 1, 0.1, 3),
      fator: num(c.fator, i === 0 ? 0 : i / camadasIn.length, 0, 1), seed: 17 + i * 101 + (Number(s.semente) | 0), neve: !!c.neve };
  });
  // perspectiva atmosférica: planos de trás precisam ser mais claros/menos contrastados que os da frente
  const lum = (c: V3) => c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11;
  const aviso: string[] = [];
  for (let i = 2; i < camadas.length; i++) if (!["neblina", "agua", "estrelas", "nuvens", "sol", "lua"].includes(camadas[i].tipo) && lum(camadas[i].cores[0]) > lum(camadas[i - 1].cores[0]) + 25 && !["neblina", "estrelas", "nuvens", "sol", "lua"].includes(camadas[i - 1].tipo))
    aviso.push(`camada ${i} (${camadas[i].tipo}) é mais clara que a de trás: quebra a profundidade`);

  const arqs: Arquivo[] = [], comp = new Uint8Array(W0 * H * 4), lista: any[] = [];
  for (let i = 0; i < camadas.length; i++) {
    const img = pintarCamada(camadas[i], W, H, luzEsq), arq = `${nome}_${i}_${camadas[i].tipo}.png`;
    arqs.push({ nome: arq, mime: "image/png", dados: await png(W, H, img) });
    lista.push({ img: arq, fator: camadas[i].fator });
    for (let y = 0; y < H; y++) for (let x = 0; x < W0; x++) { const si = (y * W + x) * 4, a = img[si + 3] / 255; if (!a) continue; const di = (y * W0 + x) * 4;
      for (let k = 0; k < 3; k++) comp[di + k] = Math.round(img[si + k] * a + comp[di + k] * (1 - a)); comp[di + 3] = 255; }
  }
  const k = 3, PW = W0 * k, PH = H * k, pv = new Uint8Array(PW * PH * 4);
  for (let y = 0; y < PH; y++) for (let x = 0; x < PW; x++) pv.set(comp.subarray(((Math.floor(y / k) * W0) + Math.floor(x / k)) * 4, ((Math.floor(y / k) * W0) + Math.floor(x / k)) * 4 + 4), (y * PW + x) * 4);
  arqs.push({ nome: `${nome}_preview.png`, mime: "image/png", dados: await png(PW, PH, pv), preview: true });
  arqs.push({ nome: `${nome}_analise.json`, mime: "application/json", dados: new TextEncoder().encode(JSON.stringify({ nome, uso: `Motor.parallax(${JSON.stringify(lista)})`, camadas: lista, avisos: aviso }, null, 1)) });
  return arqs;
}
