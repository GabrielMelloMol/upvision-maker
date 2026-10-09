import { DEFAULT_RELIEF, type ReliefParams } from "../geometry/relief";
import NumField from "../ui/NumField";
import Segmented from "../ui/Segmented";
import Toggle from "../ui/Toggle";

export type ReliefSubject = "none" | "person" | "pet";
/** Estado do relevo na tela: os parâmetros da geometria + o que a Silhueta recorta. */
export type ReliefUi = ReliefParams & { subject: ReliefSubject };
export const DEFAULT_RELIEF_UI: ReliefUi = { ...DEFAULT_RELIEF, subject: "none" };
const SUBJECTS: [ReliefSubject, string][] = [
  ["none", "Não separar"],
  ["person", "Pessoa"],
  ["pet", "Bicho"],
];

type Props = { relief: ReliefUi; setRelief: (fn: (o: ReliefUi) => ReliefUi) => void };

/** Relevo a partir de foto (#103): profundidade, base, suavização, gama, realce de bordas, fundo plano e moldura. */
export default function ReliefPanel({ relief, setRelief }: Props) {
  const set = <K extends keyof ReliefUi>(k: K) => (v: ReliefUi[K]) => setRelief((o) => ({ ...o, [k]: v }));
  return (
    <div className="card stack">
      <h3>Relevo</h3>
      <span className="hint">Uma placa em uma cor só, impressa deitada: o claro da foto sobe e o escuro desce. Fica bonita em gesso, pedra ou metal. Serve para rosto e bicho.</span>
      <div className="grid two">
        <NumField label="Profundidade" value={relief.depth} onChange={set("depth")} min={0.5} max={10} step={0.5} hint="Altura do relevo acima da base." />
        <NumField label="Base" value={relief.base} onChange={set("base")} min={0.6} max={5} step={0.2} hint="Espessura lisa embaixo." />
        <NumField label="Suavização" value={relief.smooth} onChange={set("smooth")} min={0} max={3} step={0.1} hint="Tira o serrilhado da foto." />
        <NumField label="Gama" value={relief.gamma} onChange={set("gamma")} min={0.4} max={2.5} step={0.1} unit="" hint="Acima de 1 baixa os tons médios." />
        <NumField label="Realce de bordas" value={Math.round(relief.edge * 100)} onChange={(v) => set("edge")(v / 100)} min={0} max={100} step={5} unit="%" hint="Marca contornos como olhos e pelos." />
        <NumField label="Moldura" value={relief.border} onChange={set("border")} min={0} max={15} step={0.5} />
      </div>
      <Toggle label="Claro = baixo" checked={relief.invert} onChange={set("invert")} hint="Para fundo claro com sujeito escuro." />
      <Segmented label="Fundo plano" value={relief.subject} options={SUBJECTS} onChange={set("subject")} full />
      {relief.subject !== "none" && <span className="hint">Só a pessoa ou o bicho tem relevo; o fundo fica liso na altura da base. A primeira separação baixa um modelo pequeno e pode demorar.</span>}
    </div>
  );
}
