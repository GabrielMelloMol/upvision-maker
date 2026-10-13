import { regionBox, regionOfKind, type Region, type RegionKind, type Vec3 } from "../../geometry/cutRegion";
import type { Bounds } from "../../geometry/bounds";
import type { CutAxis } from "../../geometry/planeCut";
import Segmented from "../../ui/Segmented";
import Slider from "../../ui/Slider";

const KINDS: [RegionKind, string][] = [
  ["box", "Caixa"],
  ["cylinder", "Cilindro"],
  ["sphere", "Esfera"],
];
const AXES: [CutAxis, string][] = [
  ["z", "em pé (Z)"],
  ["x", "deitado (X)"],
  ["y", "deitado (Y)"],
];
const STEP = 0.5;
const PAD = 1;
const NAMES = ["X", "Y", "Z"];
const mm = (n: number) => n.toFixed(1).replace(".", ",") + " mm";

type Props = { region: Region; bounds: Bounds; onChange: (r: Region) => void };

/** Controles da região por forma: sliders de ajuste fino (a alça na vista 3D faz o ajuste grosso). */
export default function RegionControls({ region, bounds, onChange }: Props) {
  const lo = (a: number) => Math.floor(bounds.min[a]) - PAD;
  const hi = (a: number) => Math.ceil(bounds.max[a]) + PAD;
  const maxR = Math.ceil(Math.max(...[0, 1, 2].map((a) => bounds.max[a] - bounds.min[a]))) / 2 + PAD;
  const setEdge = (side: "min" | "max", a: number) => (v: number) => {
    if (region.kind !== "box") return;
    const cur: Vec3 = side === "min" ? region.min : region.max;
    const other = side === "min" ? region.max[a] - STEP : region.min[a] + STEP;
    const next = cur.map((x, i) => (i === a ? (side === "min" ? Math.min(v, other) : Math.max(v, other)) : x)) as Vec3;
    onChange(side === "min" ? { ...region, min: next } : { ...region, max: next });
  };
  const setCenter = (a: number) => (v: number) => region.kind !== "box" && onChange({ ...region, center: region.center.map((x, i) => (i === a ? v : x)) as Vec3 });
  return (
    <>
      <div>
        <span className="field-label">Forma da região</span>
        <Segmented label="Forma da região" value={region.kind} options={KINDS} onChange={(k) => onChange(regionOfKind(k, regionBox(region)))} full />
      </div>
      {region.kind === "box" ? (
        <div className="grid two">
          {[0, 1, 2].flatMap((a) => [
            <Slider key={`${a}min`} label={`${NAMES[a]} de`} min={lo(a)} max={hi(a)} step={STEP} value={region.min[a]} display={mm} onChange={setEdge("min", a)} />,
            <Slider key={`${a}max`} label={`${NAMES[a]} até`} min={lo(a)} max={hi(a)} step={STEP} value={region.max[a]} display={mm} onChange={setEdge("max", a)} />,
          ])}
        </div>
      ) : (
        <>
          <div className="grid two">
            {[0, 1, 2].map((a) => (
              <Slider key={a} label={`Centro ${NAMES[a]}`} min={lo(a)} max={hi(a)} step={STEP} value={region.center[a]} display={mm} onChange={setCenter(a)} />
            ))}
            <Slider label="Raio" min={1} max={maxR} step={STEP} value={Math.min(region.radius, maxR)} display={mm} onChange={(v) => onChange({ ...region, radius: v })} />
          </div>
          {region.kind === "cylinder" && (
            <>
              <Slider label="Comprimento do cilindro" min={1} max={maxR * 2} step={STEP} value={Math.min(region.height, maxR * 2)} display={mm} onChange={(v) => onChange({ ...region, height: v })} />
              <div>
                <span className="field-label">Posição do cilindro</span>
                <Segmented label="Posição do cilindro" value={region.axis} options={AXES} onChange={(axis) => onChange({ ...region, axis })} full />
              </div>
            </>
          )}
        </>
      )}
    </>
  );
}
