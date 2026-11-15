// Biblioteca de peças CC0 (estudio-assets/biblioteca): indice.json lista recortes de sprite sheets feitas por artistas.
// O artista escolhe uma peça como base; o código recorta, encaixa na grade e recolore com a paleta do jogo.
import { cfg } from "./config";
type Peca = { id: string; arquivo: string; x: number; y: number; w: number; h: number; tags?: string[]; cat?: string; pacote?: string; licenca?: string };

async function gh(env: any, caminho: string): Promise<Response> {
  return fetch(`https://api.github.com/repos/${cfg.repo}/contents/${caminho}`, { headers: { authorization: `Bearer ${env.GITHUB_ASSETS_TOKEN}`, accept: "application/vnd.github.raw", "user-agent": "estudio-worker" } });
}
// índice grande (milhares de peças): fica em memória na instância do Worker por 30 min
let cacheIndice: { em: number; pecas: Peca[] } | null = null;
export async function indiceBiblioteca(env: any): Promise<Peca[]> {
  if (cacheIndice && Date.now() - cacheIndice.em < 30 * 60_000) return cacheIndice.pecas;
  if (!env.GITHUB_ASSETS_TOKEN) return [];
  const r = await gh(env, "biblioteca/indice.json");
  if (!r.ok) return [];
  try { const pecas = ((await r.json()) as any).pecas ?? []; cacheIndice = { em: Date.now(), pecas }; return pecas; } catch { return []; }
}
const sem = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
// catálogo pro artista: as peças mais parecidas com o pedido (busca por palavras em nome, categoria e tags)
export async function catalogoParaArtista(env: any, consulta = "", limite = 60, categorias?: string[]): Promise<string> {
  const p = (await indiceBiblioteca(env)).filter((x) => !categorias || categorias.includes(String(x.cat)));
  if (!p.length) return "(biblioteca vazia: desenhe tudo com partes)";
  const palavras = [...new Set(sem(consulta).split(/[^a-z0-9]+/).filter((w) => w.length >= 4))].slice(0, 80);
  const pontua = (x: Peca) => { const alvo = sem(`${x.id} ${x.cat ?? ""} ${(x.tags ?? []).join(" ")} ${x.pacote ?? ""}`); let n = 0; for (const w of palavras) if (alvo.includes(w.slice(0, Math.max(4, w.length - 2)))) n += x.id.includes(w.slice(0, 5)) ? 3 : 1; return n; };
  const top = p.map((x) => [x, pontua(x)] as const).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).slice(0, limite).map(([x]) => x);
  if (!top.length) return `(nenhuma peça parecida com o pedido entre ${p.length}; desenhe com partes)`;
  return `(${top.length} mais parecidas de ${p.length} peças CC0)\n` + top.map((x) => `- ${x.id} (${x.w}x${x.h}, ${x.cat ?? "?"}) ${(x.tags ?? []).slice(0, 5).join(", ")}`).join("\n");
}

// ---------- PNG decoder mínimo (8 bits: RGB, RGBA, cinza, paleta) ----------
async function inflar(b: Uint8Array): Promise<Uint8Array> {
  const s = new Blob([b]).stream().pipeThrough(new DecompressionStream("deflate"));
  return new Uint8Array(await new Response(s).arrayBuffer());
}
export async function decodificarPNG(buf: Uint8Array): Promise<{ w: number; h: number; data: Uint8Array }> {
  // PNG sem entrelaçamento, qualquer profundidade (1/2/4/8/16 bits) e tipo (cinza, RGB, paleta, cinza+alfa, RGBA)
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let o = 8, w = 0, h = 0, prof = 0, tipo = 0, pal: Uint8Array | null = null, trns: Uint8Array | null = null; const idat: Uint8Array[] = [];
  while (o < buf.length) {
    const len = dv.getUint32(o), t = String.fromCharCode(...buf.subarray(o + 4, o + 8)), d = buf.subarray(o + 8, o + 8 + len);
    if (t === "IHDR") { w = dv.getUint32(o + 8); h = dv.getUint32(o + 12); prof = buf[o + 16]; tipo = buf[o + 17]; if (buf[o + 20]) throw new Error("PNG entrelaçado não suportado"); }
    else if (t === "PLTE") pal = d; else if (t === "tRNS") trns = d; else if (t === "IDAT") idat.push(d); else if (t === "IEND") break;
    o += 12 + len;
  }
  const canais = ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 } as Record<number, number>)[tipo]; if (!canais) throw new Error("tipo de PNG não suportado");
  const junto = new Uint8Array(idat.reduce((a, c) => a + c.length, 0)); let p = 0; for (const c of idat) { junto.set(c, p); p += c.length; }
  const raw = await inflar(junto);
  const bpp = Math.max(1, (canais * prof) >> 3), linha = Math.ceil((w * canais * prof) / 8), px = new Uint8Array(linha * h);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (linha + 1)], src = raw.subarray(y * (linha + 1) + 1, (y + 1) * (linha + 1)), cur = px.subarray(y * linha, (y + 1) * linha), ant = y ? px.subarray((y - 1) * linha, y * linha) : null;
    for (let i = 0; i < linha; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0, b = ant ? ant[i] : 0, c = ant && i >= bpp ? ant[i - bpp] : 0;
      let v = src[i];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      cur[i] = v & 255;
    }
  }
  // lê a amostra k (canal) do pixel x na linha y, já escalada pra 0–255 (ou índice de paleta)
  const amostra = (y: number, x: number, k: number): number => {
    const base = y * linha;
    if (prof === 8) return px[base + x * canais + k];
    if (prof === 16) return px[base + (x * canais + k) * 2];
    const bit = (x * canais + k) * prof, byte = px[base + (bit >> 3)], val = (byte >> (8 - prof - (bit & 7))) & ((1 << prof) - 1);
    return tipo === 3 ? val : Math.round((val * 255) / ((1 << prof) - 1));
  };
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let r, g, b, a = 255;
    if (tipo === 3) { const k = amostra(y, x, 0); r = pal![k * 3]; g = pal![k * 3 + 1]; b = pal![k * 3 + 2]; a = trns && k < trns.length ? trns[k] : 255; }
    else if (tipo === 6) { r = amostra(y, x, 0); g = amostra(y, x, 1); b = amostra(y, x, 2); a = amostra(y, x, 3); }
    else if (tipo === 2) { r = amostra(y, x, 0); g = amostra(y, x, 1); b = amostra(y, x, 2); }
    else if (tipo === 4) { r = g = b = amostra(y, x, 0); a = amostra(y, x, 1); }
    else { r = g = b = amostra(y, x, 0); }
    data.set([r, g, b, a], (y * w + x) * 4);
  }
  return { w, h, data };
}


// folha decodificada fica em memória (várias peças vêm da mesma folha)
const cacheFolha = new Map<string, Promise<{ w: number; h: number; data: Uint8Array }>>();
async function folha(env: any, arquivo: string) {
  if (!cacheFolha.has(arquivo)) cacheFolha.set(arquivo, (async () => {
    const r = await gh(env, `biblioteca/${arquivo}`); if (!r.ok) throw new Error(`não consegui baixar ${arquivo} da biblioteca`);
    return decodificarPNG(new Uint8Array(await r.arrayBuffer()));
  })());
  return cacheFolha.get(arquivo)!;
}
// tile da biblioteca no tamanho T (vizinho mais próximo: pixel art continua nítida); devolve também o tamanho original
export async function tileDaBiblioteca(env: any, id: string, T: number): Promise<{ rgba: Uint8Array; orig: number }> {
  const p = (await indiceBiblioteca(env)).find((x) => x.id === id);
  if (!p) throw new Error(`peça da biblioteca não existe: ${id}`);
  const img = await folha(env, p.arquivo), out = new Uint8Array(T * T * 4);
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    const sx = p.x + Math.floor((x * p.w) / T), sy = p.y + Math.floor((y * p.h) / T), si = (sy * img.w + sx) * 4;
    out.set(img.data.subarray(si, si + 4), (y * T + x) * 4);
  }
  return { rgba: out, orig: Math.max(p.w, p.h) };
}
export async function tamanhoDaPeca(env: any, id: string): Promise<number | null> {
  const p = (await indiceBiblioteca(env)).find((x) => x.id === id); return p ? Math.max(p.w, p.h) : null;
}

// peça → grade NxN (apoiada na base, centralizada), recolorida por luminância numa rampa da cor pedida
export async function pecaDaBiblioteca(env: any, base: any, N: number, cores: Record<string, [number, number, number]>): Promise<Uint8Array> {
  const pecas = await indiceBiblioteca(env);
  const p = pecas.find((x) => x.id === String(base.peca));
  if (!p) throw new Error(`peça da biblioteca não existe: ${base.peca}`);
  const r = await gh(env, `biblioteca/${p.arquivo}`); if (!r.ok) throw new Error(`não consegui baixar a peça ${p.id}`);
  const img = await decodificarPNG(new Uint8Array(await r.arrayBuffer()));
  // peça pequena (ex.: 8 ou 16 px num sprite de 32) amplia por fator inteiro (pixel continua nítido); grande reduz
  const lado = Math.max(p.w, p.h), esc = lado * 2 <= N ? Math.max(1, Math.floor((N * Number(base.escala ?? 0.9)) / lado)) : Math.min(1, N / lado);
  const W = Math.round(p.w * esc), H = Math.round(p.h * esc), ox = Math.floor((N - W) / 2), oy = N - H;
  const out = new Uint8Array(N * N * 4);
  const alvo = base.cor && cores[base.cor];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const sx = p.x + Math.floor(x / esc), sy = p.y + Math.floor(y / esc), si = (sy * img.w + sx) * 4;
    if (img.data[si + 3] < 128) continue;
    let c = [img.data[si], img.data[si + 1], img.data[si + 2]];
    if (alvo) { const l = (0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2]) / 255, f = 0.35 + l * 1.1; c = alvo.map((v: number) => Math.max(0, Math.min(255, Math.round(v * f)))); }
    out.set([c[0], c[1], c[2], 255], ((oy + y) * N + ox + x) * 4);
  }
  return out;
}
