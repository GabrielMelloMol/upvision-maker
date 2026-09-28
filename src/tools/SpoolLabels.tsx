import { CheckCheck, Cylinder, FileDown, PackageCheck, PackageMinus } from "lucide-react";
import { useState } from "react";
import { getDb } from "../db";
import { filaments as filamentsRepo } from "../db/repo";
import type { Db } from "../db/types";
import type { Filament } from "../domain/entities";
import { parseFilamentQr } from "../domain/spoolQr";
import { loadFont } from "../geometry/fonts";
import { layoutOnPlate } from "../geometry/keychain";
import { getManifold } from "../geometry/manifold";
import { buildSpoolTag } from "../geometry/spoolTag";
import { textToCrossSection } from "../geometry/text";
import { loadPdfFonts } from "../pdf/fonts";
import { spoolLabelsPdf, type LabelLayout } from "../pdf/spoolLabels";
import Alert from "../ui/Alert";
import { colorSwatch } from "../ui/ColorDots";
import EmptyState from "../ui/EmptyState";
import ExportButtons from "../ui/ExportButtons";
import NumField, { inRange } from "../ui/NumField";
import Preview3D from "../ui/Preview3D";
import { saveFile } from "../ui/saveFile";
import Segmented from "../ui/Segmented";
import { errorText, useToast } from "../ui/Toast";
import { useData } from "../ui/useData";
import { useModelBuilder } from "../ui/useModelBuilder";
import QrScanner from "./QrScanner";

const load = (db: Db) => filamentsRepo.list(db);
const LAYOUTS: [LabelLayout, string][] = [
  ["a4", "Folha A4"],
  ["roll", "Etiquetadora 50 × 30"],
];
const PLATE_MM = 256;
const GAP_MM = 4;
const MAX_TAGS = 30;
const grams = (g: number) => `${Math.round(g).toLocaleString("pt-BR")} g`;
const title = (f: Filament) => [f.material, f.color].filter(Boolean).join(" ");
const hex = (f: Filament) => {
  const c = colorSwatch(f.color);
  return c && c !== "transparent" ? c : null;
};

/** Etiqueta QR por rolo (estilo Spoolman): imprime etiqueta ou plaquinha 3D e, lendo o QR, dá baixa ou marca o rolo como acabado. */
export default function SpoolLabels() {
  const [rows, reload, loading] = useData(load, [] as Filament[]);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [layout, setLayout] = useState<LabelLayout>("a4");
  const [scanned, setScanned] = useState<{ id: number } | { unknown: string } | null>(null);
  const [use, setUse] = useState(50);
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const chosen = rows.filter((f) => picked.has(f.id));
  const toggle = (id: number) => setPicked((s) => (s.has(id) ? new Set([...s].filter((x) => x !== id)) : new Set([...s, id])));

  const { models, warnings, busy, error } = useModelBuilder(async () => {
    if (!chosen.length) return null;
    const M = await getManifold();
    const font = await loadFont("hanken");
    const text = (s: string, h: number) => (s.trim() ? textToCrossSection(M, font, s, h) : null);
    const tags = chosen.slice(0, MAX_TAGS).map((f) => buildSpoolTag(M, text, { id: f.id, title: title(f), color: hex(f) }));
    const warn = chosen.length > MAX_TAGS ? [`Só as primeiras ${MAX_TAGS} plaquinhas cabem numa mesa.`] : [];
    return { models: tags.length > 1 ? layoutOnPlate(tags, PLATE_MM - 2 * GAP_MM, GAP_MM) : tags, warnings: warn };
  }, [chosen.map((f) => `${f.id}:${f.material}:${f.color}`).join("|")]);

  async function savePdf() {
    setSaving(true);
    try {
      const labels = chosen.map((f) => ({ id: f.id, title: title(f), subtitle: f.brand, detail: `Rolo de ${grams(f.spoolG)}` }));
      const { bytes } = await spoolLabelsPdf(await loadPdfFonts(), labels, layout);
      const p = await saveFile("etiquetas-de-rolo.pdf", bytes, "pdf", "PDF");
      if (p) toast(`Etiquetas salvas em ${p}`);
    } catch (e) {
      toast(`Não foi possível salvar: ${errorText(e)}`, "error");
    } finally {
      setSaving(false);
    }
  }

  function onCode(text: string) {
    const id = parseFilamentQr(text);
    setScanned(id !== null ? { id } : { unknown: text });
  }

  const current = scanned && "id" in scanned ? rows.find((f) => f.id === scanned.id) : undefined;

  async function act(kind: "consume" | "finish") {
    if (!current) return;
    try {
      const db = await getDb();
      const left = kind === "consume" ? await filamentsRepo.consume(db, current.id, use) : await filamentsRepo.finishSpool(db, current.id);
      toast(kind === "consume" ? `Baixa de ${grams(use)} em ${title(current)}. Estoque: ${grams(left)}.` : `Rolo de ${title(current)} marcado como acabado. Estoque: ${grams(left)}.`);
      reload();
    } catch (e) {
      toast(errorText(e), "error");
    }
  }

  return (
    <div className="page">
      <h1>Etiquetas de rolo</h1>
      <p className="lead">Um QR por filamento: cole no carretel, leia com a câmera e dê baixa ou marque o rolo como acabado.</p>
      <div className="tool-layout">
        <div className="controls">
          <div className="card stack">
            <h3>Ler etiqueta</h3>
            <QrScanner onCode={onCode} />
            {scanned && "unknown" in scanned && <Alert kind="warn">Esse QR não é uma etiqueta de rolo do UpVision Maker.</Alert>}
            {scanned && "id" in scanned && !current && !loading && <Alert kind="warn">Filamento #{scanned.id} não está mais cadastrado.</Alert>}
            {current && (
              <div className="stack" aria-label="Rolo lido">
                <p>
                  <strong>{title(current)}</strong> {current.brand && `· ${current.brand}`} · #{current.id}
                  <br />
                  <span className="muted">
                    Estoque {grams(current.stockG)} · rolo de {grams(current.spoolG)}
                  </span>
                </p>
                <NumField label="Usei" value={use} onChange={setUse} min={1} max={5000} step={1} unit="g" />
                <div className="row">
                  <button className="primary" disabled={!inRange(use, 1, 5000)} onClick={() => act("consume")}>
                    <PackageMinus aria-hidden /> Dar baixa
                  </button>
                  <button onClick={() => act("finish")}>
                    <PackageCheck aria-hidden /> Rolo acabou
                  </button>
                </div>
              </div>
            )}
          </div>
          <div className="card stack">
            <h3>Imprimir etiquetas</h3>
            {!loading && !rows.length ? (
              <EmptyState icon={Cylinder} title="Nenhum filamento cadastrado">
                Cadastre os rolos em Filamentos para gerar as etiquetas.
              </EmptyState>
            ) : (
              <>
                <div className="row">
                  <button className="link" onClick={() => setPicked(picked.size === rows.length ? new Set() : new Set(rows.map((f) => f.id)))}>
                    <CheckCheck aria-hidden /> {picked.size === rows.length ? "Desmarcar todos" : "Marcar todos"}
                  </button>
                  <span className="hint">{picked.size} escolhidos</span>
                </div>
                <div className="stack">
                  {rows.map((f) => (
                    <label key={f.id} className="check">
                      <input type="checkbox" checked={picked.has(f.id)} onChange={() => toggle(f.id)} />{" "}
                      <span className="swatch-inline">{hex(f) && <i style={{ background: hex(f)! }} />}</span> {title(f)} {f.brand && <span className="muted">· {f.brand}</span>}
                    </label>
                  ))}
                </div>
                <Segmented label="Formato da etiqueta" value={layout} options={LAYOUTS} onChange={setLayout} full />
                <button className="action" disabled={!chosen.length || saving} onClick={savePdf}>
                  <FileDown aria-hidden /> Salvar etiquetas (PDF)
                </button>
              </>
            )}
          </div>
          <ExportButtons models={models} name="plaquinhas-de-rolo" busy={busy} />
        </div>
        <div className="preview-col">
          <Preview3D models={models} busy={busy} busyText="Gerando plaquinhas…" error={error} emptyText="Escolha filamentos para ver as plaquinhas 3D com QR." />
          {warnings.map((w) => (
            <Alert key={w} kind="warn">{w}</Alert>
          ))}
        </div>
      </div>
    </div>
  );
}
