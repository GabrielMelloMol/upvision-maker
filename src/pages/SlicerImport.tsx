import { FileInput } from "lucide-react";
import { useState } from "react";
import type { Filament, Printer } from "../domain/entities";
import { parseSlicerFile, SLICER_ACCEPT, type SlicerReport } from "../domain/slicer";
import { colorHex, matchFilament, matchPrinter } from "../domain/slicer/match";
import Alert from "../ui/Alert";
import Card from "../ui/Card";
import Dropzone from "../ui/Dropzone";
import { errorText } from "../ui/Toast";

export type SlicerApply = {
  filaments: { filamentId: number | null; grams: number }[];
  printerId: number | null;
  seconds?: number;
  pieces?: number;
};

type Props = { stock: Filament[]; printers: Printer[]; onApply: (a: SlicerApply) => void };

const duration = (s: number) => {
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return h ? `${h} h ${m} min` : `${m} min`;
};

/** Arrasta o arquivo do fatiador → mostra o que foi lido e preenche a calculadora. Cada filamento pode ser trocado. */
export default function SlicerImport({ stock, printers, onApply }: Props) {
  const [file, setFile] = useState<string | null>(null);
  const [report, setReport] = useState<SlicerReport | null>(null);
  const [mapping, setMapping] = useState<(number | null)[]>([]);
  const [error, setError] = useState<string | null>(null);

  const apply = (r: SlicerReport, map: (number | null)[]) =>
    onApply({
      filaments: r.filaments.map((f, i) => ({ filamentId: map[i], grams: f.grams ?? 0 })),
      printerId: matchPrinter(r.printer, printers),
      seconds: r.seconds,
      pieces: r.pieces,
    });

  async function onFile(f: File) {
    setError(null);
    try {
      const r = parseSlicerFile(f.name, new Uint8Array(await f.arrayBuffer()));
      const map = r.filaments.map((x) => matchFilament(x, stock));
      setFile(f.name);
      setReport(r);
      setMapping(map);
      apply(r, map);
    } catch (e) {
      setReport(null);
      setError(errorText(e));
    }
  }

  function remap(i: number, id: string) {
    if (!report) return;
    const map = mapping.map((m, j) => (j === i ? (id ? Number(id) : null) : m));
    setMapping(map);
    apply(report, map);
  }

  const printer = report && printers.find((p) => p.id === matchPrinter(report.printer, printers));

  return (
    <Card title="Importar do fatiador" icon={FileInput}>
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
                  <td className="num">{f.grams?.toLocaleString("pt-BR") ?? "—"}</td>
                  <td>
                    <select value={mapping[i] ?? ""} onChange={(e) => remap(i, e.target.value)} aria-label={`Filamento cadastrado para o filamento ${f.index}`}>
                      <option value="">Nenhum (digitar preço)</option>
                      {stock.map((s) => (
                        <option key={s.id} value={s.id}>
                          {[s.material, s.color, s.brand].filter(Boolean).join(" · ")}
                        </option>
                      ))}
                    </select>
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
