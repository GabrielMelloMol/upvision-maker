import Segmented from "../../../ui/Segmented";

type Props = { views: { id: string; label: string; note?: string }[]; value: string; onChange: (id: string) => void };

/** Abas das vistas da prévia (compartimentos, aberta, fechada, peças na mesa): a nota da vista ativa fica embaixo. */
export default function ViewTabs({ views, value, onChange }: Props) {
  const note = views.find((v) => v.id === value)?.note;
  return (
    <div className="view-tabs">
      <Segmented label="Vista da prévia" value={value} options={views.map((v) => [v.id, v.label] as const)} onChange={onChange} full />
      {note && <p className="hint">{note}</p>}
    </div>
  );
}
