import { bedMm } from "../../bed";
import { meshBounds } from "../../bounds";
import type { Solid, ManifoldToplevel } from "../../manifold";
import type { Mesh, Model } from "../../types";
import type { KitCardParams, KitMeta } from "../kitCard";

/** Resultado de uma verificação automática do kit card. */
export type Check = { id: string; label: string; ok: boolean; detail: string };
type Out = { models: Model[]; warnings?: string[]; meta?: KitMeta & { card?: { w: number; h: number } } };

const OVERLAP_MM3 = 0.02; // abaixo disso é ruído numérico, não colisão
const NUMBER_MAX_MM = 15; // o número gravado fica a no máximo isto da peça dele
const GAP_TOL = 0.05;
const MATE_SEARCH = 2;

const f = (n: number) => (Math.round(n * 100) / 100).toString().replace(".", ",");

export function solidOf(M: ManifoldToplevel, m: Mesh): Solid {
  return M.Manifold.ofMesh(new M.Mesh({ numProp: 3, vertProperties: m.positions, triVerts: m.indices }));
}
const partMesh = (m: Model | undefined, name: string) => m?.parts.find((q) => q.name === name)?.mesh;

type Box = { x0: number; y0: number; x1: number; y1: number };
const boxOf = (s: Solid): Box => {
  const b = s.boundingBox();
  return { x0: b.min[0], y0: b.min[1], x1: b.max[0], y1: b.max[1] };
};
const boxDist = (a: Box, b: Box) => Math.hypot(Math.max(0, a.x0 - b.x1, b.x0 - a.x1), Math.max(0, a.y0 - b.y1, b.y0 - a.y1));

/** Componentes conexos de uma malha (cada um é um sólido). */
function components(M: ManifoldToplevel, m: Mesh | undefined): Solid[] {
  if (!m) return [];
  const s = solidOf(M, m);
  const parts = s.decompose();
  s.delete();
  return parts;
}

/** Todas as verificações de um kit card gerado (cartão no modelo 0, montado no 1). */
export function checkKitCard(M: ManifoldToplevel, out: Out, p: KitCardParams): Check[] {
  const checks: Check[] = [];
  const add = (id: string, label: string, ok: boolean, detail: string) => checks.push({ id, label, ok, detail });
  const card = out.models[0];
  const asm = out.models.find((m) => m.previewOnly);
  const meta = out.meta;
  const trash: { delete(): void }[] = [];
  const keep = <T extends { delete(): void }>(o: T): T => (trash.push(o), o);
  try {
    // 1. peças inteiras: cada peça (e cada roda) é UM componente
    const body = components(M, partMesh(card, "Peças")).map(keep);
    const wheels = components(M, partMesh(card, "Rodas")).map(keep);
    const pieces = [...body, ...wheels];
    add("inteiras", "peças inteiras (um sólido cada)", !!meta && pieces.length === meta.pieces, `${pieces.length} sólidos para ${meta?.pieces ?? "?"} peças`);

    // 2. presas à moldura: cartão + peças + rodas + pneus formam uma peça só, e cada peça tem 2+ pontos de corte
    const all = ["Cartão", "Peças", "Rodas", "Pneus"].map((n) => partMesh(card, n)).filter((m): m is Mesh => !!m).map((m) => keep(solidOf(M, m)));
    const joined = keep(M.Manifold.union(all));
    const comps = joined.decompose().map(keep);
    const minGates = meta?.gatesPerPiece.length ? Math.min(...meta.gatesPerPiece) : 0;
    const loose = comps.length > 1 ? comps.map((c) => `${f(c.volume())} mm³ em x ${f(boxOf(c).x0)}…${f(boxOf(c).x1)}, y ${f(boxOf(c).y0)}…${f(boxOf(c).y1)}`).join(" | ") : "";
    add("presas", "presas à moldura (tudo ligado, 2+ pontos de corte)", comps.length === 1 && minGates >= 2 && meta?.gatesPerPiece.length === meta?.pieces, `${comps.length} bloco(s)${loose ? ` [${loose}]` : ""}; pontos de corte por peça: ${meta?.gatesPerPiece.join(",") ?? "?"}`);

    // 3. peças sem sobreposição (entre si) e dentro do cartão
    let overlap = 0;
    for (let i = 0; i < pieces.length; i++) for (let j = i + 1; j < pieces.length; j++) overlap = Math.max(overlap, keep(pieces[i].intersect(pieces[j])).volume());
    const cardBox = card.parts[0] ? meshBounds(card.parts.map((q) => q.mesh)) : null;
    const frame = cardBox ? { x0: cardBox.min[0], y0: cardBox.min[1], x1: cardBox.max[0], y1: cardBox.max[1] } : null;
    const outside = frame ? pieces.filter((s) => { const b = boxOf(s); return b.x0 < frame.x0 - 0.01 || b.y0 < frame.y0 - 0.01 || b.x1 > frame.x1 + 0.01 || b.y1 > frame.y1 + 0.01; }).length : pieces.length;
    add("sem-sobreposicao", "peças sem sobreposição e dentro do cartão", overlap < OVERLAP_MM3 && outside === 0, `interseção máxima ${f(overlap)} mm³; ${outside} fora do cartão`);

    // 4. cartão na mesa
    const bed = bedMm();
    const w = cardBox ? cardBox.max[0] - cardBox.min[0] : 0, h = cardBox ? cardBox.max[1] - cardBox.min[1] : 0;
    const onBed = !!cardBox && w <= bed + 0.01 && h <= bed + 0.01 && cardBox.min[2] >= -0.001;
    const metaOk = !meta?.card || (Math.abs(meta.card.w - w) < 0.6 && Math.abs(meta.card.h - h) < 0.6);
    add("mesa", "cartão cabe na mesa", onBed && metaOk, `${f(w)} × ${f(h)} mm (mesa ${bed}); z mínimo ${f(cardBox?.min[2] ?? 0)}${metaOk ? "" : "; meta.card diverge"}`);

    // 5. montado sem colisão e com as fendas casando (folga ≤ a folga pedida)
    const parts = (asm?.parts ?? []).map((q) => ({ name: q.name, s: keep(solidOf(M, q.mesh)) }));
    let collide = 0;
    for (let i = 0; i < parts.length; i++) for (let j = i + 1; j < parts.length; j++) collide = Math.max(collide, keep(parts[i].s.intersect(parts[j].s)).volume());
    add("sem-colisao", "montado sem colisão", parts.length > 1 && collide < OVERLAP_MM3, `${parts.length} partes; colisão máxima ${f(collide)} mm³`);
    const laterals = parts.filter((q) => q.name.startsWith("Montado: lateral"));
    const tol = Math.max(p.fit, p.axleFit) + GAP_TOL;
    const mating = (pt: { s: Solid }, group: { s: Solid }[], all: boolean) => {
      const gaps = group.map((g) => pt.s.minGap(g.s, MATE_SEARCH));
      return all ? gaps.every((g) => g <= tol) : gaps.some((g) => g <= tol);
    };
    const bad: string[] = [];
    for (const q of parts) {
      if (q.name.startsWith("Montado: costela") && !mating(q, laterals, true)) bad.push(q.name);
      else if (q.name.startsWith("Montado: roda") && !mating(q, laterals, false)) bad.push(q.name);
      else if ((q.name === "Montado: base" || q.name === "Montado: chassi") && !mating(q, laterals, true)) bad.push(q.name);
    }
    add("fendas", "fendas casando (encaixe com a folga pedida)", laterals.length > 0 && bad.length === 0, bad.length ? `não casam: ${bad.join(", ")}` : `todas as peças encostam nas laterais com folga ≤ ${f(tol)} mm`);

    // 6. número junto de cada peça
    const marks = components(M, partMesh(card, "Título")).map(keep);
    const boxes = pieces.map(boxOf);
    const markBoxes = marks.map(boxOf);
    const orphan = markBoxes.filter((m) => !boxes.some((b) => boxDist(m, b) <= NUMBER_MAX_MM)).length;
    const unnumbered = boxes.filter((b) => !markBoxes.some((m) => boxDist(m, b) <= NUMBER_MAX_MM)).length;
    add("numeros", "números gravados junto das peças", marks.length >= pieces.length && orphan === 0 && unnumbered === 0, `${marks.length} marcas para ${pieces.length} peças; ${unnumbered} peça(s) sem número perto, ${orphan} marca(s) longe de qualquer peça`);
  } finally {
    for (const t of trash) {
      try {
        t.delete();
      } catch {
        // já apagado junto de outro
      }
    }
  }
  return checks;
}
