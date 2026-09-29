import { useState } from "react";
import { splitByColor, type SplitMode } from "../geometry/colorSplit";
import { getManifold } from "../geometry/manifold";
import { read3mf } from "../geometry/threemfRead";
import Alert from "../ui/Alert";
import Dropzone from "../ui/Dropzone";
import ExportButtons from "../ui/ExportButtons";
import NumField, { inRange } from "../ui/NumField";
import Preview3D from "../ui/Preview3D";
import Segmented from "../ui/Segmented";
import { useModelBuilder } from "../ui/useModelBuilder";

const MODES: [SplitMode, string][] = [
  ["parts", "Partes (multicor)"],
  ["objects", "Objetos separados"],
];
const PLA_G_PER_CM3 = 1.24;
const MAX_BYTES = 200 * 1024 * 1024;

/** Separador 3MF por cor (#14): lê a pintura do Bambu Studio / OrcaSlicer / PrusaSlicer e separa em volumes por cor. */
export default function ColorSplit() {
  const [file, setFile] = useState<{ name: string; bytes: Uint8Array } | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [depth, setDepth] = useState(1);
  const [mode, setMode] = useState<SplitMode>("parts");
  const [colors, setColors] = useState<{ filament: number; color: string; volume: number }[]>([]);

  async function onFile(f: File) {
    setFileError(null);
    if (!f.name.toLowerCase().endsWith(".3mf")) return setFileError("Envie o arquivo .3mf (STL não guarda a pintura por cor).");
    if (f.size > MAX_BYTES) return setFileError("Arquivo maior que 200 MB.");
    setFile({ name: f.name.replace(/\.3mf$/i, ""), bytes: new Uint8Array(await f.arrayBuffer()) });
  }

  const valid = inRange(depth, 0.2, 10);
  const { models, warnings, busy, error } = useModelBuilder(async () => {
    if (!file || !valid) return null;
    const M = await getManifold();
    const out = splitByColor(M, read3mf(file.bytes), { depth, mode });
    setColors(out.colors);
    return { models: out.models, warnings: out.warnings };
  }, [file, depth, mode, valid]);

  return (
    <div className="page">
      <h1>Separar 3MF por cor</h1>
      <p className="lead">Abra um 3MF pintado no Bambu Studio, OrcaSlicer ou PrusaSlicer e cada cor vira uma peça sólida, pronta para multicor ou para imprimir separado.</p>
      <div className="tool-layout">
        <div className="controls">
          <div className="card stack">
            <Dropzone accept=".3mf" label={file ? `${file.name}.3mf` : "Arraste o .3mf pintado"} hint="Pintura por cor (pincel) ou partes de cores diferentes." onFile={onFile} />
            {fileError && <Alert kind="error">{fileError}</Alert>}
          </div>
          <div className="card stack">
            <h3>Separação</h3>
            <NumField label="Profundidade da cor" value={depth} onChange={setDepth} min={0.2} max={10} step={0.1} hint="Quanto cada cor pintada entra na peça. 1 mm cobre bem com 2–3 camadas por cima." />
            <div>
              <span className="field-label">Saída</span>
              <Segmented label="Saída" value={mode} options={MODES} onChange={setMode} full />
            </div>
            <span className="hint">{mode === "parts" ? "Um objeto com uma parte por cor: o fatiador troca de filamento (AMS)." : "Cada cor vira um objeto separado, apoiado na mesa: imprime cada um na sua cor e cola."}</span>
          </div>
          {colors.length > 0 && models.length > 0 && (
            <div className="card stack" aria-label="Cores encontradas">
              <h3>Cores encontradas</h3>
              <ul className="stack">
                {colors.map((c) => (
                  <li key={c.filament}>
                    <span className="swatch-inline">
                      <i style={{ background: c.color }} />
                      Filamento {c.filament}
                    </span>{" "}
                    <span className="muted">
                      · {(c.volume / 1000).toFixed(1).replace(".", ",")} cm³ · ~{Math.round((c.volume / 1000) * PLA_G_PER_CM3)} g de PLA (maciço)
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <ExportButtons models={models} name={`${file?.name ?? "separado"}-cores`} busy={busy} />
        </div>
        <div className="preview-col">
          <Preview3D models={models} busy={busy} busyText="Separando as cores…" error={error} emptyText={!valid ? "Corrija os campos em vermelho." : "Envie um 3MF pintado para separar as cores."} />
          {warnings.map((w) => (
            <Alert key={w} kind="warn">{w}</Alert>
          ))}
        </div>
      </div>
    </div>
  );
}
