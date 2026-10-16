import NumField from "../../ui/NumField";
import { compartmentsMm, cutsPatch, dividerMm, evenCutsPatch, innerSize, MIN_COMPARTMENT, type Axis, type DrawerModule } from "./layout";

type Patch = Partial<DrawerModule>;
const tenth = (mm: number) => Math.round(mm * 10) / 10;
type Props = { module: DrawerModule; axis: Axis; onChange: (patch: Patch) => void };

const NAMES: Record<Axis, { count: string; each: (i: number) => string; from: string }> = {
  x: { count: "Divisões na largura", each: (i) => `Divisória ${i + 1} da largura`, from: "da esquerda" },
  y: { count: "Divisões na profundidade", each: (i) => `Divisória ${i + 1} da profundidade`, from: "da frente" },
};

/** Divisórias de uma direção: quantidade (iguais) e a posição de cada uma em mm, livre; mostra o tamanho dos compartimentos. */
export default function DividerFields({ module: m, axis, onChange }: Props) {
  const at = dividerMm(m, axis).map(tenth); // 55,0333… vira 55: a posição mostrada tem 0,1 mm
  const inner = innerSize(m, axis);
  const names = NAMES[axis];
  const room = Math.floor((inner + 1.2) / (MIN_COMPARTMENT + 1.2)); // quantos compartimentos cabem
  const addCut = () => {
    // parte o maior compartimento ao meio
    const sizes = compartmentsMm(m, axis);
    const big = sizes.indexOf(Math.max(...sizes));
    const edges = [0, ...at, inner];
    onChange(cutsPatch(m, axis, [...at, (edges[big] + edges[big + 1]) / 2]));
  };
  return (
    <div className="stack">
      <div className="grid two">
        <NumField label={names.count} value={m[axis === "x" ? "dividersX" : "dividersY"]} onChange={(n) => onChange(evenCutsPatch(axis, n))} min={1} max={Math.max(1, Math.min(8, room))} step={1} unit="" />
        <button type="button" className="ghost" onClick={addCut} disabled={at.length + 1 >= room} aria-label={axis === "x" ? "Mais uma divisória na largura" : "Mais uma divisória na profundidade"}>
          + divisória
        </button>
      </div>
      {at.length > 0 && (
        <div className="grid two">
          {at.map((mm, i) => (
            <NumField key={i} label={names.each(i)} value={mm} onChange={(v) => onChange(cutsPatch(m, axis, at.map((x, j) => (j === i ? v : x))))} min={0} max={Math.round(inner)} step={0.5} unit="mm" hint={`Medida ${names.from}, no vão interno.`} />
          ))}
        </div>
      )}
      <span className="hint">Compartimentos ({axis === "x" ? "largura" : "profundidade"}): {compartmentsMm(m, axis).map((v) => `${v.toFixed(1).replace(".", ",")} mm`).join(" · ")}</span>
    </div>
  );
}
