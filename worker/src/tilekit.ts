// Fases do level designer: valida o caminho (simula o pulo), pinta o tileset por código com técnica de pixel art
// (material, rampa da paleta do projeto, autotile de 16 variações), monta o .tmj com camadas e a prévia com cara de jogo.
import { png, ampliar, extrairJSON, type Arquivo } from "./render";
import { rampa, hex2rgb, misturar, type V3 } from "./spritekit";
import { prenderNaPaleta, type Estilo } from "./estilo";
import { tamanhoDaPeca, tileDaBiblioteca } from "./biblioteca";

type Tipo = "vazio" | "solido" | "plataforma" | "perigo" | "coletavel" | "inicio" | "saida" | "inimigo" | "decoracao" | "agua" | "escada" | "rampa_d" | "rampa_e";
type Def = { ch: string; nome: string; tipo: Tipo; material: string; peca?: string; pecaTopo?: string };

const TIPO_POR_NOME: [RegExp, Tipo][] = [
  [/vazio|ar\b|c[eé]u|nada|empty/i, "vazio"], [/rampa.*esq|ladeira.*esq|subida.*esq/i, "rampa_e"], [/rampa|ladeira|subida|desce/i, "rampa_d"], [/in[ií]cio|start|spawn|jogador/i, "inicio"], [/sa[ií]da|exit|porta|goal|bandeira|fim/i, "saida"],
  [/espinho|lava|perigo|spike|serra|fogo/i, "perigo"], [/moeda|coin|item|chave|gema|cora[cç][aã]o|estrela|tesouro|ba[uú]/i, "coletavel"],
  [/inimigo|enemy|monstro|slime/i, "inimigo"], [/plataforma|ponte|tabua|t[aá]bua/i, "plataforma"], [/[aá]gua|water|rio|lago/i, "agua"],
  [/escada|ladder|cip[oó]|corda/i, "escada"], [/flor|arbusto|grama alta|decora|placa|cogumelo|pedrinha/i, "decoracao"],
];
const MATERIAL_POR_NOME: [RegExp, string][] = [
  [/grama|gramado|grass/i, "grama"], [/tijolo|brick|muro/i, "tijolo"], [/pedra|rocha|stone|caverna/i, "pedra"], [/madeira|t[aá]bua|ponte|wood|caixa/i, "madeira"],
  [/gelo|ice|neve/i, "gelo"], [/metal|a[cç]o|ferro|grade/i, "metal"], [/areia|sand|deserto/i, "areia"], [/nuvem|cloud/i, "nuvem"], [/terra|ch[aã]o|piso|solo/i, "terra"],
  [/lava/i, "lava"], [/espinho|spike|serra/i, "espinho"], [/moeda|coin/i, "moeda"], [/gema|cristal/i, "gema"], [/cora[cç][aã]o/i, "coracao"], [/chave/i, "chave"],
  [/porta/i, "porta"], [/bandeira|sa[ií]da|fim/i, "bandeira"], [/[aá]gua/i, "agua"], [/escada/i, "escada"], [/flor/i, "flor"], [/arbusto|grama alta/i, "arbusto"],
];
// cor-base de cada material e palavras pra achar a cor certa na bíblia do projeto
const COR_MATERIAL: Record<string, [string, RegExp]> = {
  grama: ["#8a5a3b", /terra|chao|ch[aã]o|solo/i], terra: ["#8a5a3b", /terra|chao|solo/i], tijolo: ["#a0533b", /tijolo|muro|parede/i], pedra: ["#6b7280", /pedra|rocha|parede/i],
  madeira: ["#9a6a3a", /madeira|tabua/i], gelo: ["#9fd8f0", /gelo|neve/i], metal: ["#8a95a5", /metal|aco|ferro/i], areia: ["#d9b46a", /areia|deserto/i], nuvem: ["#e8eef8", /nuvem|claro|branco/i],
  lava: ["#e8551e", /lava|perigo|fogo/i], espinho: ["#c8ccd6", /metal|espinho|perigo/i], moeda: ["#f2c230", /moeda|ouro|item|brilho/i], gema: ["#3ec7c7", /gema|cristal|item/i],
  coracao: ["#e04a5a", /vida|coracao|perigo/i], chave: ["#f2c230", /ouro|item/i], porta: ["#7a4a2a", /porta|madeira/i], bandeira: ["#e04a5a", /destaque|bandeira|heroi/i],
  agua: ["#3c8ad8", /agua|mar|rio/i], escada: ["#9a6a3a", /madeira/i], flor: ["#e85a8a", /flor|destaque/i], arbusto: ["#3c9a4a", /grama|folha|verde/i], inimigo: ["#7a3a8a", /inimigo/i],
};
const VERDE: [string, RegExp] = ["#4caf50", /grama|folha|verde/i];

function corDoProjeto(par: [string, RegExp], e: Estilo | null): V3 {
  if (!e) return hex2rgb(par[0]);
  const porNome = Object.entries(e.paleta).find(([k]) => par[1].test(k));
  return hex2rgb(porNome ? porNome[1] : prenderNaPaleta(par[0], e));
}

export function lerLegenda(leg: Record<string, any>): Def[] {
  return Object.entries(leg).map(([ch, v]) => {
    const nome = typeof v === "string" ? v : String(v?.nome ?? ch);
    const tipo: Tipo = (typeof v === "object" && v?.tipo && /^(vazio|solido|plataforma|perigo|coletavel|inicio|saida|inimigo|decoracao|agua|escada|rampa_d|rampa_e)$/.test(v.tipo))
      ? v.tipo : (TIPO_POR_NOME.find(([re]) => re.test(nome))?.[1] ?? "solido");
    const mat = (typeof v === "object" && v?.material) ? String(v.material) : (MATERIAL_POR_NOME.find(([re]) => re.test(nome))?.[1]
      ?? ({ solido: "terra", plataforma: "madeira", perigo: "espinho", coletavel: "moeda", saida: "bandeira", agua: "agua", escada: "escada", decoracao: "flor", inimigo: "inimigo" } as any)[tipo] ?? "terra");
    const peca = typeof v === "object" && v?.peca ? String(v.peca) : undefined, pecaTopo = typeof v === "object" && v?.peca_topo ? String(v.peca_topo) : undefined;
    return { ch, nome, tipo, material: COR_MATERIAL[mat] ? mat : "terra", peca, pecaTopo };
  });
}

// ---------- pintura dos tiles ----------
const hash = (x: number, y: number, s: number) => { let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const CIMA = 1, DIR = 2, BAIXO = 4, ESQ = 8;

function pintarTile(d: Def, mask: number, T: number, e: Estilo | null, seed: number): Uint8Array {
  const out = new Uint8Array(T * T * 4);
  const R = rampa(corDoProjeto(COR_MATERIAL[d.material] ?? COR_MATERIAL.terra, e), { niveis: 5, contraste: 1.1, brilho: false });
  const G = rampa(corDoProjeto(VERDE, e), { niveis: 5, contraste: 1.1, brilho: false });
  const escuro: V3 = e ? hex2rgb(Object.values(e.paleta).reduce((a, c) => { const l = (h: string) => { const v = hex2rgb(h); return v[0] + v[1] + v[2]; }; return l(c) < l(a) ? c : a; })) : [26, 28, 44];
  const px = (x: number, y: number, c: V3, a = 255) => { if (x < 0 || y < 0 || x >= T || y >= T) return; const i = (y * T + x) * 4; out[i] = c[0]; out[i + 1] = c[1]; out[i + 2] = c[2]; out[i + 3] = a; };
  const u = T / 16, n = (x: number, y: number) => hash(x, y, seed);
  const ehRampa = d.tipo === "rampa_d" || d.tipo === "rampa_e";
  const solido = d.tipo === "solido" || ehRampa;

  if (solido) {
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
      let k = 2; const r = n(x, y); if (r < 0.1) k = 1; else if (r > 0.93) k = 3;
      switch (d.material) {
        case "tijolo": { const fila = Math.floor(y / (4 * u)), off = fila % 2 ? 4 * u : 0; if (y % (4 * u) === 0 || (x + off) % (8 * u) === 0) k = 0; else if (y % (4 * u) === 1) k = 3; break; }
        case "madeira": { if (y % (4 * u) === 0) k = 0; else if (y % (4 * u) === 1) k = 3; else if (r < 0.06) k = 1; if ((x === 2 * u || x === T - 3 * u) && y % (4 * u) === 2 * u) k = 4; break; }
        case "pedra": { const cx = Math.floor(x / (8 * u)), cy = Math.floor((y + (cx % 2) * 4 * u) / (8 * u)); const lx = x % (8 * u), ly = (y + (cx % 2) * 4 * u) % (8 * u);
          if (lx === 0 || ly === 0) k = 0; else if (lx === 1 || ly === 1) k = 3; else if (lx === 8 * u - 1 || ly === 8 * u - 1) k = 1; if (n(cx, cy) > 0.7 && k === 2) k = 1; break; }
        case "metal": { if (x === 0 || y === 0) k = 3; if (x === T - 1 || y === T - 1) k = 1; if ((x === 2 * u || x === T - 3 * u) && (y === 2 * u || y === T - 3 * u)) k = 4; else if (k !== 3 && k !== 1) k = 2; break; }
        case "gelo": { if ((x + y) % (6 * u) === 0 && r > 0.4) k = 4; else if ((x + y) % (6 * u) === 1) k = 3; break; }
        case "nuvem": k = r < 0.05 ? 3 : 4; break;
        default: if (r > 0.97) k = 4; // terra/areia/grama: só textura de grão
      }
      px(x, y, R[k]);
    }
    // bordas expostas (autotile): contorno escuro embaixo e nos lados, luz em cima
    for (let i = 0; i < T; i++) {
      if (!(mask & BAIXO)) { px(i, T - 1, misturar(R[0], escuro, 0.5)); }
      if (!(mask & ESQ)) { px(0, i, R[1]); }
      if (!(mask & DIR)) { px(T - 1, i, R[0]); }
      if (!(mask & CIMA)) { px(i, 0, R[4]); px(i, 1, R[3]); }
    }
    // grama: tampa verde com folhas recortadas, só onde não há nada em cima
    if (d.material === "grama" && !(mask & CIMA)) {
      for (let x = 0; x < T; x++) {
        const alt = Math.round(3 * u + n(x, 99) * 2 * u);
        for (let y = 0; y < alt; y++) px(x, y, y === 0 ? G[4] : y === alt - 1 ? G[1] : y < 2 ? G[3] : G[2]);
        if (n(x, 7) > 0.8) px(x, alt, G[1]);
      }
    }
    if (d.material === "areia" && !(mask & CIMA)) for (let x = 0; x < T; x++) if (n(x, 3) > 0.6) px(x, 2, R[4]);
    if (ehRampa) for (let x = 0; x < T; x++) {
      const topo = d.tipo === "rampa_d" ? T - 1 - x : x; // linha da superfície nesta coluna
      for (let y = 0; y < topo; y++) out[(y * T + x) * 4 + 3] = 0;
      const cor = d.material === "grama" ? G : R;
      px(x, topo, cor[4]); px(x, topo + 1, cor[3]); if (d.material === "grama") { px(x, topo + 2, G[2]); px(x, topo + 3, G[1]); }
    }
    return out;
  }

  const cx = T / 2, cy = T / 2;
  switch (d.material) {
    case "espinho": { // fileira de espinhos com lado iluminado e contorno
      const qt = Math.max(2, Math.round(T / (5 * u))), lw = T / qt;
      for (let k = 0; k < qt; k++) for (let y = Math.floor(T * 0.45); y < T; y++) {
        const meio = k * lw + lw / 2, meia = ((y - T * 0.45) / (T * 0.55)) * (lw / 2);
        for (let x = Math.floor(meio - meia); x <= Math.ceil(meio + meia); x++) { const borda = Math.abs(x - meio) >= meia - 0.6; px(x, y, borda ? escuro : x < meio ? R[4] : R[2]); }
      }
      for (let x = 0; x < T; x++) px(x, T - 1, escuro);
      break;
    }
    case "lava": case "agua": {
      const alfa = d.material === "agua" ? 200 : 255;
      for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
        let k = 2; if (!(mask & CIMA)) { const onda = Math.round(u * (1 + Math.sin((x / T) * Math.PI * 2 * 2))); if (y < onda) continue; if (y === onda) k = 4; else if (y === onda + 1) k = 3; }
        if (n(x, y) > 0.95) k = d.material === "lava" ? 4 : 3; px(x, y, R[k], alfa);
      }
      break;
    }
    case "moeda": case "gema": case "coracao": case "chave": {
      const rx = d.material === "moeda" ? T * 0.26 : T * 0.28, ry = d.material === "moeda" ? T * 0.32 : T * 0.3;
      for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
        const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry, r2 = dx * dx + dy * dy;
        let dentro = r2 <= 1;
        if (d.material === "gema") dentro = Math.abs(dx) + Math.abs(dy) <= 1;
        if (d.material === "coracao") { const X = (x + 0.5 - cx) / (T * 0.3), Y = -(y + 0.5 - cy) / (T * 0.3) + 0.2; dentro = (X * X + Y * Y - 1) ** 3 - X * X * Y * Y * Y <= 0; }
        if (!dentro) continue;
        // moeda: aro escuro, face clara com risco vertical no meio (cara de moeda, não de gema)
        if (d.material === "moeda") { const aro = r2 > 0.62, risco = Math.abs(x + 0.5 - cx) < 0.6 * u && r2 < 0.35; px(x, y, aro ? R[1] : risco ? R[1] : dx < -0.2 ? R[4] : R[3]); continue; }
        px(x, y, dx + dy < -0.3 ? R[4] : dx + dy > 0.5 ? R[1] : R[2]);
      }
      // contorno de 1px e brilho
      const tmp = out.slice();
      for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) { const i = (y * T + x) * 4; if (tmp[i + 3]) continue;
        if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => { const X = x + a, Y = y + b; return X >= 0 && Y >= 0 && X < T && Y < T && tmp[(Y * T + X) * 4 + 3]; })) px(x, y, escuro); }
      px(Math.round(cx - T * 0.1), Math.round(cy - T * 0.15), [255, 255, 240]);
      break;
    }
    case "bandeira": case "porta": {
      if (d.material === "porta") {
        for (let y = 2 * u; y < T; y++) for (let x = 3 * u; x < T - 3 * u; x++) { const arco = y < 6 * u && ((x - cx) ** 2 + (y - 6 * u) ** 2 > (T / 2 - 3 * u) ** 2); if (arco) continue; const b = x === 3 * u || x === T - 3 * u - 1 || y === 2 * u; px(x, y, b ? escuro : x % (3 * u) === 0 ? R[1] : R[2]); }
        px(T - 5 * u, cy + u, [255, 220, 120]);
      } else {
        for (let y = u; y < T; y++) { px(3 * u, y, escuro); px(3 * u + 1, y, [200, 200, 210]); }
        for (let y = u; y < 7 * u; y++) for (let x = 3 * u + 2; x < 3 * u + 2 + (9 * u) * (1 - Math.abs(y - 4 * u) / (3 * u) * 0.25); x++) px(x, y, y === u ? R[4] : (x + y) % 3 ? R[2] : R[3]);
      }
      break;
    }
    case "escada": for (let y = 0; y < T; y++) { px(3 * u, y, R[1]); px(T - 3 * u - 1, y, R[1]); if (y % (4 * u) === 2 * u) for (let x = 3 * u; x < T - 3 * u; x++) px(x, y, R[3]); } break;
    case "flor": case "arbusto": {
      for (let x = 0; x < T; x++) { const h = d.material === "arbusto" ? Math.round(4 * u + n(x, 5) * 3 * u) : (x % (5 * u) === 2 * u ? 5 * u : 0);
        for (let y = T - h; y < T; y++) px(x, y, d.material === "arbusto" ? (y === T - h ? G[4] : G[2]) : G[2]); }
      if (d.material === "flor") for (let k = 0; k < 3; k++) { const fx = 2 * u + k * 5 * u, fy = T - 6 * u; px(fx, fy, R[3]); px(fx - 1, fy, R[2]); px(fx + 1, fy, R[2]); px(fx, fy - 1, R[2]); px(fx, fy + 1, R[2]); px(fx, fy, [255, 230, 120]); }
      break;
    }
    case "inimigo": { // marcador de onde o inimigo nasce (o sprite de verdade é do artista)
      for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) { const dx = (x + 0.5 - cx) / (T * 0.4), dy = (y + 0.5 - T * 0.65) / (T * 0.35); if (dx * dx + dy * dy <= 1 && y < T) px(x, y, dy < -0.3 ? R[3] : R[2]); }
      px(Math.round(cx - 2 * u), Math.round(T * 0.55), [255, 255, 255]); px(Math.round(cx + 2 * u), Math.round(T * 0.55), [255, 255, 255]);
      break;
    }
    default: { // plataforma de madeira (atravessável por baixo): tábua no topo + apoio
      if (d.tipo === "plataforma") { for (let y = 0; y < 5 * u; y++) for (let x = 0; x < T; x++) px(x, y, y === 0 ? R[4] : y === 5 * u - 1 ? R[0] : (x % (8 * u) === 0 ? R[1] : R[2]));
        if (!(mask & ESQ)) for (let y = 5 * u; y < 8 * u; y++) px(2 * u, y, R[1]); if (!(mask & DIR)) for (let y = 5 * u; y < 8 * u; y++) px(T - 3 * u, y, R[1]); }
    }
  }
  return out;
}

// ---------- caminho jogável ----------
export function analisarCaminho(grade: Def[][], visao: string, puloAlt: number, puloDist: number) {
  const H = grade.length, W = grade[0].length;
  const solido = (x: number, y: number) => x < 0 || x >= W || y >= H ? true : y < 0 ? false : ["solido", "plataforma", "rampa_d", "rampa_e"].includes(grade[y][x].tipo);
  const perigo = (x: number, y: number) => y >= 0 && y < H && x >= 0 && x < W && grade[y][x].tipo === "perigo";
  const livre = (x: number, y: number) => !solido(x, y) && !perigo(x, y);
  const achar = (t: Tipo) => { const r: [number, number][] = []; grade.forEach((l, y) => l.forEach((d, x) => d.tipo === t && r.push([x, y]))); return r; };
  const ini = achar("inicio"), fim = achar("saida");
  if (ini.length !== 1) throw new Error(`a fase precisa de exatamente 1 início (tem ${ini.length})`);
  if (fim.length !== 1) throw new Error(`a fase precisa de exatamente 1 saída (tem ${fim.length})`);
  const vis = new Set<number>(), fila: [number, number][] = [];
  const k = (x: number, y: number) => y * W + x;
  let cx = ini[0][0], cy = ini[0][1];
  if (visao === "cima") {
    fila.push([cx, cy]); vis.add(k(cx, cy));
    while (fila.length) { const [x, y] = fila.pop()!; for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const X = x + a, Y = y + b; if (X >= 0 && Y >= 0 && X < W && Y < H && livre(X, Y) && !vis.has(k(X, Y))) { vis.add(k(X, Y)); fila.push([X, Y]); } } }
  } else {
    // plataforma: posições em pé (célula livre com chão embaixo); o início cai até o chão
    while (cy < H - 1 && !solido(cx, cy + 1)) cy++;
    const emPe = (x: number, y: number) => x >= 0 && x < W && y >= 0 && y < H && livre(x, y) && (solido(x, y + 1) || grade[y][x].tipo === "escada");
    const cair = (x: number, y: number): [number, number] | null => { while (y < H && livre(x, y)) { if (emPe(x, y)) return [x, y]; y++; } return null; };
    const add = (p: [number, number] | null) => { if (p && !vis.has(k(p[0], p[1]))) { vis.add(k(p[0], p[1])); fila.push(p); } };
    add([cx, cy]);
    while (fila.length) {
      const [x, y] = fila.pop()!;
      for (const s of [-1, 1]) { if (livre(x + s, y)) add(cair(x + s, y)); }
      if (grade[y][x].tipo === "escada" || (y > 0 && grade[y - 1][x].tipo === "escada")) { if (y > 0 && livre(x, y - 1)) add([x, y - 1]); }
      // pulo: sobe até puloAlt (cabeça livre) e anda até puloDist no ar; pousa onde houver chão (mais longe se cair)
      let teto = 0; while (teto < puloAlt && livre(x, y - teto - 1)) teto++;
      for (let dy = 0; dy <= teto; dy++) for (const s of [-1, 1]) for (let dx = 1; dx <= puloDist + (dy === 0 ? 1 : 0); dx++) {
        const X = x + s * dx, Y = y - dy; if (!livre(X, Y)) break; add(cair(X, Y));
      }
    }
  }
  const alcanca = (x: number, y: number) => { for (let dy = 0; dy <= (visao === "cima" ? 0 : puloAlt + 1); dy++) for (let dx = -1; dx <= 1; dx++) if (vis.has(k(x + dx, y + dy))) return true; return false; };
  const moedas = achar("coletavel"), inimigos = achar("inimigo"), perigos = achar("perigo");
  const ok = alcanca(fim[0][0], fim[0][1]);
  return { ok, vis, ini: ini[0], fim: fim[0], analise: {
    visao, saida_alcancavel: ok, posicoes_alcancaveis: vis.size, coletaveis: moedas.length,
    coletaveis_alcancaveis: moedas.filter(([x, y]) => alcanca(x, y)).length, inimigos: inimigos.length, perigos: perigos.length,
    distancia_inicio_saida_tiles: Math.abs(fim[0][0] - ini[0][0]) + Math.abs(fim[0][1] - ini[0][1]),
    // ritmo: densidade de desafio em 4 trechos (abertura, subida, clímax, resolução)
    ritmo: [0, 1, 2, 3].map((q) => { const a = Math.floor((W * q) / 4), b = Math.floor((W * (q + 1)) / 4); return perigos.concat(inimigos).filter(([x]) => x >= a && x < b).length; }),
  } };
}

export async function renderFase(t: string, estilo: Estilo | null = null, env: any = null): Promise<Arquivo[]> {
  const m = extrairJSON(t);
  const linhas: string[] = (m.linhas ?? []).map(String);
  if (linhas.length < 8) throw new Error("fase com menos de 8 linhas");
  const H = linhas.length;
  // erro de contagem pequeno (até 3 caracteres) é acertado sozinho: completa repetindo o último caractere da linha, ou corta
  const moda = (() => { const c: Record<number, number> = {}; for (const l of linhas) c[l.length] = (c[l.length] ?? 0) + 1; return Number(Object.entries(c).sort((a, b) => b[1] - a[1])[0][0]); })();
  for (let i = 0; i < linhas.length; i++) { const d = moda - linhas[i].length; if (d > 0 && d <= 3) linhas[i] += linhas[i].slice(-1).repeat(d); else if (d < 0 && d >= -3) linhas[i] = linhas[i].slice(0, moda); }
  if (linhas.some((l) => l.length !== moda)) throw new Error(`linhas com tamanhos muito diferentes (a maioria tem ${moda}): ${linhas.map((l, i) => [i, l.length]).filter(([, n]) => n !== moda).slice(0, 5).map(([i, n]) => `linha ${i}: ${n}`).join(", ")}`);
  const W = linhas[0].length;
  if (W < 16 || W > 160 || H > 48) throw new Error(`tamanho fora do limite: ${W}x${H} (16–160 colunas, 8–48 linhas)`);
  const defs = lerLegenda(m.legenda ?? {});
  const porCh = new Map(defs.map((d) => [d.ch, d]));
  const faltando = [...new Set(linhas.join("").split(""))].filter((c) => !porCh.has(c));
  if (faltando.length) throw new Error(`caracteres sem legenda: ${faltando.map((c) => JSON.stringify(c)).join(" ")}`);
  const grade = linhas.map((l) => l.split("").map((c) => porCh.get(c)!));
  const visao = /cima|top/i.test(String(m.visao ?? "")) ? "cima" : "plataforma";
  const puloAlt = Math.max(1, Math.min(6, Number(m.pulo?.altura) || 3)), puloDist = Math.max(1, Math.min(8, Number(m.pulo?.distancia) || 4));
  const cam = analisarCaminho(grade, visao, puloAlt, puloDist);
  if (!cam.ok) throw new Error(`a saída não é alcançável a partir do início (pulo de ${puloAlt} tiles de altura e ${puloDist} de distância). Abra o caminho ou ajuste "pulo".`);

  // tiles da biblioteca (Kenney): o tamanho do tile segue a peça mais usada (ex.: 18 px no Pixel Platformer)
  const comPeca = defs.filter((d) => d.peca);
  if (comPeca.length && !env) throw new Error("fase usa peças da biblioteca mas o renderizador não tem acesso a ela");
  let T = estilo?.tile ?? 16;
  if (comPeca.length) { const tam = await tamanhoDaPeca(env, comPeca[0].peca!); if (!tam) throw new Error(`peça da biblioteca não existe: ${comPeca[0].peca}`); if (tam >= 8 && tam <= 32) T = tam; }
  const pecas = new Map<string, Uint8Array>();
  for (const d of comPeca) for (const id of [d.peca!, d.pecaTopo].filter(Boolean) as string[]) if (!pecas.has(id)) pecas.set(id, (await tileDaBiblioteca(env, id, T)).rgba);
  const nome = String(m.nome ?? "fase").replace(/[^\w-]/g, "_").slice(0, 40);
  // tileset: coluna = tile da legenda, linha = variação de autotile (máscara 0–15 dos vizinhos iguais)
  const n = defs.length, tsW = n * T, tsH = 16 * T, ts = new Uint8Array(tsW * tsH * 4);
  defs.forEach((d, gi) => { for (let mask = 0; mask < 16; mask++) {
    const tile = d.tipo === "inimigo" ? new Uint8Array(T * T * 4)
      : d.peca ? pecas.get(!(mask & CIMA) && d.pecaTopo ? d.pecaTopo : d.peca)!   // peça da biblioteca (topo exposto usa a variante de topo)
      : pintarTile(d, mask, T, estilo, gi * 31 + 7);
    for (let y = 0; y < T; y++) ts.set(tile.subarray(y * T * 4, (y + 1) * T * 4), ((mask * T + y) * tsW + gi * T) * 4);
  } });

  const solidoTipo = (d: Def) => d.tipo === "solido" || d.tipo === "rampa_d" || d.tipo === "rampa_e";
  const mascara = (x: number, y: number) => {
    const d = grade[y][x], igual = (X: number, Y: number) => { if (X < 0 || X >= W || Y >= H) return solidoTipo(d); if (Y < 0) return false; const o = grade[Y][X]; return solidoTipo(d) ? solidoTipo(o) : o.ch === d.ch; };
    return (igual(x, y - 1) ? CIMA : 0) | (igual(x + 1, y) ? DIR : 0) | (igual(x, y + 1) ? BAIXO : 0) | (igual(x - 1, y) ? ESQ : 0);
  };

  // prévia: céu em degradê da paleta + morros ao fundo + a fase pintada
  const PW = W * T, PH = H * T, pv = new Uint8Array(PW * PH * 4);
  const pal = estilo ? Object.values(estilo.paleta).map(hex2rgb) : [[26, 28, 44], [41, 54, 111], [59, 93, 201], [65, 166, 246]] as V3[];
  const lum = (c: V3) => c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11;
  const azuis = pal.filter((c) => c[2] > c[0]).sort((a, b) => lum(a) - lum(b));
  const ceu = azuis.length >= 2 ? [azuis[Math.max(0, azuis.length - 2)], azuis[azuis.length - 1]] : [pal[1] ?? [41, 54, 111], pal[2] ?? [59, 93, 201]];
  const morro = misturar(ceu[0] as V3, [26, 28, 44], 0.35);
  for (let y = 0; y < PH; y++) for (let x = 0; x < PW; x++) {
    const tt = y / PH, faixa = Math.floor(tt * 6) / 6; let c = misturar(ceu[1] as V3, ceu[0] as V3, faixa);
    const alt = PH * (0.55 + 0.08 * Math.sin(x / 47) + 0.05 * Math.sin(x / 13 + 1));
    if (y > alt) c = morro;
    const i = (y * PW + x) * 4; pv[i] = c[0]; pv[i + 1] = c[1]; pv[i + 2] = c[2]; pv[i + 3] = 255;
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const d = grade[y][x]; if (d.tipo === "vazio" || d.tipo === "inicio") continue;
    const gi = defs.indexOf(d), mask = mascara(x, y);
    const marca = d.tipo === "inimigo" ? pintarTile(d, 0, T, estilo, 1) : null;
    for (let yy = 0; yy < T; yy++) for (let xx = 0; xx < T; xx++) {
      const s = ((mask * T + yy) * tsW + gi * T + xx) * 4, a = marca ? marca[(yy * T + xx) * 4 + 3] : ts[s + 3]; if (!a) continue;
      const fonte = marca ?? ts, si = marca ? (yy * T + xx) * 4 : s;
      const di = ((y * T + yy) * PW + x * T + xx) * 4, f = a / 255;
      for (let c = 0; c < 3; c++) pv[di + c] = Math.round(fonte[si + c] * f + pv[di + c] * (1 - f));
    }
  }
  // marca o início (seta) pra leitura da prévia
  const [ix, iy] = cam.ini; for (let k = 0; k < T / 2; k++) for (let j = -k / 2; j <= k / 2; j++) { const X = Math.round(ix * T + T / 2 + j), Y = iy * T + k + 2; if (X >= 0 && X < PW && Y < PH) pv.set([255, 255, 255, 255], (Y * PW + X) * 4); }

  const chaves = defs.map((d) => d.ch);
  const objetos = [] as any[]; let oid = 1;
  grade.forEach((l, y) => l.forEach((d, x) => { if (["inicio", "saida", "inimigo", "coletavel"].includes(d.tipo)) objetos.push({ id: oid++, name: d.nome, type: d.tipo, x: x * T, y: y * T, width: T, height: T, visible: true, rotation: 0 }); }));
  const tmj = {
    type: "map", version: "1.10", orientation: "orthogonal", renderorder: "right-down", infinite: false,
    width: W, height: H, tilewidth: T, tileheight: T, nextlayerid: 3, nextobjectid: oid,
    properties: [...defs.map((d, i) => ({ name: `tile_${i + 1}`, type: "string", value: `${d.ch} = ${d.nome}` })), ...defs.map((d, i) => ({ name: `tipo_${i + 1}`, type: "string", value: d.tipo })),
      { name: "visao", type: "string", value: visao }, { name: "autotile", type: "bool", value: true }],
    tilesets: [{ firstgid: 1, name: `${nome}_tiles`, tilewidth: T, tileheight: T, tilecount: n * 16, columns: n, image: `${nome}_tiles.png`, imagewidth: tsW, imageheight: tsH }],
    layers: [
      { id: 1, name: "fase", type: "tilelayer", width: W, height: H, opacity: 1, visible: true, x: 0, y: 0, data: grade.flat().map((d) => chaves.indexOf(d.ch) + 1) },
      { id: 2, name: "objetos", type: "objectgroup", draworder: "topdown", opacity: 1, visible: true, x: 0, y: 0, objects: objetos },
    ],
  };
  const k = Math.max(1, Math.min(3, Math.floor(1600 / PW)));
  const z = k > 1 ? ampliar(PW, PH, pv, k) : { W: PW, H: PH, out: pv };
  return [
    { nome: `${nome}_preview.png`, mime: "image/png", dados: await png(z.W, z.H, z.out), preview: true },
    { nome: `${nome}_tiles.png`, mime: "image/png", dados: await png(tsW, tsH, ts) },
    { nome: `${nome}.tmj`, mime: "application/json", dados: new TextEncoder().encode(JSON.stringify(tmj)) },
    { nome: `${nome}_analise.json`, mime: "application/json", dados: new TextEncoder().encode(JSON.stringify({ nome, tamanho: `${W}x${H}`, tile: T, tiles_da_biblioteca: comPeca.map((d) => d.peca), ...cam.analise }, null, 1)) },
  ];
}
