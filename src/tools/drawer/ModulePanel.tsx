import NumField from "../../ui/NumField";
import Toggle from "../../ui/Toggle";
import ColorPick from "../ColorPick";
import DividerFields from "./DividerFields";
import { footprint, sizeOf, type DrawerModule } from "./layout";

type Patch = Partial<Omit<DrawerModule, "id" | "x" | "y" | "w" | "h">>;
type Props = { modules: DrawerModule[]; uMax: number; onChange: (patch: Patch) => void; onResize: (w: number, h: number) => void; onFree: (size: { w: number; d: number } | null) => void; onCopy: () => void; onPaste: () => void; canPaste: boolean; onDuplicate: () => void; onRemove: () => void };

/** Ajustes dos módulos selecionados (#140): o que mudar vale para todos; os campos mostram o 1º. */
export default function ModulePanel({ modules, uMax, onChange, onResize, onFree, onCopy, onPaste, canPaste, onDuplicate, onRemove }: Props) {
  const m = modules[0];
  const many = modules.length > 1;
  return (
    <div className="card stack" aria-label="Módulo selecionado">
      <h3>{many ? `${modules.length} caixinhas` : `Caixinha ${String(m.w).replace(".", ",")}×${String(m.h).replace(".", ",")}`}</h3>
      <div className="grid two">
        <NumField label="Altura (unidades de 7 mm)" value={m.u} onChange={(u) => onChange({ u })} min={2} max={Math.max(2, uMax)} step={1} unit="" hint={`Cabe até ${uMax} nesta gaveta.`} />
        {!many && m.freeW === undefined && <NumField label="Largura (casas)" value={m.w} onChange={(w) => onResize(w, m.h)} min={0.5} max={12} step={0.5} unit="" hint="Meia casa = 21 mm." />}
        {!many && m.freeW === undefined && <NumField label="Profundidade (casas)" value={m.h} onChange={(h) => onResize(m.w, h)} min={0.5} max={12} step={0.5} unit="" />}
      </div>
      {!many && (
        <Toggle label="Sem grade: medida livre em mm (sem pés Gridfinity)" checked={m.freeW !== undefined} onChange={(on) => onFree(on ? { w: Math.round(sizeOf(m, "x")), d: Math.round(sizeOf(m, "y")) } : null)} />
      )}
      {!many && m.freeW !== undefined && m.freeD !== undefined && (
        <div className="grid two">
          <NumField label="Largura da caixinha" value={m.freeW} onChange={(w) => onFree({ w, d: m.freeD! })} min={15} max={500} step={0.5} unit="mm" hint={`Ocupa ${String(footprint(m.freeW)).replace(".", ",")} casa(s) no mapa.`} />
          <NumField label="Profundidade da caixinha" value={m.freeD} onChange={(d) => onFree({ w: m.freeW!, d })} min={15} max={500} step={0.5} unit="mm" hint={`Ocupa ${String(footprint(m.freeD)).replace(".", ",")} casa(s) no mapa.`} />
        </div>
      )}
      {many ? (
        <>
          <NumField label="Divisões na largura" value={m.dividersX} onChange={(dividersX) => onChange({ dividersX, cutsX: undefined })} min={1} max={8} step={1} unit="" />
          <NumField label="Divisões na profundidade" value={m.dividersY} onChange={(dividersY) => onChange({ dividersY, cutsY: undefined })} min={1} max={8} step={1} unit="" />
        </>
      ) : (
        <>
          <DividerFields module={m} axis="x" onChange={onChange} />
          <DividerFields module={m} axis="y" onChange={onChange} />
        </>
      )}
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
        <button type="button" className="ghost" onClick={onCopy}>
          Copiar
        </button>
        <button type="button" className="ghost" onClick={onPaste} disabled={!canPaste}>
          Colar
        </button>
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
