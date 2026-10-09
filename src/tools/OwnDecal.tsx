import { useMemo, useState } from "react";
import { getManifold } from "../geometry/manifold";
import { faceAtPoint, faceDirection, faceHighlight, faceSize, planarFaces, readOwnFile, type PlanarFace } from "../geometry/ownModel";
import type { Model } from "../geometry/types";
import Alert from "../ui/Alert";
import Dropzone from "../ui/Dropzone";
import ExportButtons from "../ui/ExportButtons";
import Preview3D from "../ui/Preview3D";
import { errorText } from "../ui/Toast";
import { useModelBuilder } from "../ui/useModelBuilder";
import { applyOwnDecals, OWN_MODEL_ERRORS } from "./models/applyOwn";
import DecalGizmo from "./models/DecalGizmo";
import LayersPanel, { layerValid } from "./models/LayersPanel";
import { useModelLayers, type ModelEdits } from "./models/useModelLayers";
import { restoreBytes, storeBytes } from "./storedFile";
import ToolSessionBar from "./ToolSessionBar";
import { useToolState } from "./useToolState";

const MAX_BYTES = 200 * 1024 * 1024;
const OWN = "own";
const HIGHLIGHT = "#38bdf8";
const mm = (n: number) => n.toFixed(1).replace(".", ",");

const initialState = () => ({ file: null as { name: string; bytes: Uint8Array } | null, faceId: null as string | null, edits: {} as ModelEdits });
type OwnState = ReturnType<typeof initialState>;

/**
 * Decal em modelo próprio (#113): abre um STL ou 3MF, a pessoa clica numa face plana (ou escolhe na lista) e põe texto
 * ou desenho nela com o gizmo; a cor entra na peça rente à face (como o Separador) e sai no 3MF multicor.
 */
export default function OwnDecal() {
  const tool = useToolState("owndecal", initialState, {
    label: "Nome ou logo no seu modelo",
    save: (s) => ({ ...s, file: s.file && { name: s.file.name, bytes: storeBytes(s.file.bytes) } }),
    load: (raw) => {
      const r = raw as Omit<OwnState, "file"> & { file: { name: string; bytes: string | null } | null };
      const bytes = restoreBytes(r.file?.bytes);
      return { ...initialState(), ...r, file: r.file && bytes ? { name: r.file.name, bytes } : null };
    },
  });
  const { file, faceId, edits } = tool.state;
  const [setFaceId, setEdits] = [tool.field("faceId"), tool.field("edits")];
  const [fileError, setFileError] = useState<string | null>(null);
  const [pickNote, setPickNote] = useState<string | null>(null);
  const lay = useModelLayers(OWN, edits, setEdits, "inlay");

  // o arquivo lido: modelo e faces planas (só muda quando troca o arquivo)
  const parsed = useMemo<{ model: Model; faces: PlanarFace[] } | { error: string } | null>(() => {
    if (!file) return null;
    try {
      const model = readOwnFile(file.bytes, file.name);
      return { model, faces: planarFaces(model) };
    } catch (e) {
      return { error: errorText(e) };
    }
  }, [file]);
  const model = parsed && "model" in parsed ? parsed.model : null;
  const faces = parsed && "faces" in parsed ? parsed.faces : [];
  const face = faces.find((f) => f.id === faceId) ?? null;
  const baseName = file?.name.replace(/\.[^.]+$/, "") ?? "modelo";

  async function onFile(f: File) {
    setFileError(null);
    setPickNote(null);
    if (!/\.(stl|3mf)$/i.test(f.name)) return setFileError("Envie um arquivo .stl ou .3mf.");
    if (f.size > MAX_BYTES) return setFileError("Arquivo maior que 200 MB.");
    const bytes = new Uint8Array(await f.arrayBuffer());
    tool.set((cur) => ({ ...cur, file: { name: f.name, bytes }, faceId: null, edits: {} }), "file");
  }

  function choose(next: PlanarFace) {
    setPickNote(null);
    if (!next.extreme) return setPickNote(OWN_MODEL_ERRORS.notExtreme);
    setFaceId(next.id);
    lay.replace(lay.layers.map((l) => ({ ...l, x: 0, y: 0 }))); // a posição vale em relação ao centro da face
    lay.select(null);
  }

  function onPick(hit: { point: [number, number, number]; normal: [number, number, number] }) {
    if (!model) return;
    const found = faceAtPoint(model, faces, hit.point, hit.normal);
    if (!found) return setPickNote("Esse trecho não é uma face plana grande. Clique numa face reta e lisa, ou escolha na lista.");
    choose(found);
  }

  const valid = lay.layers.every(layerValid);
  const { models, warnings, busy, error } = useModelBuilder(async () => {
    if (!model || !valid) return null;
    if (!face) return { models: [model], warnings: [] };
    const out = await applyOwnDecals(model, face, lay.layers.filter(layerValid), await getManifold());
    lay.setView({ face: out.face, shapes: out.shapes, byLayer: out.byLayer, elements: [] });
    return { models: out.models, warnings: out.warnings };
  }, [model, face, lay.layers, valid]);

  // a face escolhida fica pintada só até haver um decal (depois ele mesmo mostra onde está)
  const preview = useMemo(() => (model && face && !lay.layers.length ? [...models, faceHighlight(model, face, HIGHLIGHT)] : models), [models, model, face, lay.layers.length]);
  const sizeText = (f: PlanarFace) => {
    const [w, h] = faceSize(model!, f);
    return `${mm(w)} × ${mm(h)} mm`;
  };

  return (
    <div className="page">
      <h1>Nome ou logo no seu modelo</h1>
      <p className="lead">Nome ou logo numa face plana do seu STL ou 3MF.</p>
      <ToolSessionBar tool={tool} />
      <div className="tool-layout">
        <div className="controls">
          <div className="card stack">
            <h3>Arquivo</h3>
            <Dropzone accept=".stl,.3mf" label={file ? file.name : "Arraste o .stl ou .3mf"} hint="Um sólido fechado (sem furos na malha)." onFile={onFile} />
            {fileError && <Alert kind="error">{fileError}</Alert>}
            {parsed && "error" in parsed && <Alert kind="error">{parsed.error}</Alert>}
            <Alert kind="warn">Use só modelos que são seus ou cuja licença permite alterar e imprimir. O app não confere a licença do arquivo.</Alert>
          </div>
          {model && (
            <div className="card stack">
              <h3>Face</h3>
              <p className="hint">Clique numa face plana na prévia ou escolha na lista. O decal vai nessa face, olhando de fora.</p>
              {pickNote && <Alert kind="warn">{pickNote}</Alert>}
              {faces.length === 0 ? (
                <Alert kind="warn">Nenhuma face plana grande foi achada neste modelo. Nesta versão o decal só funciona em faces planas.</Alert>
              ) : (
                <div className="row wrap" role="group" aria-label="Faces planas">
                  {faces.slice(0, 12).map((f, i) => (
                    <button key={f.id} type="button" className={f.id === faceId ? "sm primary" : "sm"} aria-pressed={f.id === faceId} onClick={() => choose(f)} title={f.extreme ? undefined : "Fica numa reentrância"}>
                      Face {i + 1} · {faceDirection(f.normal)} · {sizeText(f)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {model && (
            <LayersPanel
              layers={lay.layers}
              selected={lay.selected}
              byLayer={lay.view.byLayer}
              onSelect={lay.select}
              onAddArt={lay.addArt}
              onAddText={() => lay.addText()}
              onChange={lay.change}
              onMove={lay.move}
              onDuplicate={lay.duplicate}
              onRemove={lay.remove}
              history={{ undo: tool.undo, redo: tool.redo, canUndo: tool.canUndo, canRedo: tool.canRedo }}
              disabled={face ? undefined : "Escolha uma face primeiro."}
            />
          )}
          <ExportButtons models={models} name={`${baseName}-decal`} busy={busy} onSaved={tool.exported} />
        </div>
        <div className="preview-col">
          <Preview3D
            models={preview}
            busy={busy}
            busyText="Aplicando o decal…"
            error={error}
            emptyText={!valid ? "Corrija os campos em vermelho." : "Envie um STL ou 3MF para começar."}
            onPick={model ? onPick : undefined}
          />
          {lay.view.face && face && lay.layers.length > 0 && (
            <section className="card stack gizmo-card">
              <h3>Vista da face</h3>
              <DecalGizmo face={lay.view.face} layers={lay.layers} shapes={lay.view.shapes} selected={lay.selected} onSelect={lay.select} onCommit={lay.change} />
              <p className="hint">Arraste para mover; a alça do canto muda o tamanho e a de cima gira (Shift: 15°). Setas movem 1 mm.</p>
            </section>
          )}
          {warnings.map((w) => (
            <Alert key={w} kind="warn">{w}</Alert>
          ))}
        </div>
      </div>
    </div>
  );
}
