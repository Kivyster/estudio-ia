// Áudio por código: efeitos no estilo sfxr (envelope, punch, slide, arpejo, duty, filtros, camadas, repetição)
// e música chiptune por padrões (tracker): melodia, harmonia, baixo e bateria → WAV em loop.
import { extrairJSON, type Arquivo } from "./render";

let SR = 22050; // efeitos: 22050 Hz; música: 16000 Hz em 16 bits (cabe no banco e sem chiado de 8 bits)

function wav(pcm: Float32Array, bits: 8 | 16): Uint8Array {
  const n = pcm.length, bps = bits / 8, out = new Uint8Array(44 + n * bps), dv = new DataView(out.buffer), enc = new TextEncoder();
  out.set(enc.encode("RIFF"), 0); dv.setUint32(4, 36 + n * bps, true); out.set(enc.encode("WAVEfmt "), 8);
  dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true); dv.setUint32(24, SR, true);
  dv.setUint32(28, SR * bps, true); dv.setUint16(32, bps, true); dv.setUint16(34, bits, true);
  out.set(enc.encode("data"), 36); dv.setUint32(40, n * bps, true);
  for (let i = 0; i < n; i++) { const v = Math.max(-1, Math.min(1, pcm[i])); if (bits === 16) dv.setInt16(44 + i * 2, v * 32767, true); else out[44 + i] = Math.round(v * 127 + 128); }
  return out;
}
function normalizar(p: Float32Array, pico = 0.89) { let m = 0; for (const v of p) m = Math.max(m, Math.abs(v)); if (m > 0) for (let i = 0; i < p.length; i++) p[i] *= pico / m; return m; }

// ---------- osciladores ----------
type Onda = "quadrada" | "serra" | "triangulo" | "seno" | "ruido" | "ruido_metalico";
function normOnda(o: any): Onda {
  const s = String(o ?? "quadrada").toLowerCase();
  if (/metal/.test(s)) return "ruido_metalico"; if (/noi|ru[ií]/.test(s)) return "ruido"; if (/saw|serr/.test(s)) return "serra";
  if (/tri/.test(s)) return "triangulo"; if (/sin|sen/.test(s)) return "seno"; return "quadrada";
}
class Osc {
  fase = 0; ruido = 0; lfsr = 0x7fff;
  passo(onda: Onda, f: number, duty: number): number {
    const ant = this.fase; this.fase = (this.fase + f / SR) % 1;
    switch (onda) {
      case "seno": return Math.sin(2 * Math.PI * this.fase);
      case "triangulo": return 1 - 4 * Math.abs(this.fase - 0.5);
      case "serra": return 2 * this.fase - 1;
      case "ruido": case "ruido_metalico":
        if (this.fase < ant) { // novo período: avança o gerador (metálico = LFSR curto, timbre de NES)
          const bit = onda === "ruido_metalico" ? ((this.lfsr ^ (this.lfsr >> 6)) & 1) : ((this.lfsr ^ (this.lfsr >> 1)) & 1);
          this.lfsr = (this.lfsr >> 1) | (bit << 14); this.ruido = (this.lfsr & 1) ? 1 : -1;
          if (onda === "ruido") this.ruido = Math.random() * 2 - 1;
        }
        return this.ruido;
      default: return this.fase < duty ? 1 : -1;
    }
  }
}

// ---------- efeito sonoro ----------
type Efeito = any;
function sintetizarEfeito(e: Efeito, profundidade = 0): Float32Array {
  const n0 = (v: any, d: number, a: number, b: number) => (Number.isFinite(Number(v)) ? Math.max(a, Math.min(b, Number(v))) : d);
  const atk = n0(e.ataque, 0.005, 0, 1), sus = n0(e.sustentacao, 0.05, 0, 2), dec = n0(e.decaimento, 0.15, 0.01, 2.5);
  const dur = atk + sus + dec, n = Math.floor(dur * SR), out = new Float32Array(n);
  const onda = normOnda(e.onda), f0 = n0(e.freq_inicial, 440, 20, 8000), f1 = n0(e.freq_final, f0, 20, 8000);
  const exp = String(e.curva ?? "exp") !== "linear", punch = n0(e.punch, 0, 0, 1), vol = n0(e.volume, 0.5, 0.05, 1);
  const duty0 = n0(e.duty, 0.5, 0.05, 0.5), dutyV = n0(e.duty_varia, 0, -1, 1);
  const vibHz = n0(e.vibrato_hz, 0, 0, 40), vibP = n0(e.vibrato_profundidade, 0, 0, 0.5);
  const arp: { em: number; mult: number }[] = (Array.isArray(e.arpejo) ? e.arpejo : []).slice(0, 4).map((a: any) => ({ em: n0(a?.em, 0.1, 0, dur), mult: n0(a?.mult, 1, 0.25, 4) })).sort((a: any, b: any) => a.em - b.em);
  const rep = n0(e.repetir_hz, 0, 0, 30);
  const corte = n0(e.filtro_corte, 0, 0, 11000), passaAlta = n0(e.filtro_passa_alta, 0, 0, 8000);
  const osc = new Osc(); let lp = 0, hpAnt = 0, hpOut = 0;
  const aLP = corte ? 1 - Math.exp((-2 * Math.PI * corte) / SR) : 1, aHP = passaAlta ? Math.exp((-2 * Math.PI * passaAlta) / SR) : 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR, tl = rep ? (t % (1 / rep)) : t, p = Math.min(1, tl / Math.max(1e-4, dur));
    let f = exp ? f0 * Math.pow(f1 / f0, p) : f0 + (f1 - f0) * p;
    for (const a of arp) if (tl >= a.em) f *= a.mult;
    if (vibHz) f *= 1 + vibP * Math.sin(2 * Math.PI * vibHz * t);
    const duty = Math.max(0.05, Math.min(0.5, duty0 + dutyV * p * 0.45));
    let v = osc.passo(onda, f, duty);
    // envelope: ataque → sustentação (com punch decaindo) → decaimento
    const env = t < atk ? t / Math.max(atk, 1e-4) : t < atk + sus ? 1 + punch * (1 - (t - atk) / Math.max(sus, 1e-4)) : Math.max(0, 1 - (t - atk - sus) / dec);
    v *= env;
    if (corte) { lp += aLP * (v - lp); v = lp; }
    if (passaAlta) { hpOut = aHP * (hpOut + v - hpAnt); hpAnt = v; v = hpOut; }
    out[i] = v * vol;
  }
  // camadas: até 3 sons somados (ex.: explosão = ruído grave + estalo agudo)
  if (profundidade === 0 && Array.isArray(e.camadas)) for (const c of e.camadas.slice(0, 3)) {
    const s = sintetizarEfeito(c, 1); const atraso = Math.floor(n0(c.atraso, 0, 0, 1) * SR);
    for (let i = 0; i < s.length && i + atraso < out.length; i++) out[i + atraso] += s[i];
  }
  return out;
}

export async function renderSons(t: string): Promise<Arquivo[]> {
  const s = extrairJSON(t);
  const efeitos = (Array.isArray(s.efeitos) ? s.efeitos : []).slice(0, 12);
  if (!efeitos.length) throw new Error("nenhum efeito");
  const out: Arquivo[] = [], analise: any[] = [];
  for (const e of efeitos) {
    const nome = String(e.nome ?? "sfx").replace(/[^\w-]/g, "_").slice(0, 30);
    const pcm = sintetizarEfeito(e);
    if (pcm.length < SR * 0.02) throw new Error(`efeito ${nome} curto demais`);
    const pico = normalizar(pcm, Math.max(0.2, Math.min(0.89, Number(e.volume) || 0.6)));
    if (pico < 1e-3) throw new Error(`efeito ${nome} saiu mudo (confira volume, filtro e frequências)`);
    out.push({ nome: `${nome}.wav`, mime: "audio/wav", dados: wav(pcm, 16) });
    analise.push({ nome, duracao_s: Math.round((pcm.length / SR) * 100) / 100, onda: normOnda(e.onda), camadas: Array.isArray(e.camadas) ? e.camadas.length : 0, sobe: Number(e.freq_final) > Number(e.freq_inicial) });
  }
  out.push({ nome: "sons_analise.json", mime: "application/json", dados: new TextEncoder().encode(JSON.stringify({ efeitos: analise }, null, 1)) });
  return out;
}

// ---------- música ----------
const NOTAS: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const ESCALAS: Record<string, number[]> = { maior: [0, 2, 4, 5, 7, 9, 11], menor: [0, 2, 3, 5, 7, 8, 10], pentatonica: [0, 2, 4, 7, 9], dorica: [0, 2, 3, 5, 7, 9, 10], blues: [0, 3, 5, 6, 7, 10] };
const midi = (tok: string): number | null => { const m = tok.match(/^([A-G])(#|b)?(-?\d)$/); if (!m) return null; return 12 * (Number(m[3]) + 1) + NOTAS[m[1]] + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0); };
const hz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

function bateria(tipo: string, n: number): Float32Array {
  const o = new Float32Array(n), osc = new Osc();
  for (let i = 0; i < n; i++) {
    const t = i / SR; let v = 0;
    if (tipo === "k") v = Math.sin(2 * Math.PI * (50 + 110 * Math.exp(-t * 30)) * t) * Math.exp(-t * 14);
    else if (tipo === "s") v = (osc.passo("ruido", 6000, 0.5) * 0.7 + Math.sin(2 * Math.PI * 185 * t) * 0.4) * Math.exp(-t * 18);
    else if (tipo === "h") v = osc.passo("ruido_metalico", 9000, 0.5) * Math.exp(-t * 60) * 0.5;
    else if (tipo === "c") v = osc.passo("ruido", 8000, 0.5) * Math.exp(-t * 4) * 0.5;
    else if (tipo === "t") v = Math.sin(2 * Math.PI * (90 + 60 * Math.exp(-t * 20)) * t) * Math.exp(-t * 10);
    o[i] = v;
  }
  return o;
}

export async function renderMusica(t: string): Promise<Arquivo[]> {
  SR = 16000;
  try { return musica(t); } finally { SR = 22050; }
}
function musica(t: string): Arquivo[] {
  const s = extrairJSON(t);
  const bpm = Math.max(60, Math.min(200, Number(s.bpm) || 120)), passoS = 60 / bpm / 4; // 16 passos por compasso (semicolcheias)
  const canais = (Array.isArray(s.canais) ? s.canais : []).slice(0, 5);
  if (canais.length < 2) throw new Error("música precisa de pelo menos 2 canais (ex.: melodia e baixo; bateria recomendada)");
  const erros: string[] = [];
  const seqs = canais.map((c: any, ci: number) => {
    const pad = c.padroes && typeof c.padroes === "object" ? c.padroes : {};
    const seq: string[] = Array.isArray(c.sequencia) ? c.sequencia.map(String) : [];
    if (!seq.length) erros.push(`canal ${c.nome ?? ci}: sequencia vazia`);
    const passos: string[] = [];
    for (const id of seq) {
      if (!(id in pad)) { erros.push(`canal ${c.nome ?? ci}: padrão "${id}" não existe`); continue; }
      let toks = String(pad[id]).replace(/\|/g, " ").trim().split(/\s+/);
      const resto = toks.length % 16;
      if (resto && resto <= 3 && toks.length > 16) toks = toks.slice(0, toks.length - resto);           // sobrou pouco: corta
      else if (resto && 16 - resto <= 3) toks = [...toks, ...Array(16 - resto).fill(".")];               // faltou pouco: completa com pausa
      if (toks.length % 16) erros.push(`canal ${c.nome ?? ci}, padrão ${id}: ${toks.length} passos (precisa de múltiplo de 16 — 1 compasso = 16 passos)`);
      passos.push(...toks);
    }
    return passos;
  });
  if (erros.length) throw new Error(erros.slice(0, 6).join("; "));
  const total = Math.max(...seqs.map((p: string[]) => p.length));
  const dur = total * passoS;
  if (dur > 32) throw new Error(`música com ${dur.toFixed(0)} s (máx. 32 s de loop: use menos compassos ou bpm maior)`);
  if (dur < 6) throw new Error(`música curta demais (${dur.toFixed(1)} s): mínimo 6 s de loop`);
  const N = Math.ceil(dur * SR), mix = new Float32Array(N);
  const escala = ESCALAS[String(s.escala ?? "").toLowerCase().split(" ").pop() ?? ""] ?? null;
  const tonica = NOTAS[String(s.escala ?? "C").trim()[0]?.toUpperCase()] ?? 0;
  let notasTot = 0, foraEscala = 0;
  const faixa: Record<string, [number, number]> = {};

  canais.forEach((c: any, ci: number) => {
    const p: string[] = seqs[ci]; if (!p.length) return;
    const vol = Math.max(0.05, Math.min(1, Number(c.volume) || 0.4)), ehBateria = c.tipo === "bateria" || /bateria|drum|perc/i.test(String(c.nome));
    const onda = normOnda(c.onda ?? (ehBateria ? "ruido" : "quadrada")), duty = Math.max(0.05, Math.min(0.5, Number(c.duty) || 0.5));
    const sustain = Math.max(0, Math.min(1, Number(c.sustentacao ?? 0.6))), vib = Math.max(0, Number(c.vibrato) || 0);
    const nome = String(c.nome ?? `canal${ci}`);
    // o canal repete até cobrir o loop inteiro
    for (let rep = 0; rep * p.length < total; rep++) for (let k = 0; k < p.length; k++) {
      const tok = p[k], ini = Math.floor(((rep * p.length + k) * passoS) * SR); if (ini >= N || tok === "." || tok === "-") continue;
      if (ehBateria) {
        const sons = tok.toLowerCase().split("+");
        for (const so of sons) { const b = bateria(so, Math.min(Math.floor(SR * 0.5), N - ini)); for (let i = 0; i < b.length; i++) mix[ini + i] += b[i] * vol; }
        continue;
      }
      const notas = tok.split("+").map(midi);
      if (notas.some((m) => m === null)) { erros.push(`canal ${nome}: nota inválida "${tok}" (use C4, F#3, Bb5, "-" segura, "." pausa)`); continue; }
      let len = 1; while (k + len < p.length && p[k + len] === "-") len++;
      const n = Math.min(Math.floor(len * passoS * SR), N - ini), rel = Math.min(n, Math.floor(SR * 0.02));
      for (const m of notas as number[]) {
        notasTot++; if (escala && !escala.includes(((m - tonica) % 12 + 12) % 12)) foraEscala++;
        faixa[nome] = [Math.min(faixa[nome]?.[0] ?? 999, m), Math.max(faixa[nome]?.[1] ?? 0, m)];
        const osc = new Osc(), f = hz(m);
        for (let i = 0; i < n; i++) {
          const tt = i / SR; const env = tt < 0.005 ? tt / 0.005 : Math.max(sustain, 1 - (tt - 0.005) * 6) * (i > n - rel ? (n - i) / rel : 1);
          mix[ini + i] += osc.passo(onda, f * (vib ? 1 + 0.01 * Math.sin(2 * Math.PI * 6 * tt) * vib : 1), duty) * env * vol / notas.length;
        }
      }
    }
  });
  if (erros.length) throw new Error(erros.slice(0, 6).join("; "));
  normalizar(mix, 0.85);
  const nome = String(s.nome ?? "musica").replace(/[^\w-]/g, "_").slice(0, 30);
  const analise = {
    nome, duracao_loop_s: Math.round(dur * 10) / 10, bpm, compassos: total / 16, canais: canais.map((c: any) => c.nome),
    notas: notasTot, fora_da_escala_pct: escala ? Math.round((foraEscala / Math.max(1, notasTot)) * 100) : null,
    extensao: Object.fromEntries(Object.entries(faixa).map(([k, [a, b]]) => [k, `${b - a} semitons`])),
  };
  return [
    { nome: `${nome}.wav`, mime: "audio/wav", dados: wav(mix, 16) },
    { nome: `${nome}_analise.json`, mime: "application/json", dados: new TextEncoder().encode(JSON.stringify(analise, null, 1)) },
  ];
}
