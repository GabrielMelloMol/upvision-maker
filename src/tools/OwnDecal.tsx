import { useMemo, useState } from "react";
import { getManifold } from "../geometry/manifold";
import { faceAtPoint, faceDirection, faceHighlight, faceSize, fromFaceFrame, planarFaces, readOwnFile, wideFaces, type PlanarFace } from "../geometry/ownModel";
import type { Model } from "../geometry/types";
import Alert from "../ui/Alert";
import Dropzone from "../ui/Dropzone";
import ExportButtons from "../ui/ExportButtons";
import Preview3D from "../ui/Preview3D";
import { errorText } from "../ui/Toast";
import { useModelBuilder } from "../ui/useModelBuilder";
import { applyOwnCurved, applyOwnDecals, OWN_MODEL_ERRORS, partAtPoint, type SurfaceSpot } from "./models/applyOwn";
import DecalGizmo from "./models/DecalGizmo";
import LayersPanel, { layerValid } from "./models/LayersPanel";
import { useModelLayers, type ModelEdits } from "./models/useModelLayers";
import { restoreBytes, storeBytes } from "./storedFile";
import ToolSessionBar from "./ToolSessionBar";
import { useToolState } from "./useToolState";

const MAX_BYTES = 200 * 1024 * 1024;
const OWN = "own";
const HIGHLIGHT = "#38bdf8";
/** Para onde a superfície aponta no ponto escolhido, em palavras. */
const spotText = (n: [number, number, number]) => {
  const d = faceDirection(n);
  return d === "inclinada" ? "numa parte inclinada" : `voltado ${d}`;
};
const mm = (n: number) => n.toFixed(1).replace(".", ",");

const initialState = () => ({ file: null as { name: string; bytes: Uint8Array } | null, faceId: null as string | null, spot: null as SurfaceSpot | null, edits: {} as ModelEdits });
type OwnState = ReturnType<typeof initialState>;

const MARKER_R = 3;
const MARKER_SEGMENTS = 32;
const MARKER_LIFT = 0.05;

/** Só para a prévia: um disco no ponto escolhido numa superfície curva, deitado sobre ela (não vai para o arquivo). */
function spotMarker(spot: SurfaceSpot, color: string): Model {
  const pos = new Float32Array((MARKER_SEGMENTS + 1) * 3);
  pos[2] = MARKER_LIFT;
  for (let i = 0; i < MARKER_SEGMENTS; i++) pos.set([MARKER_R * Math.cos((i / MARKER_SEGMENTS) * 2 * Math.PI), MARKER_R * Math.sin((i / MARKER_SEGMENTS) * 2 * Math.PI), MARKER_LIFT], (i + 1) * 3);
  const indices = Uint32Array.from({ length: MARKER_SEGMENTS * 3 }, (_, j) => (j % 3 === 0 ? 0 : 1 + ((Math.floor(j / 3) + (j % 3) - 1) % MARKER_SEGMENTS)));
  const mesh = fromFaceFrame({ positions: pos, indices }, { normal: spot.normal, centroid: spot.point });
  return { name: "Ponto escolhido", parts: [{ name: "Ponto escolhido", color, mesh }] };
}

/**
 * Decal em modelo próprio (#113, #212): abre um STL ou 3MF, a pessoa clica numa face plana (ou escolhe na lista) ou em qualquer
 * ponto de uma superfície curva e põe texto ou desenho com o gizmo; na face plana a cor entra rente (como o Separador), na
 * curva o relevo ou o entalhe acompanha a superfície; sai no 3MF multicor.
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
  const { file, faceId, spot, edits } = tool.state;
  const setEdits = tool.field("edits");
  const [fileError, setFileError] = useState<string | null>(null);
  const [pickNote, setPickNote] = useState<string | null>(null);
  const lay = useModelLayers(OWN, edits, setEdits, "inlay");

  // o arquivo lido: modelo e faces planas (só muda quando troca o arquivo)
  const parsed = useMemo<{ model: Model; faces: PlanarFace[] } | { error: string } | null>(() => {
    if (!file) return null;
    try {
      const model = readOwnFile(file.bytes, file.name);
      return { model, faces: wideFaces(model, planarFaces(model)) };
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
    tool.set((cur) => ({ ...cur, file: { name: f.name, bytes }, faceId: null, spot: null, edits: {} }), "file");
  }

  function choose(next: PlanarFace) {
    setPickNote(null);
    if (!next.extreme) return setPickNote(OWN_MODEL_ERRORS.notExtreme);
    tool.set((cur) => ({ ...cur, faceId: next.id, spot: null }), "faceId");
    lay.replace(lay.layers.map((l) => ({ ...l, x: 0, y: 0 }))); // a posição vale em relação ao centro da face
    lay.select(null);
  }

  function onPick(hit: { point: [number, number, number]; normal: [number, number, number] }) {
    if (!model) return;
    const found = faceAtPoint(model, faces, hit.point, hit.normal);
    if (found) return choose(found);
    setPickNote(null);
    tool.set((cur) => ({ ...cur, faceId: null, spot: { part: partAtPoint(model, hit.point), point: hit.point, normal: hit.normal } }), "faceId");
    lay.replace(lay.layers.map((l) => ({ ...l, x: 0, y: 0 })));
    lay.select(null);
  }

  const valid = lay.layers.every(layerValid);
  const { models, warnings, busy, error } = useModelBuilder(async () => {
    if (!model || !valid) return null;
    if (!face && !spot) return { models: [model], warnings: [] };
    const M = await getManifold();
    const on = lay.layers.filter(layerValid);
    const out = spot ? await applyOwnCurved(model, spot, on, M) : await applyOwnDecals(model, face!, on, M);
    lay.setView({ face: out.face, shapes: out.shapes, byLayer: out.byLayer, elements: [] });
    return { models: out.models, warnings: out.warnings };
  }, [model, face, spot, lay.layers, valid]);

  // a face escolhida fica pintada só até haver um decal (depois ele mesmo mostra onde está)
  const preview = useMemo(() => {
    if (!model || lay.layers.length) return models;
    if (face) return [...models, faceHighlight(model, face, HIGHLIGHT)];
    return spot ? [...models, spotMarker(spot, HIGHLIGHT)] : models;
  }, [models, model, face, spot, lay.layers.length]);
  const sizeText = (f: PlanarFace) => {
    const [w, h] = faceSize(model!, f);
    return `${mm(w)} × ${mm(h)} mm`;
  };

  return (
    <div className="page">
      <h1>Nome ou logo no seu modelo</h1>
      <p className="lead">Nome ou logo em qualquer superfície, curva ou plana.</p>
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
              <h3>Onde</h3>
              <p className="hint">Clique na prévia no ponto onde o desenho vai ficar: numa face plana ou em qualquer superfície curva (copo, esfera, tampa abaulada). Em face plana também dá para escolher na lista.</p>
              {pickNote && <Alert kind="warn">{pickNote}</Alert>}
              {spot && (
                <div className="row wrap">
                  <span className="hint"><strong>Superfície curva</strong>: ponto escolhido, {spotText(spot.normal)}</span>
                  <button type="button" className="sm" onClick={() => tool.set((cur) => ({ ...cur, spot: null }), "faceId")}>Limpar ponto</button>
                </div>
              )}
              {spot && <p className="hint">O desenho é projetado na superfície e o relevo ou o entalhe acompanha a curva. Quanto mais inclinada a superfície em relação ao ponto, mais o desenho estica: prefira o ponto mais de frente. Vazado corta reto, na direção do ponto.</p>}
              {faces.length === 0 ? (
                <p className="hint">Nenhuma face plana grande neste modelo: clique direto na superfície.</p>
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
              disabled={face || spot ? undefined : "Clique na prévia para escolher onde o desenho vai."}
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
          {lay.view.face && (face || spot) && lay.layers.length > 0 && (
            <section className="card stack gizmo-card">
              <h3>{spot ? "Vista de frente do ponto" : "Vista da face"}</h3>
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
