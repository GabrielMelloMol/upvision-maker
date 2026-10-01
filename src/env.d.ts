interface ImportMetaEnv {
  // "Sugerir ferramenta" (#83). Definidos no build (secrets do CI / .env.local), nunca no código.
  /** Endpoint do Worker de sugestões (services/feedback-worker), https. Sem ele, o app oferece WhatsApp e Copiar texto. */
  readonly VITE_FEEDBACK_URL?: string;
  /** Token do app que o Worker confere (freio contra spam, não é segredo forte: vai dentro do app). */
  readonly VITE_FEEDBACK_TOKEN?: string;
  /** WhatsApp para sugestões: DDI + DDD + número, ex.: 5521999990000. */
  readonly VITE_FEEDBACK_WHATSAPP?: string;
}

/** Data do build (AAAA-MM-DD), definida no vite.config.ts. */
declare const __BUILD_DATE__: string;
declare const __APP_VERSION__: string;
