import { ImagePlus, PenLine, X } from "lucide-react";
import { useRef, useState } from "react";
import { IMAGE_ACCEPT, imageUrl, MAX_IMAGES, type RefImage } from "../../ai/images";
import SketchPad from "./SketchPad";

type Props = {
  images: RefImage[];
  onChange: (images: RefImage[]) => void;
  /** Arquivos escolhidos, colados ou soltos; `png` = esboço (mantém PNG). */
  onAdd: (files: Blob[], png?: boolean) => void;
  disabled?: boolean;
};

/**
 * Imagens de referência do próximo pedido (#89): miniaturas com legenda e remover, botão para anexar (também dá
 * para colar ou soltar no campo do pedido) e esboço à mão.
 */
export default function Attachments({ images, onChange, onAdd, disabled }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [sketch, setSketch] = useState(false);
  const full = images.length >= MAX_IMAGES;
  const edit = (id: string, caption: string) => onChange(images.map((i) => (i.id === id ? { ...i, caption } : i)));
  return (
    <div className="stack ref-images">
      {images.length > 0 && (
        <ul className="ref-thumbs" aria-label="Imagens de referência">
          {images.map((img, n) => (
            <li key={img.id}>
              <img src={imageUrl(img)} alt={`Imagem ${n + 1}: ${img.name}`} />
              <input aria-label={`Legenda da imagem ${n + 1}`} placeholder="Legenda (opcional)" maxLength={80} value={img.caption} onChange={(e) => edit(img.id, e.target.value)} />
              <button type="button" className="ghost icon-only" aria-label={`Remover imagem ${n + 1}`} onClick={() => onChange(images.filter((i) => i.id !== img.id))}>
                <X aria-hidden size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="row">
        <button type="button" className="ghost" disabled={disabled || full} onClick={() => input.current?.click()}>
          <ImagePlus aria-hidden size={16} /> Anexar imagem
        </button>
        <button type="button" className="ghost" disabled={disabled || full} onClick={() => setSketch(true)}>
          <PenLine aria-hidden size={16} /> Esboço
        </button>
        <span className="hint">{full ? `Até ${MAX_IMAGES} imagens por pedido.` : "Foto, print ou esboço como referência. Também dá para colar ou soltar aqui."}</span>
      </div>
      <input
        ref={input}
        type="file"
        accept={IMAGE_ACCEPT}
        multiple
        hidden
        aria-label="Arquivo de imagem de referência"
        onChange={(e) => {
          onAdd([...(e.target.files ?? [])]);
          e.target.value = "";
        }}
      />
      {sketch && (
        <SketchPad
          onClose={() => setSketch(false)}
          onDone={(png) => {
            setSketch(false);
            onAdd([Object.assign(png, { name: "esboco.png" })], true);
          }}
        />
      )}
    </div>
  );
}
