import { FileInput } from "lucide-react";
import { useEffect, useState } from "react";
import type { Filament, Printer } from "../domain/entities";
import { parseSlicerFile, SLICER_ACCEPT, type SlicerReport } from "../domain/slicer";
import { gramsFromMeters } from "../domain/slicer/gcodeText";
import type { SlicerFilament } from "../domain/slicer/types";
import { colorHex, filamentDraft, isCloseMatch, matchFilament, matchPrinter } from "../domain/slicer/match";
import { FILAMENT_COLORS } from "../ui/ColorDots";
import NewFilamentSheet from "./calculator/NewFilamentSheet";
import Alert from "../ui/Alert";
import Card from "../ui/Card";
import Dropzone from "../ui/Dropzone";
import { errorText } from "../ui/Toast";

/** Tudo que a calculadora precisa, já resolvido a partir das MESMAS listas usadas no casamento
 *  (a calculadora não busca de novo: evita usar um cadastro desatualizado). */
export type SlicerApply = {
  filaments: { filamentId: number | null; pricePerKg: number | null; grams: number }[];
  printerId: number | null;
  printerWatts: number | null;
  seconds?: number;
  pieces?: number;
  /** Nome da peça sugerido pelo arquivo. */
  name?: string;
};

type Props = {
  stock: Filament[];
  printers: Printer[];
  onApply: (a: SlicerApply) => void;
  /** Um filamento foi cadastrado aqui: recarregue o estoque. */
  onStockAdded?: () => void;
};

const duration = (s: number) => {
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return h ? `${h} h ${m} min` : `${m} min`;
};

/** Arrasta o arquivo do fatiador → mostra o que foi lido e preenche a calculadora. Cada filamento pode ser trocado. */
export default function SlicerImport({ stock, printers, onApply, onStockAdded }: Props) {
  const [file, setFile] = useState<string | null>(null);
  const [report, setReport] = useState<SlicerReport | null>(null);
  // escolhas feitas à mão; o resto é casado automaticamente com o cadastro ATUAL (que pode chegar depois do arquivo)
  const [overrides, setOverrides] = useState<Record<number, number | null>>({});
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState<number | null>(null);

  const mapping = report ? report.filaments.map((f, i) => (i in overrides ? overrides[i] : matchFilament(f, stock))) : [];
  /** Gramas da linha: as do arquivo ou, quando o fatiador só deu metros, pela densidade do filamento escolhido (#47). */
  const weigh = (f: SlicerFilament, i: number) =>
    f.estimatedDiameterMm !== undefined && f.meters !== undefined
      ? gramsFromMeters(f.meters, stock.find((s) => s.id === mapping[i])?.material ?? f.type, f.estimatedDiameterMm)
      : null;
  const mappingKey = JSON.stringify([mapping, stock.map((x) => [x.id, x.pricePerKg]), printers.map((p) => [p.id, p.watts])]);

  const apply = (r: SlicerReport, map: (number | null)[]) => {
    const printer = printers.find((p) => p.id === matchPrinter(r.printer, printers));
    onApply({
      filaments: r.filaments.map((f, i) => ({ filamentId: map[i], pricePerKg: stock.find((s) => s.id === map[i])?.pricePerKg ?? null, grams: weigh(f, i)?.grams ?? f.grams ?? 0 })),
      printerId: printer?.id ?? null,
      printerWatts: printer?.watts ?? null,
      seconds: r.seconds,
      pieces: r.pieces,
      name: r.name,
    });
  };

  // reaplica quando o arquivo é lido, quando a pessoa troca um filamento ou quando o cadastro termina de carregar
  useEffect(() => {
    if (report) apply(report, mapping);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report, mappingKey]);

  async function onFile(f: File) {
    setError(null);
    try {
      const r = parseSlicerFile(f.name, new Uint8Array(await f.arrayBuffer()));
      setFile(f.name);
      setOverrides({});
      setReport(r);
    } catch (e) {
      setReport(null);
      setError(errorText(e));
    }
  }

  const remap = (i: number, id: string) => setOverrides({ ...overrides, [i]: id ? Number(id) : null });

  const printer = report && printers.find((p) => p.id === matchPrinter(report.printer, printers));

  return (
    <Card title="Importar do fatiador" icon={FileInput}>
      {creating !== null && report && (
        <NewFilamentSheet
          draft={filamentDraft(report.filaments[creating], FILAMENT_COLORS)}
          onSaved={(id) => {
            setOverrides({ ...overrides, [creating]: id });
            setCreating(null);
            onStockAdded?.();
          }}
          onClose={() => setCreating(null)}
        />
      )}
      <Dropzone accept={SLICER_ACCEPT} label={file ?? "Arraste o .3mf fatiado ou o G-code"} hint="Bambu Studio, OrcaSlicer, PrusaSlicer (.gcode/.bgcode) ou Cura" onFile={onFile} />
      {error && <Alert kind="error">{error}</Alert>}
      {report && (
        <div className="stack slicer-report">
          <p className="muted small">
            Lido de <b>{report.source}</b>. Os campos abaixo foram preenchidos; você pode editar tudo.
          </p>
          <div className="metrics">
            <span>
              Impressora <b>{report.printer ?? "—"}</b>
              {report.printer && !printer && " (não cadastrada: potência não preenchida)"}
            </span>
            {report.seconds !== undefined && (
              <span>
                Tempo <b>{duration(report.seconds)}</b>
              </span>
            )}
            {report.pieces !== undefined && (
              <span>
                Peças na mesa <b>{report.pieces}</b>
              </span>
            )}
          </div>
          <table>
            <thead>
              <tr>
                <th>Filamento no arquivo</th>
                <th className="num">Gramas</th>
                <th>Usar o cadastrado</th>
              </tr>
            </thead>
            <tbody>
              {report.filaments.map((f, i) => (
                <tr key={f.index}>
                  <td>
                    <span style={{ display: "inline-block", width: 12, height: 12, borderRadius: 3, border: "1px solid var(--border-strong)", verticalAlign: -1, background: colorHex(f.color) ?? "transparent" }} aria-hidden /> {f.index}. {f.type ?? "?"} {f.color ?? ""}
                  </td>
                  <td className="num">
                    {(weigh(f, i)?.grams ?? f.grams)?.toLocaleString("pt-BR") ?? "—"}
                    {weigh(f, i) && (
                      <span className="hint">
                        {" "}
                        (estimado: {weigh(f, i)!.material} {weigh(f, i)!.density.toLocaleString("pt-BR")} g/cm³)
                      </span>
                    )}
                  </td>
                  <td>
                    <select value={mapping[i] ?? ""} onChange={(e) => remap(i, e.target.value)} aria-label={`Filamento cadastrado para o filamento ${f.index}`}>
                      <option value="">Nenhum (digitar preço)</option>
                      {stock.map((s) => (
                        <option key={s.id} value={s.id}>
                          {[s.material, s.color, s.brand].filter(Boolean).join(" · ")}
                        </option>
                      ))}
                    </select>
                    {!isCloseMatch(f, stock.find((s) => s.id === mapping[i])) && (
                      <button type="button" className="link" onClick={() => setCreating(i)} aria-label={`Cadastrar o filamento ${f.index}`}>
                        Cadastrar este filamento
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {report.warnings.map((w) => (
            <Alert key={w} kind="warn">
              {w}
            </Alert>
          ))}
        </div>
      )}
    </Card>
  );
}
