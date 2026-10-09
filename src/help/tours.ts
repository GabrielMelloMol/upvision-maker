/**
 * Tour guiado (#158): na 1ª visita a cada tela, 3 a 5 passos curtos que acendem só o que importa. Mesmo id do
 * artigo de ajuda (articles.ts) — o ? da tela tem "Rever o tour". Roda uma vez; o que já foi visto fica lembrado neste
 * computador; Ajustes → Aparência → "Reiniciar dicas" mostra tudo de novo.
 *
 * O alvo de cada passo é achado sem mexer nas telas: `sel` (seletor CSS), `button` (nome do botão ou link) ou `field`
 * (rótulo do campo). O alvo de cada passo tem que existir e estar visível: se não aparecer, o passo é pulado e registrado, e o
 * teste `tests/e2e/tour-completo.e2e.ts` percorre todos os passos de todas as telas e falha. `wait` = o tour espera a pessoa clicar ou digitar ali.
 */
import { useSyncExternalStore } from "react";
import { modKey } from "../ui/shortcuts";

export type TourStep = { sel?: string; button?: string; field?: string; text: string; wait?: "click" | "input"; /** O alvo só existe em certos casos (ex.: uma linha da tabela): sem ele o passo é pulado sem alarme; o teste dos tours dá a ele os dados que precisa. */ optional?: boolean };
export type Tour = { id: string; steps: TourStep[] };

export const TOURS: Tour[] = [
  {
    id: "home",
    steps: [
      { sel: ".sidebar .scroll", text: "Aqui ficam as seções do app: Criar, Vender, Estoque, Resultados e Ajustes." },
      { sel: ".home-actions", text: "Atalhos para o que você mais faz: um chaveiro, um modelo pronto, um preço, um orçamento." },
      { sel: ".home > .occasion-card", optional: true, text: "A próxima data comemorativa aparece aqui: clique para ver os modelos prontos para ela." },
      { button: "Buscar", text: `A busca acha telas, modelos prontos, produtos e clientes. Atalho: ${modKey()}K.` },
      { sel: ".sidebar .theme-toggle", optional: true, text: "Claro ou escuro, quando quiser (com a barra lateral estreita, o botão fica nas Preferências)." },
    ],
  },
  {
    id: "create",
    steps: [
      { field: "Buscar ferramenta ou modelo", text: "Digite o que quer fazer, por exemplo “chaveiro”, “geladeira” ou “Dia das Mães”.", wait: "input" },
      { sel: ".create-filters [role='group']", text: "Ou filtre pelo que você tem em mãos." },
      { sel: ".create-tools", text: "Ferramentas: clique numa para abrir. Ela aparece embaixo de Criar na barra." },
      { sel: ".create-models", text: "Modelos prontos, por categoria: Chaveiros, Placas, Festa e esporte, Presentes e lembrancinhas, Casa e decoração, Organização e utilidades e Cozinha." },
      { sel: ".create-projects", text: "Meus projetos guarda tudo o que você já fez, para abrir de novo." },
    ],
  },
  {
    id: "models",
    steps: [
      { field: "Buscar modelo", text: "Procure pelo que você vende ou quer dar de presente; a busca entende sinônimos." },
      { sel: "[role='group'][aria-label='Ocasião']", text: "Ou veja por data: Dia das Mães, Natal, Páscoa, aniversário…" },
      { sel: "[role='group'][aria-label='Categoria']", text: "As categorias: Chaveiros, Placas, Festa e esporte, Presentes, Casa e decoração, Organização e Cozinha." },
      { sel: "[role='group'][aria-label='Família']", text: "Cada cartão é uma família de modelos parecidos; dentro dela você escolhe a variação." },
      { sel: ".viewer", text: "A prévia 3D muda enquanto você digita: arraste para girar." },
      { button: "Salvar 3MF", text: "Pronto? Salve o 3MF e abra no fatiador." },
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
    id: "lithophane",
    steps: [
      { sel: ".relief-cards", text: "Escolha o que quer fazer com a foto: Litofania, Colorida, Relevo, Quadro por camadas ou Shadowbox.", wait: "click" },
      { sel: "[role='group'][aria-label='Tipo']", text: "São cinco abas: dá para trocar de jeito a qualquer momento." },
      { sel: ".dropzone", optional: true, text: "Envie a foto aqui: rostos e paisagens com bom contraste ficam melhores." },
      { sel: ".preview-col", text: "A prévia mostra o resultado; na litofania, também como ela fica contra a luz." },
      { button: "Salvar 3MF", text: "Pronto? Salve o 3MF e abra no fatiador." },
    ],
  },
  {
    id: "organizers",
    steps: [
      { sel: ".org-choices", text: "Como você quer organizar? Pela medida da gaveta, pela foto das ferramentas ou com caixinhas Gridfinity soltas.", wait: "click" },
      { sel: "[role='tablist'][aria-label='Jeito de organizar']", text: "As abas deixam trocar de jeito sem perder o que já fez em cada um." },
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
    id: "customers",
    steps: [
      { button: "Novo cliente", text: "O cadastro abre numa folha ao lado: preencha e salve sem sair da lista." },
      { sel: "main .menu-wrap > button", optional: true, text: "Em cada linha, o menu ⋯ tem Editar, Duplicar e Excluir." },
    ],
  },
  {
    id: "products",
    steps: [
      { button: "Novo produto", text: "O cadastro abre numa folha ao lado: preencha e salve sem sair da lista." },
      { sel: "main .menu-wrap > button", optional: true, text: "Em cada linha, o menu ⋯ tem Editar, Duplicar e Excluir." },
    ],
  },
  {
    id: "filaments",
    steps: [
      { button: "Adicionar filamento", text: "O cadastro abre numa folha ao lado, com “Escolher do catálogo”: marca e preço já vêm preenchidos." },
      { sel: "main .menu-wrap > button", optional: true, text: "Em cada linha, o menu ⋯ tem Editar, Duplicar e Excluir." },
    ],
  },
  {
    id: "preferences",
    steps: [
      { sel: ".prefs-nav", text: "As preferências são divididas em seções: custos, preço, falhas e impostos, canais de venda, aparência, dados e ferramentas. O app lembra a última aberta." },
      { button: "Salvar preferências", text: "Nas quatro primeiras seções, salve aqui. Uma seção com “Corrigir” tem um campo a acertar." },
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
