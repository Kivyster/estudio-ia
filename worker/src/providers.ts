// Cliente único para todos os provedores. Todos falam o formato OpenAI (chat/completions),
// menos a Cloudflare, que usa o binding AI direto.
import type { Env } from "./env";

// content pode ser texto ou lista (texto + imagem) para modelos com visão
export type Msg = { role: "system" | "user" | "assistant"; content: string | any[] };
export type Resposta = { texto: string; tokens: number; modelo: string };

export class ErroProvedor extends Error {
  constructor(msg: string, public status: number, public cota: boolean) {
    super(msg);
  }
}

const BASES: Record<string, { url: string; chave: (e: Env) => string | undefined }> = {
  gemini: { url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", chave: (e) => e.GEMINI_API_KEY },
  groq: { url: "https://api.groq.com/openai/v1/chat/completions", chave: (e) => e.GROQ_API_KEY },
  openrouter: { url: "https://openrouter.ai/api/v1/chat/completions", chave: (e) => e.OPENROUTER_API_KEY },
  nvidia: { url: "https://integrate.api.nvidia.com/v1/chat/completions", chave: (e) => e.NVIDIA_API_KEY },
  zai: { url: "https://api.z.ai/api/paas/v4/chat/completions", chave: (e) => e.ZAI_API_KEY },
  deepseek: { url: "https://api.deepseek.com/chat/completions", chave: (e) => e.DEEPSEEK_API_KEY },
  github: { url: "https://models.github.ai/inference/chat/completions", chave: (e) => e.GITHUB_MODELS_TOKEN },
};

const MAX_TOKENS = 4096;
const TIMEOUT_MS = 60_000; // modelo que trava passa a vez pro reserva

async function openRouterGratis(env: Env): Promise<string[]> {
  const r = await fetch("https://openrouter.ai/api/v1/models");
  const j: any = await r.json();
  return (j.data || []).map((m: any) => m.id).filter((id: string) => id.endsWith(":free"));
}

async function chamarOpenAI(env: Env, provedor: string, modelo: string, msgs: Msg[], params: Record<string, unknown> = {}): Promise<Resposta> {
  // provedor "custom": qualquer API compatível com OpenAI (LM Studio/Ollama/vLLM por túnel, Together, Mistral, Azure…)
  const base = provedor === "custom" && env.CUSTOM_BASE_URL
    ? { url: env.CUSTOM_BASE_URL.replace(/\/+$/, "").replace(/\/chat\/completions$/, "") + "/chat/completions", chave: (_e: Env) => env.CUSTOM_API_KEY || "sem-chave" }
    : BASES[provedor];
  if (!base) throw new ErroProvedor(`provedor desconhecido: ${provedor}`, 0, false);
  const chave = base.chave(env);
  if (!chave) throw new ErroProvedor(`sem chave para ${provedor}`, 0, false);

  const corpo: any = { model: modelo, messages: msgs, max_tokens: MAX_TOKENS };
  if (provedor === "zai") corpo.thinking = { type: "disabled" };
  if (provedor === "groq" && modelo.includes("gpt-oss")) corpo.reasoning_effort = "low";
  const espera = Number((params as any)._timeout) || TIMEOUT_MS;
  Object.assign(corpo, params); // ajustes recomendados pelo fabricante (adaptador da família)
  delete corpo._timeout;
  if (provedor !== "groq") delete corpo.reasoning_effort;

  let r: Response;
  try {
    r = await fetch(base.url, {
      method: "POST",
      headers: { authorization: `Bearer ${chave}`, "content-type": "application/json" },
      body: JSON.stringify(corpo),
      signal: AbortSignal.timeout(espera),
    });
  } catch (e: any) {
    throw new ErroProvedor(`${provedor}/${modelo} sem resposta em ${espera / 1000}s (${e?.name ?? e})`, 0, false);
  }
  const bruto = await r.text();
  if (!r.ok) {
    const cota = r.status === 429 || /quota|rate.?limit|exceed|capacity|limit/i.test(bruto);
    throw new ErroProvedor(`${provedor}/${modelo} HTTP ${r.status}: ${bruto.slice(0, 300)}`, r.status, cota);
  }
  const j: any = JSON.parse(bruto);
  const texto = (j.choices?.[0]?.message?.content ?? "").trim();
  if (!texto) throw new ErroProvedor(`${provedor}/${modelo} respondeu vazio`, 200, false);
  // resposta cortada no limite de tokens = JSON/código incompleto: passa pro próximo da cadeia em vez de entregar quebrado
  if (j.choices?.[0]?.finish_reason === "length") throw new ErroProvedor(`${provedor}/${modelo} resposta cortada no limite de ${corpo.max_tokens} tokens`, 200, false);
  return { texto, tokens: j.usage?.total_tokens ?? 0, modelo };
}

export async function chamar(env: Env, provedor: string, modelo: string, msgs: Msg[], params: Record<string, unknown> = {}): Promise<Resposta> {
  if (provedor === "cloudflare") {
    const r: any = await env.AI.run(modelo as any, { messages: msgs, max_tokens: 2048 } as any);
    // cada família devolve num formato: response (llama), choices (gpt-oss/qwen), output_text
    const texto = String(r?.response ?? r?.choices?.[0]?.message?.content ?? r?.output_text ?? "").trim();
    if (!texto) throw new ErroProvedor(`cloudflare/${modelo} respondeu vazio`, 200, false);
    return { texto, tokens: r?.usage?.total_tokens ?? 0, modelo };
  }
  if (provedor === "openrouter" && modelo === "*free*") {
    // modelos grátis do OpenRouter mudam e congestionam: tenta até 3 da lista do dia
    const lista = await openRouterGratis(env);
    let ultimo: unknown;
    for (const m of lista.slice(0, 3)) {
      try {
        return await chamarOpenAI(env, provedor, m, msgs, params);
      } catch (e) {
        ultimo = e;
      }
    }
    throw ultimo ?? new ErroProvedor("openrouter: nenhum modelo :free disponível", 0, true);
  }
  return chamarOpenAI(env, provedor, modelo, msgs, params);
}

export async function buscaWeb(env: Env, consulta: string): Promise<string> {
  if (!env.TAVILY_API_KEY) return "";
  const r = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { authorization: `Bearer ${env.TAVILY_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ query: consulta.slice(0, 380), max_results: 5, search_depth: "basic" }),
  });
  if (!r.ok) return "";
  const j: any = await r.json();
  return (j.results || []).map((x: any) => `- ${x.title} (${x.url})\n  ${String(x.content).slice(0, 500)}`).join("\n");
}

// Gemini ouvindo áudio (API nativa: o modo compatível com OpenAI ignora o anexo). Áudio vai antes do texto.
export async function geminiComAudio(env: Env, modelo: string, sistema: string, texto: string, audios: Uint8Array[]): Promise<Resposta> {
  if (!env.GEMINI_API_KEY) throw new ErroProvedor("sem chave Gemini", 0, false);
  const b64 = (u: Uint8Array) => { let s = ""; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, {
    method: "POST", headers: { "x-goog-api-key": env.GEMINI_API_KEY, "content-type": "application/json" }, signal: AbortSignal.timeout(TIMEOUT_MS * 2),
    body: JSON.stringify({ system_instruction: { parts: [{ text: sistema }] }, contents: [{ role: "user", parts: [...audios.map((a) => ({ inline_data: { mime_type: "audio/wav", data: b64(a) } })), { text: texto }] }], generationConfig: { temperature: 0.2, maxOutputTokens: 4096 } }),
  });
  const j: any = await r.json().catch(() => null);
  if (!r.ok) throw new ErroProvedor(`gemini/${modelo} HTTP ${r.status}: ${JSON.stringify(j).slice(0, 200)}`, r.status, r.status === 429);
  const out = (j?.candidates?.[0]?.content?.parts ?? []).map((p: any) => p.text ?? "").join("").trim();
  if (!out) throw new ErroProvedor(`gemini/${modelo} respondeu vazio`, 200, false);
  return { texto: out, tokens: j?.usageMetadata?.totalTokenCount ?? 0, modelo };
}
