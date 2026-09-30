import { useEffect, useRef, useSyncExternalStore } from "react";
import logoUrl from "../assets/examples/logo.jpg?url";
import heartUrl from "../assets/examples/coracao.svg?url";
import landscapeUrl from "../assets/examples/paisagem.jpg?url";

// ---------- qual ajuda está aberta (id do artigo, "term:<id>" para o glossário, null = fechada) ----------
let open: string | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const openHelp = (id: string) => {
  open = id;
  emit();
};
export const closeHelp = () => {
  open = null;
  emit();
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};
export const useOpenHelp = () => useSyncExternalStore(subscribe, () => open);

// ---------- "Usar exemplo": a ferramenta registra como carregar o exemplo dela ----------
const handlers = new Map<string, () => void>();
let pending: string | null = null;

/** Pede o exemplo da tela `id`: carrega já se a tela está aberta, ou quando ela abrir (Comece por aqui). */
export function requestExample(id: string) {
  const h = handlers.get(id);
  if (h) h();
  else pending = id;
}
export const hasExample = (id: string) => handlers.has(id);
// versão muda quando uma ferramenta registra/solta o exemplo: a ajuda pode abrir antes de a ferramenta carregar (lazy)
let version = 0;
const bump = () => {
  version++;
  emit();
};
/** `hasExample` que re-renderiza quando a ferramenta termina de carregar. */
export function useHasExample(id: string): boolean {
  useSyncExternalStore(subscribe, () => version);
  return handlers.has(id);
}

/** Registra o exemplo da ferramenta enquanto ela está na tela; atende um pedido feito antes de ela abrir. */
export function useExample(id: string, load: () => void) {
  const latest = useRef(load);
  useEffect(() => {
    latest.current = load;
  });
  useEffect(() => {
    const run = () => latest.current();
    handlers.set(id, run);
    bump();
    if (pending === id) {
      pending = null;
      run();
    }
    return () => {
      if (handlers.get(id) === run) {
        handlers.delete(id);
        bump();
      }
    };
  }, [id]);
}

const EXAMPLES = { logo: [logoUrl, "exemplo-logo.jpg", "image/jpeg"], heart: [heartUrl, "exemplo-coracao.svg", "image/svg+xml"], landscape: [landscapeUrl, "exemplo-paisagem.jpg", "image/jpeg"] } as const;

/** Arquivo de exemplo embutido no app (desenhos feitos para o projeto, sem direitos de terceiros). */
export async function exampleFile(kind: keyof typeof EXAMPLES): Promise<File> {
  const [url, name, type] = EXAMPLES[kind];
  const r = await fetch(url);
  if (!r.ok) throw new Error("Não deu para abrir o exemplo.");
  return new File([await r.blob()], name, { type });
}
