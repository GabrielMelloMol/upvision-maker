interface ImportMetaEnv {
  /** Destino do "Sugerir ferramenta". Definido no build (secret do CI / .env.local), nunca no código. */
  readonly VITE_FEEDBACK_EMAIL?: string;
}
