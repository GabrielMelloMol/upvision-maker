/**
 * Tour guiado (#158): na 1ª visita a cada tela, 3 a 5 passos curtos que acendem só o que importa. Mesmo id do
 * artigo de ajuda (articles.ts) — o ? da tela tem "Rever o tour". Roda uma vez; o que já foi visto fica lembrado neste
 * computador; Ajustes → Aparência → "Reiniciar dicas" mostra tudo de novo.
 *
 * O alvo de cada passo é achado sem mexer nas telas: `sel` (seletor CSS), `button` (nome do botão ou link) ou `field`
 * (rótulo do campo). Passo cujo alvo não está na tela é pulado. `wait` = o tour espera a pessoa clicar ou digitar ali.
 */
import { useSyncExternalStore } from "react";
import { modKey } from "../ui/shortcuts";

export type TourStep = { sel?: string; button?: string; field?: string; text: string; wait?: "click" | "input" };
export type Tour = { id: string; steps: TourStep[] };

export const TOURS: Tour[] = [
  {
    id: "home",
    steps: [
      { sel: ".sidebar .scroll", text: "Aqui ficam as seções do app: Criar, Vender, Estoque e Resultados." },
      { sel: ".home-actions", text: "Atalhos para o que você mais faz: um chaveiro, um preço, um orçamento." },
      { button: "Buscar", text: `A busca acha telas, produtos e clientes. Atalho: ${modKey()}K.` },
      { sel: ".sidebar .theme-toggle", text: "Claro ou escuro, quando quiser." },
    ],
  },
  {
    id: "create",
    steps: [
      { field: "Buscar ferramenta ou modelo", text: "Digite o que quer fazer, por exemplo “chaveiro”.", wait: "input" },
      { sel: ".create-filters [role='group']", text: "Ou filtre pelo que você tem em mãos." },
      { sel: ".create-tools", text: "Clique numa ferramenta para abrir. Ela aparece embaixo de Criar na barra." },
    ],
  },
  {
    id: "keychain",
    steps: [
      { field: "Texto", text: "Digite o nome do chaveiro.", wait: "input" },
      { sel: ".viewer", text: "A prévia 3D: arraste para girar e role para aproximar." },
      { button: "Salvar 3MF", text: "Pronto? Salve o 3MF e abra no fatiador." },
    ],
  },
  {
    id: "calculator",
    steps: [
      { field: "Gramas", text: "Comece pelas gramas que o fatiador mostrou." },
      { field: "Tempo de impressão", text: "E o tempo de impressão." },
      { sel: ".price-rows", text: "O preço sugerido aparece aqui, já com energia, máquina e margem." },
    ],
  },
  {
    id: "orders",
    steps: [
      { button: "Novo pedido", text: "Cadastre cada pedido aqui." },
      { sel: ".board", text: "Cada coluna é uma etapa. O estoque baixa quando o pedido entra em produção." },
    ],
  },
  {
    id: "filaments",
    steps: [
      { button: "Escolher do catálogo", text: "Ache seu filamento no catálogo: marca e preço já vêm preenchidos." },
      { button: "Adicionar", text: "Confira o estoque e adicione." },
    ],
  },
];

export const tourFor = (id: string) => TOURS.find((t) => t.id === id);

// ---------- o que já foi visto e qual tour está aberto ----------
const KEY = "upvision:tours";
let open: string | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function seenList(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}
/** "*" na lista = dicas desligadas (Ajustes → Aparência). */
export const toursEnabled = () => !seenList().includes("*");
export const tourSeen = (id: string) => !toursEnabled() || seenList().includes(id);
export function setToursEnabled(on: boolean): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(on ? seenList().filter((x) => x !== "*") : ["*"]));
  } catch {
    // só não lembra da próxima vez
  }
}
export function markTourSeen(id: string): void {
  try {
    localStorage.setItem(KEY, JSON.stringify([...new Set([...seenList(), id])]));
  } catch {
    // só não lembra da próxima vez
  }
}
/** Ajustes → "Reiniciar dicas": todos os tours voltam a aparecer na 1ª visita. */
export function resetTours(): void {
  try {
    localStorage.setItem(KEY, "[]");
  } catch {
    // nada a limpar
  }
}
export function startTour(id: string): void {
  if (!tourFor(id)) return;
  open = id;
  emit();
}
export function endTour(): void {
  if (open) markTourSeen(open);
  open = null;
  emit();
}
export const useOpenTour = () =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => void listeners.delete(l);
    },
    () => open,
  );
