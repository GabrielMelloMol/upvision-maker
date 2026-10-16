import Alert from "./Alert";
import Segmented from "./Segmented";

export type View = "table" | "assembled";
export const VIEWS = [["table", "Mesa (o que imprime)"], ["assembled", "Montada (não imprime)"]] as const;

type Props = { value: View; onChange: (v: View) => void; /** Texto do aviso quando a vista montada está aberta. */ info: string };

/** Alternância da prévia entre o que vai para a mesa de impressão e a peça montada (só para ver): a montada nunca aparece junto das peças da mesa. */
export default function ViewToggle({ value, onChange, info }: Props) {
  return (
    <>
      <Segmented label="O que mostrar" value={value} options={VIEWS} onChange={onChange} full />
      {value === "assembled" && <Alert kind="info">{info}</Alert>}
    </>
  );
}
