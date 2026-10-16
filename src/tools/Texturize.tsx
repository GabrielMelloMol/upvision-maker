import { useEffect, useMemo, useRef, useState } from "react";
import { meshBounds } from "../geometry/bounds";
import { loadFont } from "../geometry/fonts";
import { lumaGrid } from "../geometry/heightfield";
import { getManifold } from "../geometry/manifold";
import { readObjectsAsync, texturizeAsync } from "../geometry/textureClient";
import { imageGrid, textGrid } from "../geometry/textureGrid";
import { TEXTURES, textureById, thumbnail, type TextureId } from "../geometry/textureLib";
import { DEFAULT_TEXTURIZE, type Direction, type Faces, type Mapping, type TextureSource, type TexturizeInfo, type TexturizeOptions } from "../geometry/texturize";
import type { Model } from "../geometry/types";
import Alert from "../ui/Alert";
import Dropzone from "../ui/Dropzone";
import ExportButtons from "../ui/ExportButtons";
import FontPicker from "../ui/FontPicker";
import { inRange } from "../ui/NumField";
import Preview3D from "../ui/Preview3D";
import Segmented from "../ui/Segmented";
import Slider from "../ui/Slider";
import Toggle from "../ui/Toggle";
import { errorText } from "../ui/Toast";
import { useJobControl } from "../ui/useJobControl";
import { useModelBuilder } from "../ui/useModelBuilder";
import WorkProgress from "../ui/WorkProgress";
import { IMAGE_ACCEPT, loadRaster } from "../vectorize/client";
import { restoreBytes, storeBytes } from "./storedFile";
import ToolSessionBar from "./ToolSessionBar";
import { useToolState } from "./useToolState";

const MAX_BYTES = 200 * 1024 * 1024;
const SOURCES: ["pattern" | "text" | "image", string][] = [
  ["pattern", "Padrões"],
  ["text", "Frase"],
  ["image", "Imagem"],
];
const DIRECTIONS: [Direction, string][] = [
  ["out", "Para fora"],
  ["in", "Para dentro"],
  ["center", "Centrada"],
];
const AREAS: [Faces | "brush", string][] = [
  ["all", "Peça toda"],
  ["sides", "Só laterais"],
  ["top", "Só o topo"],
  ["brush", "Pincel"],
];
const MAPPINGS: [Mapping, string][] = [
  ["box", "Em caixa"],
  ["cylinder", "Cilíndrica"],
];
const BRUSH_MARK_MM = 1.4; // a bolinha que marca a pincelada na prévia

const initialState = () => ({
  file: null as { name: string; bytes: Uint8Array } | null,
  source: "pattern" as "pattern" | "text" | "image",
  pattern: "carbono" as TextureId,
  text: "UpVision",
  font: "hanken",
  image: null as { name: string; bytes: Uint8Array } | null,
  invert: false,
  scale: DEFAULT_TEXTURIZE.scale,
  depth: DEFAULT_TEXTURIZE.depth,
  direction: "out" as Direction,
  area: "all" as Faces | "brush",
  brushR: 8,
  brush: [] as { p: [number, number, number]; r: number }[],
  mapping: "box" as Mapping,
  flatBase: true,
  protectOverhang: true,
  interior: false,
});
type State = ReturnType<typeof initialState>;

/** Miniatura de uma textura (tons de cinza = altura). */
function Thumb({ id }: { id: TextureId }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return; // sem canvas (testes): fica o nome
    const px = thumbnail(id, 56);
    ctx.putImageData(new ImageData(new Uint8ClampedArray(px), 56, 56), 0, 0);
  }, [id]);
  return <canvas ref={ref} width={56} height={56} aria-hidden />;
}

const mm = (n: number) => n.toFixed(1).replace(".", ",");

/**
 * Textura na peça (#222): fibra de carbono, couro, madeira, serrilhado, colmeia, felpudo… (16 padrões), uma frase ou
 * uma imagem viram relevo de verdade na superfície de um STL ou 3MF, na peça toda, só nas laterais, só no topo ou onde
 * você pintar, com base lisa e sem balanço novo.
 */
export default function Texturize() {
  const tool = useToolState("texturize", initialState, {
    label: "Textura na peça",
    save: (s) => ({ ...s, file: s.file && { name: s.file.name, bytes: storeBytes(s.file.bytes) }, image: s.image && { name: s.image.name, bytes: storeBytes(s.image.bytes) } }),
    load: (raw) => {
      const r = raw as Omit<State, "file" | "image"> & { file: { name: string; bytes: string | null } | null; image: { name: string; bytes: string | null } | null };
      const [fb, ib] = [restoreBytes(r.file?.bytes), restoreBytes(r.image?.bytes)];
      return { ...initialState(), ...r, file: r.file && fb ? { name: r.file.name, bytes: fb } : null, image: r.image && ib ? { name: r.image.name, bytes: ib } : null };
    },
  });
  const s = tool.state;
  const set = <K extends keyof State>(key: K) => tool.field(key) as (v: State[K] | ((cur: State[K]) => State[K])) => void;
  const [fileError, setFileError] = useState<string | null>(null);
  const [info, setInfo] = useState<TexturizeInfo | null>(null);

  // o arquivo é lido num worker: um 3MF grande não trava a tela
  const [parsed, setParsed] = useState<{ file: object; models: Model[] } | { file: object; error: string } | null>(null);
  useEffect(() => {
    if (!s.file) return;
    let alive = true;
    const key = s.file;
    readObjectsAsync(s.file.bytes, s.file.name).then(
      (models) => alive && setParsed({ file: key, models }),
      (e) => alive && setParsed({ file: key, error: errorText(e) }),
    );
    return () => {
      alive = false;
    };
  }, [s.file]);
  const current = s.file && parsed && parsed.file === s.file ? parsed : null;
  const source = current && "models" in current ? current.models : null;
  const reading = !!s.file && !current;
  const size = useMemo(() => {
    const b = source && meshBounds(source.flatMap((m) => m.parts.map((p) => p.mesh)));
    return b ? ([b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]] as const) : null;
  }, [source]);

  async function onFile(f: File) {
    setFileError(null);
    if (!/\.(stl|3mf)$/i.test(f.name)) return setFileError("Envie um arquivo .stl ou .3mf.");
    if (f.size > MAX_BYTES) return setFileError("Arquivo maior que 200 MB.");
    const bytes = new Uint8Array(await f.arrayBuffer());
    tool.set((cur) => ({ ...cur, file: { name: f.name, bytes }, brush: [] }), "file");
  }
  async function onImage(f: File) {
    const bytes = new Uint8Array(await f.arrayBuffer());
    set("image")({ name: f.name, bytes });
  }
  function pickTexture(id: TextureId) {
    tool.set((cur) => ({ ...cur, pattern: id, scale: textureById(id).scale }), "pattern");
  }
  function onPick(hit: { point: [number, number, number] }) {
    if (s.area !== "brush") return;
    set("brush")((b) => [...b, { p: hit.point, r: s.brushR }]);
  }

  // tudo que muda o resultado: mudar qualquer um cancela o cálculo em andamento
  const inputs = [source, s.source, s.pattern, s.text, s.font, s.image, s.invert, s.scale, s.depth, s.direction, s.area, s.brush, s.mapping, s.flatBase, s.protectOverhang, s.interior];
  const ctl = useJobControl(inputs);
  const valid = inRange(s.scale, 1, 60) && inRange(s.depth, 0.05, 3) && inRange(s.brushR, 2, 60) && (s.source !== "text" || !!s.text.trim()) && (s.source !== "image" || !!s.image);
  const { models: all, warnings, busy, error } = useModelBuilder(async () => {
    if (!source || !valid) return null;
    const M = await getManifold();
    let src: TextureSource = { kind: "pattern", id: s.pattern };
    if (s.source === "text") src = { kind: "grid", grid: textGrid(M, await loadFont(s.font), s.text), cols: 128, rows: 128 };
    else if (s.source === "image" && s.image) {
      const r = await loadRaster(new Blob([s.image.bytes.slice()]), () => 1);
      URL.revokeObjectURL(r.url);
      src = { kind: "grid", grid: imageGrid(lumaGrid(r.rgba, r.w, r.h), r.w, r.h, s.invert), cols: 128, rows: 128 };
    }
    const o: TexturizeOptions = {
      source: src,
      scale: s.scale,
      depth: s.depth,
      direction: s.direction,
      mapping: s.mapping,
      faces: s.area === "brush" ? "all" : s.area,
      brush: s.area === "brush" ? s.brush : null,
      protectOverhang: s.protectOverhang,
      flatBase: s.flatBase,
      interior: s.interior,
    };
    // o cálculo roda num worker: a tela não trava, mostra o progresso e dá para cancelar
    const out = await ctl.run((onProgress) => texturizeAsync(source, o, onProgress));
    setInfo(out.info);
    // pinceladas: bolinhas só da prévia, no tamanho da pincelada
    const marks: Model[] =
      s.area === "brush"
        ? s.brush.map((b, i) => {
            const ball = M.Manifold.sphere(BRUSH_MARK_MM, 12).translate(b.p);
            const m = ball.getMesh();
            ball.delete();
            return { name: `Pincelada ${i + 1}`, previewOnly: true, parts: [{ name: "Pincelada", color: "#f97316", mesh: { positions: new Float32Array(m.vertProperties), indices: new Uint32Array(m.triVerts) } }] };
          })
        : [];
    return { models: [...out.models, ...marks], warnings: out.warnings };
  }, [...inputs, valid, ctl.rev]);
  const printable = useMemo(() => all.filter((m) => !m.previewOnly), [all]);
  const baseName = s.file?.name.replace(/\.[^.]+$/, "") ?? "peca";
  const groups = useMemo(() => [...new Set(TEXTURES.map((t) => t.group))], []);

  return (
    <div className="page">
      <h1>Textura na peça</h1>
      <p className="lead">Textura de verdade na superfície do STL.</p>
      <ToolSessionBar tool={tool} />
      <div className="tool-layout">
        <div className="controls">
          <div className="card stack">
            <h3>Arquivo</h3>
            <Dropzone accept=".stl,.3mf" label={s.file ? s.file.name : "Arraste o .stl ou .3mf"} hint="Um sólido fechado (furos pequenos na malha o app conserta)." onFile={onFile} />
            {fileError && <Alert kind="error">{fileError}</Alert>}
            {reading && <span className="hint" role="status">Lendo o arquivo…</span>}
            {current && "error" in current && <Alert kind="error">{current.error}</Alert>}
            {size && <span className="hint">Peça: {mm(size[0])} × {mm(size[1])} × {mm(size[2])} mm</span>}
            <p className="hint">Quando usar: dar acabamento a uma peça que você já tem (alça, caixa, vaso, brinde) sem desenhar nada: o relevo é feito na malha, não é só desenho na tela.</p>
            <Alert kind="warn">Use só modelos que são seus ou cuja licença permite alterar e imprimir. O app não confere a licença do arquivo.</Alert>
          </div>
          <div className="card stack">
            <h3>Textura</h3>
            <Segmented label="Tipo de textura" value={s.source} options={SOURCES} onChange={set("source")} full />
            {s.source === "pattern" &&
              groups.map((g) => (
                <div key={g} className="stack">
                  <span className="field-label">{g}</span>
                  <div className="texture-grid" role="group" aria-label={g}>
                    {TEXTURES.filter((t) => t.group === g).map((t) => (
                      <button key={t.id} type="button" className="texture-chip" aria-pressed={s.pattern === t.id} onClick={() => pickTexture(t.id)}>
                        <Thumb id={t.id} />
                        <span>{t.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            {s.source === "text" && (
              <>
                <label className="field">
                  <span className="field-label">Frase repetida na superfície</span>
                  <input value={s.text} maxLength={40} onChange={(e) => set("text")(e.target.value)} />
                </label>
                <FontPicker value={s.font} onChange={set("font")} sample={s.text} />
              </>
            )}
            {s.source === "image" && (
              <>
                <Dropzone accept={IMAGE_ACCEPT} label={s.image ? s.image.name : "Arraste uma imagem"} hint="O claro vira alto e o escuro vira baixo; o centro da imagem vira o ladrilho." onFile={onImage} />
                <Toggle label="Inverter (escuro vira alto)" checked={s.invert} onChange={set("invert")} />
              </>
            )}
            <Slider label="Tamanho da textura" min={1} max={40} step={0.5} value={s.scale} display={(v) => `${mm(v)} mm`} onChange={set("scale")} hint="O lado de cada repetição." />
            <Slider label="Altura do relevo" min={0.1} max={2} step={0.05} value={s.depth} display={(v) => `${v.toFixed(2).replace(".", ",")} mm`} onChange={set("depth")} />
            <Segmented label="Direção do relevo" value={s.direction} options={DIRECTIONS} onChange={set("direction")} full />
            <span className="hint">{s.direction === "out" ? "A textura cresce para fora: a peça fica até a altura do relevo maior." : s.direction === "in" ? "A textura afunda: a peça não passa do tamanho original." : "Metade para fora, metade para dentro."}</span>
          </div>
          <div className="card stack">
            <h3>Onde</h3>
            <Segmented label="Área" value={s.area} options={AREAS} onChange={set("area")} full />
            {s.area === "brush" && (
              <>
                <p className="hint">Clique na peça na prévia para pintar a área que recebe a textura (cada clique é uma pincelada).</p>
                <Slider label="Tamanho da pincelada" min={2} max={40} step={1} value={s.brushR} display={(v) => `${v} mm`} onChange={set("brushR")} />
                <div className="row wrap">
                  <span className="muted">{s.brush.length} {s.brush.length === 1 ? "pincelada" : "pinceladas"}</span>
                  <button type="button" className="sm" disabled={!s.brush.length} onClick={() => set("brush")((b) => b.slice(0, -1))}>
                    Desfazer pincelada
                  </button>
                  <button type="button" className="sm" disabled={!s.brush.length} onClick={() => set("brush")([])}>
                    Limpar
                  </button>
                </div>
              </>
            )}
            <Segmented label="Projeção" value={s.mapping} options={MAPPINGS} onChange={set("mapping")} full />
            <span className="hint">{s.mapping === "box" ? "A textura é projetada pelos três eixos: serve para quase qualquer forma." : "A textura dá a volta na peça em torno do eixo vertical: serve para copo, vaso e tubo."}</span>
            <Toggle label="Base lisa (não texturiza a face que assenta na mesa)" checked={s.flatBase} onChange={set("flatBase")} />
            <Toggle label="Texturizar por dentro também (interior de copo, caneca, vaso)" checked={s.interior} onChange={set("interior")} />
            <span className="hint">{s.interior ? "O lado de dentro também ganha textura: fica áspero por dentro." : "Só o lado de fora: o interior de copo, caneca e vaso continua liso."}</span>
            <Toggle label="Sem balanço novo (não põe relevo para fora nas partes viradas para baixo)" checked={s.protectOverhang} onChange={set("protectOverhang")} />
          </div>
          {info && source && (
            <div className="card stack" aria-label="Resultado da textura">
              <h3>Resultado</h3>
              <p>
                {info.triangles.toLocaleString("pt-BR")} triângulos · {Math.round(info.textured * 100)}% da superfície com textura.
              </p>
            </div>
          )}
          <ExportButtons models={printable} name={`${baseName}-textura`} busy={busy} onSaved={tool.exported} />
        </div>
        <div className="preview-col">
          <WorkProgress control={ctl} busy={busy} error={error} title="Aplicando a textura" />
          <Preview3D
            models={all}
            busy={busy}
            busyText="Aplicando a textura…"
            error={error}
            emptyText={!valid ? "Corrija os campos em vermelho." : "Envie um STL ou 3MF para texturizar."}
            onPick={s.area === "brush" && source ? onPick : undefined}
          />
          {warnings.map((w) => (
            <Alert key={w} kind="warn">
              {w}
            </Alert>
          ))}
        </div>
      </div>
    </div>
  );
}
