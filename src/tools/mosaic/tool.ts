import type { useToolState } from "../useToolState";
import type { State } from "./state";

/** A ferramenta como as abas a recebem (estado, `set` com chave de desfazer e `field`). */
export type Tool = ReturnType<typeof useToolState<State>>;
