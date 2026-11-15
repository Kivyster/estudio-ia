// Bot do Telegram: avisos e comandos. Só obedece ao TELEGRAM_CHAT_ID do dono.
import type { Env } from "./env";

const LIMITE = 3900; // Telegram corta em 4096

export async function enviar(env: Env, texto: string) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return;
  for (let i = 0; i < texto.length && i < LIMITE * 3; i += LIMITE) {
    await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text: texto.slice(i, i + LIMITE) }),
    });
  }
}

export const avisar = enviar;

// imagens de preview vão como foto (aparecem no chat); o resto vai como arquivo pra baixar
export async function enviarArquivos(env: Env, arquivos: { nome: string; mime: string; dados: Uint8Array; preview?: boolean }[], legenda: string) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return;
  for (const a of arquivos.slice(0, 20)) {
    const foto = a.preview && /^image\/(png|jpeg)$/.test(a.mime) && a.dados.length < 9_000_000;
    const fd = new FormData();
    fd.append("chat_id", String(env.TELEGRAM_CHAT_ID));
    fd.append("caption", `${legenda} — ${a.nome}`.slice(0, 1000));
    fd.append(foto ? "photo" : "document", new Blob([a.dados], { type: a.mime }), a.nome);
    await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${foto ? "sendPhoto" : "sendDocument"}`, { method: "POST", body: fd });
  }
}

// segredo que o Telegram manda em cada chamada do webhook (derivado da ESTUDIO_KEY)
export async function segredoWebhook(env: Env): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("tg:" + env.ESTUDIO_KEY));
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 48);
}

export const AJUDA = `Comandos do escritório:
/pedido <texto> — o gerente monta o plano e espera seu OK
/ok <id> — aprova o plano e a equipe começa
/cancelar <id> — descarta o pedido
/tarefa <cargo> <texto> — manda direto para um cargo
  (ex.: /tarefa artista_sprite slime verde 16x16 pulando)
/cargos — lista os cargos
/status — quem está trabalhando, fila e cota usada hoje
/resultado <id> — mostra o resultado de uma tarefa
/pedidos — últimos pedidos`;
