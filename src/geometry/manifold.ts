import Module from "manifold-3d";
import type { ManifoldToplevel } from "manifold-3d";

export type { ManifoldToplevel };
export type CS = InstanceType<ManifoldToplevel["CrossSection"]>;
export type Solid = InstanceType<ManifoldToplevel["Manifold"]>;

let ready: Promise<ManifoldToplevel> | undefined;

/** Carrega o manifold-3d (WASM, ~540 KB) uma vez, sob demanda. */
export function getManifold(): Promise<ManifoldToplevel> {
  ready ??= (async () => {
    // No app o .wasm vem do bundle do Vite; nos testes (Node) o módulo acha o arquivo sozinho.
    const inApp = typeof window !== "undefined" && !import.meta.env?.VITEST;
    const url = inApp ? (await import("manifold-3d/manifold.wasm?url")).default : undefined;
    const m = await (Module as unknown as (o?: object) => Promise<ManifoldToplevel>)(url ? { locateFile: () => url } : undefined);
    m.setup();
    return m;
  })();
  return ready;
}
