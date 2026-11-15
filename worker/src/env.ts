export interface Env {
  DB: D1Database;
  AI: Ai;
  ESTUDIO_KEY: string; // senha da API do escritório (mesmo valor da LITELLM_MASTER_KEY do .env)
  GEMINI_API_KEY?: string;
  GROQ_API_KEY?: string;
  OPENROUTER_API_KEY?: string;
  NVIDIA_API_KEY?: string;
  ZAI_API_KEY?: string;
  GITHUB_MODELS_TOKEN?: string;
  TAVILY_API_KEY?: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
  POLLINATIONS_TOKEN?: string;
  GITHUB_ASSETS_TOKEN?: string;
  DEEPSEEK_API_KEY?: string;
  CUSTOM_BASE_URL?: string; // provedor "custom": URL base de uma API compatível com OpenAI (ex.: https://meu-tunel.exemplo.com/v1)
  CUSTOM_API_KEY?: string;
  ASSETS_REPO?: string; // "dono/repositorio-de-assets" (privado): jogos, biblioteca e motor
  HUB_ORIGEM?: string;  // endereço(s) do hub, separados por vírgula (CORS)
  HUB_SENHA?: string; // senha simples do hub pixel art // token fine-grained só do repo estudio-assets (Contents: read/write) // opcional: libera uso pelo servidor e tira a marca d'água
}
