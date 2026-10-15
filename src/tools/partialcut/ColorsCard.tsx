import Toggle from "../../ui/Toggle";
import { PIECE_PALETTE, type CutItem } from "../../geometry/cutSequence";
import ColorPick from "../ColorPick";

type Props = {
  cuts: CutItem[];
  restColor: string | null;
  onPiece: (index: number, color: string | null) => void;
  onRest: (color: string | null) => void;
};

/** Cor de cada peça do arquivo (o resto e todos os pedaços de uma vez): cada cor vira um filamento no 3MF. */
export default function ColorsCard({ cuts, restColor, onPiece, onRest }: Props) {
  const many = cuts.length > 1;
  const rows = [
    { key: "rest", label: "Resto", color: restColor, set: onRest, suggest: "#2563eb" },
    ...cuts.map((c, i) => ({ key: `p${i}`, label: many ? `Pedaço ${i + 1}` : "Pedaço", color: c.color, set: (v: string | null) => onPiece(i, v), suggest: PIECE_PALETTE[i % PIECE_PALETTE.length] })),
  ];
  return (
    <div className="card stack">
      <h3>Cores das peças</h3>
      {rows.map((r) => (
        <div key={r.key} className="stack">
          <Toggle label={`${r.label} em outra cor`} checked={r.color !== null} onChange={(on) => r.set(on ? r.suggest : null)} />
          {r.color !== null && <ColorPick label={`Cor: ${r.label.toLowerCase()}`} value={r.color} onChange={r.set} />}
        </div>
      ))}
      <span className="hint">Sem escolha, a peça fica com a cor do arquivo. Cada cor vira um filamento: no Bambu Studio cada objeto abre no extrusor certo. Escolha entre os seus filamentos do estoque.</span>
    </div>
  );
}
