import { ImageIcon, RotateCcw, RotateCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import Segmented from "./Segmented";
import Sheet from "./Sheet";
import Slider from "./Slider";
import { loadImage, NO_EDIT, renderEdit, type Aspect, type PhotoEdit } from "./photoEdit";

const ASPECTS: [Aspect, string][] = [
  ["free", "Original"],
  ["1:1", "Quadrado"],
  ["4:3", "4:3"],
  ["3:4", "3:4"],
];
const ZOOM_MAX = 3;
const BRIGHT = 50; // ±50%

type Props = { src: string; onSave: (dataUrl: string) => void; onClose: () => void };

/** Girar, recortar (proporção + zoom no centro) e brilho de uma foto (#162). A prévia é a foto final. */
export default function PhotoEditSheet({ src, onSave, onClose }: Props) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [edit, setEdit] = useState<PhotoEdit>(NO_EDIT);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof PhotoEdit>(k: K) => (v: PhotoEdit[K]) => setEdit((e) => ({ ...e, [k]: v }));

  useEffect(() => {
    loadImage(src).then(setImg, (e: Error) => setError(e.message));
  }, [src]);
  const preview = useMemo(() => {
    if (!img) return null;
    try {
      return renderEdit(img, edit);
    } catch {
      return null; // sem canvas (testes): a foto original fica na prévia
    }
  }, [img, edit]);
  const turn = (d: 90 | -90) => set("rotate")((((edit.rotate + d) % 360) + 360) % 360 as PhotoEdit["rotate"]);

  // sem <form>: a folha abre dentro de outras folhas com formulário (ex.: editar projeto) e form dentro de form envia a página
  function save() {
    if (preview) onSave(preview);
    else onClose();
  }

  return (
    <Sheet
      title="Ajustar foto"
      icon={ImageIcon}
      onClose={onClose}
      wide
      footer={
        <>
          <button type="button" onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className="primary" disabled={!img} onClick={save}>
            Salvar foto
          </button>
        </>
      }
    >
      {error ? <p className="error">{error}</p> : <img className="photo-edit-preview checker" src={preview ?? src} alt="Prévia da foto ajustada" />}
      <div className="row">
        <button type="button" className="sm" onClick={() => turn(-90)}>
          <RotateCcw aria-hidden size={16} /> Girar para a esquerda
        </button>
        <button type="button" className="sm" onClick={() => turn(90)}>
          <RotateCw aria-hidden size={16} /> Girar para a direita
        </button>
      </div>
      <div>
        <span className="field-label">Recorte</span>
        <Segmented label="Recorte" value={edit.aspect} options={ASPECTS} onChange={set("aspect")} />
      </div>
      <Slider label="Aproximar" min={1} max={ZOOM_MAX} step={0.1} value={edit.zoom} onChange={set("zoom")} display={(v) => `${v.toFixed(1).replace(".", ",")}×`} />
      <Slider label="Brilho" min={-BRIGHT} max={BRIGHT} step={5} value={edit.brightness} onChange={set("brightness")} display={(v) => `${v > 0 ? "+" : ""}${v}%`} />
    </Sheet>
  );
}
