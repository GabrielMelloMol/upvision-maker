import NumField from "../../ui/NumField";
import Toggle from "../../ui/Toggle";
import ColorPick from "../ColorPick";
import type { DrawerModule } from "./layout";

type Patch = Partial<Omit<DrawerModule, "id" | "x" | "y" | "w" | "h">>;
type Props = { modules: DrawerModule[]; uMax: number; onChange: (patch: Patch) => void; onDuplicate: () => void; onRemove: () => void };

/** Ajustes dos módulos selecionados (#140): o que mudar vale para todos; os campos mostram o 1º. */
export default function ModulePanel({ modules, uMax, onChange, onDuplicate, onRemove }: Props) {
  const m = modules[0];
  const many = modules.length > 1;
  return (
    <div className="card stack" aria-label="Módulo selecionado">
      <h3>{many ? `${modules.length} caixinhas` : `Caixinha ${m.w}×${m.h}`}</h3>
      <div className="grid two">
        <NumField label="Altura (unidades de 7 mm)" value={m.u} onChange={(u) => onChange({ u })} min={2} max={Math.max(2, uMax)} step={1} unit="" hint={`Cabe até ${uMax} nesta gaveta.`} />
        <NumField label="Divisões na largura" value={m.dividersX} onChange={(dividersX) => onChange({ dividersX })} min={1} max={8} step={1} unit="" />
        <NumField label="Divisões na profundidade" value={m.dividersY} onChange={(dividersY) => onChange({ dividersY })} min={1} max={8} step={1} unit="" />
      </div>
      <Toggle label="Aba de etiqueta" checked={m.labelTab} onChange={(labelTab) => onChange({ labelTab })} />
      {m.labelTab && (
        <label>
          Etiqueta (texto)
          <input value={m.label} maxLength={24} onChange={(e) => onChange({ label: e.target.value })} />
        </label>
      )}
      <Toggle label="Rampa para pegar" checked={m.scoop} onChange={(scoop) => onChange({ scoop })} />
      <Toggle label="Borda empilhável" checked={m.lip} onChange={(lip) => onChange({ lip })} />
      <Toggle label="Furos de ímã 6×2" checked={m.magnets} onChange={(magnets) => onChange({ magnets })} />
      <ColorPick label="Cor" value={m.color} onChange={(color) => onChange({ color })} />
      <div className="row">
        <button type="button" className="ghost" onClick={onDuplicate}>
          Duplicar
        </button>
        <button type="button" className="ghost danger" onClick={onRemove}>
          Apagar
        </button>
      </div>
    </div>
  );
}
