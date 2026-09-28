/** Modelos oferecidos em Preferências, com preço em US$ por milhão de tokens (tabela da Anthropic, set/2026). */
export const AI_MODELS = [
  { id: "claude-sonnet-5", label: "Claude Sonnet 5 (recomendado)", input: 2, output: 10 },
  { id: "claude-opus-5", label: "Claude Opus 5 (mais capaz, mais caro)", input: 5, output: 25 },
  { id: "claude-haiku-4-5", label: "Claude Haiku 4.5 (mais barato)", input: 1, output: 5 },
] as const;

export const DEFAULT_AI_MODEL = AI_MODELS[0].id;

const CACHE_WRITE = 1.25;
const CACHE_READ = 0.1;

export type Usage = {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
};

/** Custo estimado em US$ de uma chamada; null se o modelo não está na tabela. */
export function estimateCostUsd(model: string, u: Usage): number | null {
  const m = AI_MODELS.find((x) => x.id === model);
  if (!m) return null;
  const inTok = u.input_tokens + (u.cache_creation_input_tokens ?? 0) * CACHE_WRITE + (u.cache_read_input_tokens ?? 0) * CACHE_READ;
  return (inTok * m.input + u.output_tokens * m.output) / 1e6;
}
