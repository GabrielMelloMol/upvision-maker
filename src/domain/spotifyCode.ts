import { checkScannable, scannableUrl } from "../geometry/models/musicCode";

/*
 * Busca o código do Spotify (SVG) de uma música, só quando a pessoa pede (Cartão de música). É um endereço público,
 * mas não oficial: pode mudar ou sair do ar. O SVG fica guardado no projeto, então a internet só faz falta uma vez.
 */
const TIMEOUT_MS = 8000;

export class ScannableError extends Error {
  constructor(
    message: string,
    readonly reason: "offline" | "not-found" | "unexpected",
  ) {
    super(message);
  }
}

const OFFLINE = "Não consegui falar com o Spotify agora (sem internet ou o serviço está fora do ar).";
const NOT_FOUND = "O Spotify não achou essa música. Confira o link.";
const UNEXPECTED = "O Spotify respondeu de um jeito que o app não entende (esse serviço não é oficial e pode ter mudado).";

/** SVG do código da música `uri` (spotify:track:…). Erros viram ScannableError com texto para mostrar. */
export async function fetchScannable(uri: string, fetchFn: typeof fetch = fetch): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let r: Response;
  try {
    r = await fetchFn(scannableUrl(uri), { signal: ctrl.signal });
  } catch {
    throw new ScannableError(OFFLINE, "offline");
  } finally {
    clearTimeout(t);
  }
  if (r.status === 404 || r.status === 400) throw new ScannableError(NOT_FOUND, "not-found");
  if (!r.ok) throw new ScannableError(UNEXPECTED, "unexpected");
  let svg: string;
  try {
    svg = await r.text();
  } catch {
    throw new ScannableError(OFFLINE, "offline");
  }
  if (!checkScannable(svg)) throw new ScannableError(UNEXPECTED, "unexpected");
  return svg;
}
