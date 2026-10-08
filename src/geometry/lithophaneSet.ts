import { buildLithophane, lithoThickness, type LithoParams } from "./lithophane";
import { buildLedBase, buildLid, LED } from "./lithophaneLed";
import { buildShapedPanel, shapeSize } from "./lithophaneShaped";
import { cylinderMesh, loopSeam } from "./lithophaneShapes";
import { bedMm } from "./bed";
import { layoutOnPlate } from "./keychain";
import type { ManifoldToplevel } from "./manifold";
import type { Model } from "./types";

/*
 * Litofania completa (#101): a peça do formato escolhido e, se pedido, a base de LED, a tampa de baixo e a tampa do
 * abajur, lado a lado na mesa. `lithoGrid` diz como a tela deve ler a foto para cada formato.
 */
export const BASE_COLOR = "#3a3a40";
const MAX_CYLINDER_CELLS = 160_000; // pontos por face do tubo: a prévia e o 3MF continuam leves
const MAX_COLS = 400;
const PART_GAP = 10;
const BED_EDGE = 4; // margem da mesa que o fatiador usa para a saia

/** Largura da lingueta de coração e círculo: um terço da peça, no máximo 40 mm. */
export const plugWidth = (shapeWidth: number) => Math.round(Math.min(shapeWidth / 3, 40));

/** Pontos da emenda do cilindro: 5% da volta. */
export const seamOf = (cols: number) => Math.max(4, Math.round(cols * 0.05));

/**
 * Como ler a foto: `cols` pontos de largura, `step` mm por ponto e `aspect` (largura ÷ altura) do recorte central
 * (null = a foto inteira, na proporção dela). No cilindro a largura é a volta (π × diâmetro) mais a sobra da emenda.
 */
export function lithoGrid(p: LithoParams, width: number, cell: number): { cols: number; step: number; aspect: number | null } {
  if (p.shape === "cylinder") {
    const circ = Math.PI * p.diameter;
    const step = Math.max(cell, Math.sqrt((circ * p.height) / MAX_CYLINDER_CELLS));
    const loop = Math.round(circ / step);
    const cols = loop + seamOf(loop);
    return { cols, step, aspect: cols / (Math.round(p.height / step) + 1) };
  }
  const step = Math.max(cell, width / MAX_COLS);
  const cols = Math.round(width / step) + 1;
  if (p.shape === "heart" || p.shape === "circle") {
    const { w, h } = shapeSize(p.shape, width);
    return { cols, step, aspect: w / h };
  }
  return { cols, step, aspect: null };
}

/** Peças na mesa, em linhas dentro do tamanho dela, sem se tocar e centradas na origem. */
const onPlate = (models: Model[]): Model[] => layoutOnPlate(models, bedMm() - 2 * BED_EDGE, PART_GAP);

export function buildLithophaneSet(M: ManifoldToplevel, luma: Float32Array, cols: number, rows: number, cell: number, p: LithoParams): { models: Model[]; warnings: string[] } {
  if (!(p.maxT > p.minT)) throw new Error("A espessura máxima precisa ser maior que a mínima.");
  const warnings: string[] = [];
  const parts: Model[] = [];
  const led = p.led;
  if (led && (p.shape === "curved" || p.shape === "box")) warnings.push("A base de LED serve para a litofania plana, cilindro, coração e círculo.");
  const useLed = led && p.shape !== "curved" && p.shape !== "box" ? led : null;
  const withLed = { ...p, led: useLed };

  if (p.shape === "cylinder") {
    const seamed = loopSeam(luma, cols, rows, seamOf(cols));
    const circ = Math.PI * p.diameter;
    const step = circ / seamed.cols; // a volta fecha exatamente no diâmetro pedido
    const t = lithoThickness(seamed.luma, seamed.cols, rows, step, p, true);
    parts.push({ name: "Litofania", parts: [{ name: "Litofania", color: p.color, mesh: cylinderMesh(t, seamed.cols, rows, step, p.diameter / 2) }] });
    if (useLed) {
      const out = buildLedBase(M, { layout: "round", diameter: p.diameter, wallT: p.maxT, led: useLed.kind, ledSize: useLed.size, power: useLed.power });
      warnings.push(...out.warnings);
      parts.push({ name: "Base de LED", parts: [{ name: "Base de LED", color: BASE_COLOR, mesh: out.base }] }, { name: "Tampa da base", parts: [{ name: "Tampa da base", color: BASE_COLOR, mesh: out.plate }] });
    }
    if (p.lid) parts.push({ name: "Tampa do abajur", parts: [{ name: "Tampa do abajur", color: p.color, mesh: buildLid(M, { diameter: p.diameter, wallT: p.maxT }) }] });
    return { models: onPlate(parts), warnings };
  }

  let slotW = (cols - 1) * cell;
  if (p.shape === "heart" || p.shape === "circle") {
    slotW = useLed ? plugWidth(slotW) : slotW;
    const out = buildShapedPanel(M, luma, cols, rows, cell, { shape: p.shape, minT: p.minT, maxT: p.maxT, border: p.border, plug: useLed ? { width: slotW, depth: LED.slotDepth } : null });
    parts.push({ name: "Litofania", parts: [{ name: "Litofania", color: p.color, mesh: out.mesh }] });
  } else parts.push(buildLithophane(M, luma, cols, rows, cell, withLed));
  if (useLed) {
    const out = buildLedBase(M, { layout: "panel", slotW, slotT: p.maxT, led: useLed.kind, ledSize: useLed.size, power: useLed.power });
    parts.push({ name: "Base de LED", parts: [{ name: "Base de LED", color: BASE_COLOR, mesh: out.base }] }, { name: "Tampa da base", parts: [{ name: "Tampa da base", color: BASE_COLOR, mesh: out.plate }] });
  }
  return { models: parts.length > 1 ? onPlate(parts) : parts, warnings };
}
