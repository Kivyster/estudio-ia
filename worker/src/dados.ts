// Game designer e roteirista: o texto (Markdown) continua pra equipe ler, e um bloco JSON vira arquivo que o jogo usa
// direto — config.json (números) e dialogos.json (falas e escolhas). O código valida e confere as contas.
import type { Arquivo } from "./render";

function blocoJSON(t: string): any {
  const blocos = [...t.matchAll(/```json\s*([\s\S]*?)```/gi)].map((m) => m[1]);
  const fonte = blocos.length ? blocos[blocos.length - 1] : t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1);
  try { return JSON.parse(fonte); } catch (e: any) { throw new Error(`bloco \`\`\`json inválido ou ausente no fim da entrega: ${String(e.message).slice(0, 120)}`); }
}
const txt = (o: any) => new TextEncoder().encode(typeof o === "string" ? o : JSON.stringify(o, null, 1));
const num = (v: any) => typeof v === "number" && Number.isFinite(v);

// ---------- game designer → config.json ----------
export function renderDesign(t: string, tile = 16): Arquivo[] {
  const c = blocoJSON(t);
  if (!c || typeof c !== "object" || Array.isArray(c)) throw new Error("config precisa ser um objeto JSON");
  // todo valor folha tem que ser número, texto curto, booleano ou lista desses
  const ruins: string[] = [];
  const andar = (o: any, cam: string) => { for (const [k, v] of Object.entries(o)) {
    const p = cam ? `${cam}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) andar(v, p);
    else if (typeof v === "string" && (/a definir|tbd|\?\?/i.test(v) || v.length > 200)) ruins.push(p);
    else if (v === null) ruins.push(p);
  } };
  andar(c, "");
  if (ruins.length) throw new Error(`valores indefinidos no config: ${ruins.slice(0, 8).join(", ")} (use números concretos)`);
  const j = c.jogador ?? {};
  for (const k of ["velocidade", "vida"]) if (!num(j[k])) throw new Error(`config.jogador.${k} precisa ser número`);
  const analise: any = {};
  // física de plataforma: confere se o pulo é jogável e traduz em tiles (o level designer usa isso)
  if (num(j.gravidade) && num(j.pulo)) {
    if (j.gravidade <= 0 || j.pulo <= 0) throw new Error("gravidade e pulo precisam ser positivos (pixels/s² e pixels/s)");
    const alt = (j.pulo * j.pulo) / (2 * j.gravidade) / tile, tempoAr = (2 * j.pulo) / j.gravidade, dist = (tempoAr * j.velocidade) / tile;
    analise.pulo_tiles = { altura: Math.round(alt * 10) / 10, distancia: Math.round(dist * 10) / 10, tempo_no_ar_s: Math.round(tempoAr * 100) / 100 };
    if (alt < 1 || alt > 10) throw new Error(`pulo injogável: alcança ${alt.toFixed(1)} tiles de altura (bom: 2 a 5). Ajuste jogador.pulo (px/s) ou jogador.gravidade (px/s²); altura = pulo²/(2·gravidade)/${tile}`);
    if (dist < 1.5 || dist > 14) throw new Error(`pulo alcança ${dist.toFixed(1)} tiles de distância (bom: 3 a 7). Ajuste velocidade, pulo ou gravidade`);
  }
  // inimigos: golpes pra matar e golpes pra morrer (sanidade do balanço)
  if (c.inimigos && typeof c.inimigos === "object") {
    analise.inimigos = Object.fromEntries(Object.entries(c.inimigos).map(([n, e]: [string, any]) => [n, {
      golpes_para_vencer: num(e?.vida) && num(j.dano) && j.dano > 0 ? Math.ceil(e.vida / j.dano) : null,
      golpes_para_perder: num(e?.dano) && e.dano > 0 ? Math.ceil(j.vida / e.dano) : null,
    }]));
  }
  return [
    { nome: "config.json", mime: "application/json", dados: txt(c) },
    { nome: "design_analise.json", mime: "application/json", dados: txt({ tile, ...analise }) },
  ];
}

// ---------- roteirista → dialogos.json ----------
export function renderRoteiro(t: string): Arquivo[] {
  const r = blocoJSON(t);
  const dlg = r?.dialogos;
  if (!dlg || typeof dlg !== "object" || !Object.keys(dlg).length) throw new Error("faltou \"dialogos\": { id_da_cena: [falas] }");
  const ids = new Set(Object.keys(dlg)), erros: string[] = [];
  let falas = 0;
  for (const [id, lista] of Object.entries(dlg) as [string, any[]][]) {
    if (!/^[a-z0-9_]+$/.test(id)) erros.push(`id de cena "${id}" deve ser minúsculo_com_underline`);
    if (!Array.isArray(lista) || !lista.length) { erros.push(`cena ${id} vazia`); continue; }
    lista.forEach((f, i) => {
      falas++;
      if (!f?.fala || typeof f.fala !== "string") erros.push(`${id}[${i}] sem "fala"`);
      else if (f.fala.length > 140) erros.push(`${id}[${i}] fala com ${f.fala.length} caracteres (máx. 140: cabe em 3 linhas da caixa)`);
      if (f?.quem && f.quem !== String(f.quem).toUpperCase()) erros.push(`${id}[${i}] "quem" em MAIÚSCULAS`);
      for (const e of Array.isArray(f?.escolhas) ? f.escolhas : []) {
        if (!e?.texto || String(e.texto).length > 40) erros.push(`${id}[${i}] escolha sem texto ou com mais de 40 caracteres`);
        if (e?.vai_para && !ids.has(e.vai_para)) erros.push(`${id}[${i}] escolha leva pra cena inexistente "${e.vai_para}"`);
      }
    });
  }
  if (erros.length) throw new Error(`roteiro com problemas: ${erros.slice(0, 8).join("; ")}`);
  const textos = r.textos && typeof r.textos === "object" ? r.textos : {};
  const out = { dialogos: dlg, textos };
  return [
    { nome: "dialogos.json", mime: "application/json", dados: txt(out) },
    { nome: "roteiro_analise.json", mime: "application/json", dados: txt({ cenas: ids.size, falas, personagens: [...new Set(Object.values(dlg).flat().map((f: any) => f?.quem).filter(Boolean))], textos: Object.keys(textos) }) },
  ];
}
