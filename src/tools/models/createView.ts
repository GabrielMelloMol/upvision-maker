import type { Occasion } from "./OccasionChips";
import type { Tab } from "./products";

/** O que a Criar mostrava (aba, busca, ocasião): o "← Todos os produtos" do editor volta para a mesma vista. */
export type CreateView = { tab: Tab; q: string; occasion: Occasion };
let view: CreateView = { tab: "all", q: "", occasion: null };
export const getCreateView = (): CreateView => view;
export const setCreateView = (next: CreateView) => void (view = next);
