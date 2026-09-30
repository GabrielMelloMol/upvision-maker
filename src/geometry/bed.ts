/**
 * Mesa da impressora escolhida (#119): as ferramentas avisam, dividem e arrumam o lote por ela, em vez dos 256 mm
 * fixos da A1. Fica num lugar só: o App atualiza ao abrir e ao trocar de tela (Preferências → Impressora das
 * ferramentas); os geradores leem com `bedMm()` na hora de gerar.
 */
export type Bed = { x: number; y: number; z: number; name?: string };

/** A1/P1/X1: o padrão quando não há impressora cadastrada ou ela não está no catálogo. */
export const DEFAULT_BED: Bed = { x: 256, y: 256, z: 256 };

let current: Bed = DEFAULT_BED;

export const setBed = (b: Bed | null) => {
  current = b ?? DEFAULT_BED;
};
export const bed = (): Bed => current;
/**
 * Lado útil da mesa em mm. Mesa retangular (ex.: 250 × 210): o menor lado, para caber de qualquer jeito que se gire.
 * ponytail: peça comprida que cabe só na diagonal ou só no lado maior avisa à toa; tratar X e Y separados se incomodar.
 */
export const bedMm = () => Math.min(current.x, current.y);
export const bedHeight = () => current.z;

/**
 * Volume do catálogo de impressoras: "256×256×256", "300×300" (sem altura) ou "Ø300×410" (delta, mesa redonda:
 * o quadrado que cabe no círculo tem lado D/√2). null se não reconhecer.
 */
export function parseVolume(v: string | undefined): Bed | null {
  const s = (v ?? "").replace(/\s/g, "").replace(/x/gi, "×");
  const round = /^Ø(\d+(?:\.\d+)?)×(\d+(?:\.\d+)?)$/.exec(s);
  if (round) {
    const side = Math.floor(Number(round[1]) / Math.SQRT2);
    return { x: side, y: side, z: Number(round[2]) };
  }
  const box = /^(\d+(?:\.\d+)?)×(\d+(?:\.\d+)?)(?:×(\d+(?:\.\d+)?))?$/.exec(s);
  if (!box) return null;
  const [x, y] = [Number(box[1]), Number(box[2])];
  return { x, y, z: box[3] ? Number(box[3]) : Math.max(x, y) };
}

/**
 * Qual impressora manda no tamanho: a escolhida nas Preferências; senão a única (ou a primeira) cadastrada.
 * `volumeOf(nome)` acha o volume no catálogo; impressora fora do catálogo fica com o padrão.
 */
export function bedFor(printers: { id: number; name: string }[], chosenId: number | null | undefined, volumeOf: (name: string) => string | undefined): Bed {
  const p = printers.find((x) => x.id === chosenId) ?? printers[0];
  if (!p) return DEFAULT_BED;
  const b = parseVolume(volumeOf(p.name));
  return b ? { ...b, name: p.name } : { ...DEFAULT_BED, name: p.name };
}
