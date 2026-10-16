import { compartments, lidFitsBeside } from "../../geometry/mosaic/pot";
import { kitColors } from "../../geometry/mosaic/kit";
import type { PotShape } from "../../geometry/mosaic/params";
import NumField from "../../ui/NumField";
import Segmented from "../../ui/Segmented";
import Toggle from "../../ui/Toggle";
import ColorPick from "../ColorPick";
import type { State } from "./state";
import type { Tool } from "./tool";

const SHAPES = [["round", "Redondo"], ["rect", "Retangular"]] as const;

/** Aba Pote: pote redondo ou retangular com uma divisória por cor, e tampa. */
export default function PotPanel({ tool }: { tool: Tool }) {
  const s = tool.state;
  const p = s.pot;
  const setP = <K extends keyof State["pot"]>(k: K) => (v: State["pot"][K]) => tool.set((cur) => ({ ...cur, pot: { ...cur.pot, [k]: v } }), `pot.${String(k)}`);
  const n = kitColors(s, true).length;
  const slots = compartments(p, n);
  return (
    <div className="stack">
      <div className="card stack">
        <h3>Pote</h3>
        <Segmented label="Formato do pote" value={p.shape} options={SHAPES} onChange={(v: PotShape) => setP("shape")(v)} full />
        <div className="grid two">
          <NumField label={p.shape === "round" ? "Diâmetro" : "Largura"} value={p.w} onChange={setP("w")} min={80} max={250} step={5} />
          {p.shape === "rect" && <NumField label="Profundidade" value={p.d} onChange={setP("d")} min={60} max={250} step={5} />}
          <NumField label="Altura" value={p.height} onChange={setP("height")} min={20} max={120} step={1} />
        </div>
        <span className="hint">
          {n} {n === 1 ? "cor ligada" : "cores ligadas"}: o pote ganha {slots} {slots === 1 ? "divisória" : "divisórias"}{slots > n ? ` (${slots - n} sobra para o que quiser)` : ""}. Ligue ou desligue as cores na aba Peças.
        </span>
        <ColorPick label="Cor do pote" value={p.color} onChange={setP("color")} />
      </div>
      <div className="card stack">
        <h3>Tampa</h3>
        <Toggle label="Fazer a tampa" checked={p.lid} onChange={setP("lid")} />
        {p.lid && (
          <>
            <span className="hint">A tampa cobre a boca por fora, como a de uma lata. Ela sai virada, com a saia para cima: sem suporte. {lidFitsBeside(p) ? "No arquivo fica ao lado do pote." : "Pote e tampa não cabem juntos na mesa: no arquivo a tampa fica numa mesa só dela (no fatiador, é a segunda mesa)."}</span>
            <ColorPick label="Cor da tampa" value={p.lidColor} onChange={setP("lidColor")} />
          </>
        )}
      </div>
      <details className="advanced">
        <summary>Opções avançadas</summary>
        <div className="grid two">
          <NumField label="Parede" value={p.wall} onChange={setP("wall")} min={1.2} max={3} step={0.1} />
          <NumField label="Fundo" value={p.floor} onChange={setP("floor")} min={1} max={3} step={0.1} />
          <NumField label="Folga da tampa" value={p.lidClearance} onChange={setP("lidClearance")} min={0.1} max={0.6} step={0.05} hint="Entre a tampa e o pote." />
        </div>
      </details>
    </div>
  );
}
