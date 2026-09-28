interface ImportMetaEnv {
  /** Destino do "Sugerir ferramenta". Definido no build (secret do CI / .env.local), nunca no código. */
  readonly VITE_FEEDBACK_EMAIL?: string;
}

/** Data do build (AAAA-MM-DD), definida no vite.config.ts. */
declare const __BUILD_DATE__: string;
