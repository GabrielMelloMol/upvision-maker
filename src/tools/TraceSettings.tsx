import Segmented from "../ui/Segmented";
import Slider from "../ui/Slider";
import { type TraceMode, type TraceOptions } from "../vectorize/pipeline";
import type { Subject } from "../vectorize/segment";

const CLEANUP_LABELS = ["Nenhuma", "Leve", "Média", "Forte"];
const COLOR_COUNTS = [
  ["1", "1 cor"],
  ["2", "2"],
  ["3", "3"],
  ["4", "4"],
] as const;

type Props = {
  opts: TraceOptions;
  set: <K extends keyof TraceOptions>(k: K, v: TraceOptions[K]) => void;
  subject: Subject;
  onSubject: (s: Subject) => void;
  useFilaments: boolean;
  onUseFilaments: (v: boolean) => void;
  /** Quantas cores de filamento cadastradas (0 = sem paleta). */
  filamentCount: number;
  /** Limiar que o último resultado usou (para o "automático" virar manual no mesmo ponto). */
  autoThreshold: number | null;
  /** Altura/largura da imagem, para mostrar a altura final. */
  aspect: number | null;
};

/** Card "Ajustes" do Imagem → SVG: modo, cores, limiar/limpeza ou recorte da silhueta, detalhe e tamanho. */
export default function TraceSettings({ opts, set, subject, onSubject, useFilaments, onUseFilaments, filamentCount, autoThreshold, aspect }: Props) {
  const silhouette = opts.mode === "silhouette";
  const colorMode = !silhouette && opts.colors > 1;
  return (
    <div className="card stack">
      <h3>Ajustes</h3>
      <div className="seg" role="group" aria-label="Modo">
        {(
          [
            ["logo", "Logo / desenho"],
            ["silhouette", "Silhueta"],
          ] as [TraceMode, string][]
        ).map(([m, label]) => (
          <button key={m} aria-pressed={opts.mode === m} onClick={() => set("mode", m)}>
            {label}
          </button>
        ))}
      </div>
      <span className="hint">
        {silhouette
          ? "Recorta só o contorno do objeto principal, cheio e liso. Ideal para cortador de pessoa ou pet."
          : "Para logos, desenhos e textos: separa o escuro do claro."}
      </span>
      {!silhouette && (
        <div>
          <span className="field-label">Cores</span>
          <Segmented label="Cores" value={String(opts.colors) as "1"} options={COLOR_COUNTS} onChange={(v) => set("colors", Number(v))} full />
        </div>
      )}
      {colorMode && (
        <>
          <span className="hint">Cada cor vira uma camada que se encaixa na outra, sem frestas: pronta para extrudar ou fazer chaveiro e medalha multicor.</span>
          <label className="check">
            <input type="checkbox" checked={useFilaments && filamentCount > 0} disabled={!filamentCount} onChange={(e) => onUseFilaments(e.target.checked)} /> Usar as
            cores dos filamentos cadastrados
          </label>
          {!filamentCount && <span className="hint">Cadastre filamentos com cor em Filamentos para usar a paleta deles.</span>}
        </>
      )}
      {silhouette ? (
        <>
          <label>
            Recortar
            <select value={subject} onChange={(e) => onSubject(e.target.value as Subject)}>
              <option value="person">Pessoa (IA local)</option>
              <option value="pet">Pet ou objeto (IA local)</option>
              <option value="plain">Objeto em fundo liso (sem IA)</option>
            </select>
          </label>
          <Slider
            label="Suavização do contorno"
            min={0}
            max={4}
            step={0.5}
            value={opts.smoothMm}
            display={(v) => `${v.toLocaleString("pt-BR")} mm`}
            onChange={(v) => set("smoothMm", v)}
            hint="Mais suave = contorno mais redondo, sem pontinhas."
          />
        </>
      ) : colorMode ? (
        <label className="check">
          <input type="checkbox" checked={opts.removeBg} onChange={(e) => set("removeBg", e.target.checked)} /> Remover fundo automaticamente
        </label>
      ) : (
        <>
          <label className="check">
            <input
              type="checkbox"
              checked={opts.threshold === null}
              onChange={(e) => set("threshold", e.target.checked ? null : (autoThreshold ?? 160))}
            />{" "}
            Limiar automático
          </label>
          <Slider
            label="Limiar (claro ↔ escuro)"
            min={20}
            max={245}
            value={opts.threshold ?? autoThreshold ?? 160}
            disabled={opts.threshold === null}
            onChange={(v) => set("threshold", v)}
            hint="Mais alto = tons mais claros também viram forma."
          />
          <Slider
            label="Limpeza"
            min={0}
            max={3}
            value={opts.cleanup}
            display={(v) => CLEANUP_LABELS[v]}
            onChange={(v) => set("cleanup", v)}
            hint="Suaviza ruído e fecha furinhos antes de vetorizar."
          />
          <label className="check">
            <input type="checkbox" checked={opts.thicken} onChange={(e) => set("thicken", e.target.checked)} /> Engrossar traços finos (mín. 0,4 mm)
          </label>
          <label className="check">
            <input type="checkbox" checked={opts.removeBg} onChange={(e) => set("removeBg", e.target.checked)} /> Remover fundo automaticamente
          </label>
          <label className="check">
            <input type="checkbox" checked={opts.invert} onChange={(e) => set("invert", e.target.checked)} /> O desenho é claro sobre fundo escuro
          </label>
        </>
      )}
      <Slider
        label="Detalhe"
        min={1}
        max={10}
        value={opts.detail}
        onChange={(v) => set("detail", v)}
        hint="Menos detalhe = curvas mais simples e arquivo menor."
      />
      <label>
        Ignorar pedaços menores que (mm²)
        <input
          type="number"
          min={0}
          max={100}
          step={0.5}
          value={opts.minAreaMm2}
          onChange={(e) => set("minAreaMm2", Math.max(0, e.target.valueAsNumber || 0))}
        />
      </label>
      <label>
        Largura final (mm)
        <input type="number" min={1} max={1000} value={Number.isFinite(opts.widthMm) ? opts.widthMm : ""} onChange={(e) => set("widthMm", e.target.valueAsNumber)} />
        <span className="hint">A altura acompanha a proporção{aspect && opts.widthMm > 0 ? `: ${(opts.widthMm * aspect).toFixed(1)} mm` : ""}.</span>
      </label>
    </div>
  );
}
