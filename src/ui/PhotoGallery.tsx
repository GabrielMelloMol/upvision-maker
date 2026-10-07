import { Camera, ImagePlus } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ClipboardEvent, type DragEvent } from "react";
import { getDb } from "../db";
import { MAX_PHOTOS, photos, type PhotoRow } from "../db/photosRepo";
import Menu from "./Menu";
import PhotoEditSheet from "./PhotoEditSheet";
import { photoToDataUrl } from "./photo";
import Sheet from "./Sheet";
import { errorText, useToast } from "./Toast";
import { modKey } from "./shortcuts";

type Props = { owner: string; label?: string; onChange?: (list: PhotoRow[]) => void };

const isImage = (f: File) => f.type.startsWith("image/") || /\.(heic|heif)$/i.test(f.name);

/**
 * Fotos reais de um item (#162): arquivo, arrastar, colar ou câmera; a 1ª é a capa. Cada foto: tornar capa, ajustar
 * (girar, recortar, brilho) e excluir. Serve para produto, projeto e impressão (dono "product:<id>" etc.).
 */
export default function PhotoGallery({ owner, label = "Fotos da peça impressa", onChange }: Props) {
  const [list, setList] = useState<PhotoRow[]>([]);
  const [editing, setEditing] = useState<PhotoRow | null>(null);
  const [camera, setCamera] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const hasCamera = typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;

  const reload = useCallback(async () => {
    const next = await photos.list(await getDb(), owner);
    setList(next);
    onChange?.(next);
  }, [owner, onChange]);
  useEffect(() => {
    let alive = true;
    getDb()
      .then((db) => photos.list(db, owner))
      .then((next) => {
        if (!alive) return;
        setList(next);
        onChange?.(next);
      })
      .catch((e) => toast(errorText(e), "error"));
    return () => {
      alive = false;
    };
  }, [owner, onChange, toast]);

  async function run(fn: () => Promise<unknown>) {
    try {
      await fn();
      await reload();
    } catch (e) {
      toast(errorText(e), "error");
    }
  }
  const addUrls = (urls: string[]) =>
    run(async () => {
      const db = await getDb();
      for (const u of urls.slice(0, MAX_PHOTOS - list.length)) await photos.add(db, owner, u);
      if (urls.length > MAX_PHOTOS - list.length) toast(`Cada item aceita até ${MAX_PHOTOS} fotos.`, "error");
    });
  const addFiles = async (files: File[]) => {
    const imgs = files.filter(isImage);
    if (!imgs.length) return;
    try {
      await addUrls(await Promise.all(imgs.map(photoToDataUrl)));
    } catch (e) {
      toast(errorText(e), "error");
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    void addFiles([...e.dataTransfer.files]);
  };
  const onPaste = (e: ClipboardEvent) => {
    const files = [...e.clipboardData.files].filter(isImage);
    if (!files.length) return;
    e.preventDefault();
    void addFiles(files);
  };

  return (
    <div className="photo-gallery stack" onDragOver={(e) => e.preventDefault()} onDrop={onDrop} onPaste={onPaste} tabIndex={-1}>
      <span className="field-label">
        {label} <span className="muted">{list.length}/{MAX_PHOTOS} · a 1ª é a capa</span>
      </span>
      {list.length > 0 && (
        <ul className="photo-grid" aria-label={label}>
          {list.map((p, i) => (
            <li key={p.id}>
              <figure>
                <img src={p.dataUrl} alt={i === 0 ? "Capa" : `Foto ${i + 1}`} />
              </figure>
              {i === 0 && <span className="pill photo-cover">Capa</span>}
              <div className="photo-actions">
                <Menu
                  label={`Ações da foto ${i + 1}`}
                  items={[
                    ...(i > 0 ? [{ label: "Tornar capa", onSelect: () => void run(async () => photos.makeCover(await getDb(), owner, p.id)) }] : []),
                    { label: "Ajustar (girar, recortar, brilho)…", onSelect: () => setEditing(p) },
                    { label: "Excluir", danger: true, onSelect: () => void run(async () => photos.remove(await getDb(), p.id)) },
                  ]}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="row">
        <button type="button" className="sm" disabled={list.length >= MAX_PHOTOS} onClick={() => input.current?.click()}>
          <ImagePlus aria-hidden size={16} /> Adicionar foto
        </button>
        {hasCamera && (
          <button type="button" className="sm" disabled={list.length >= MAX_PHOTOS} onClick={() => setCamera(true)}>
            <Camera aria-hidden size={16} /> Câmera
          </button>
        )}
        <span className="hint">Ou arraste, ou cole ({modKey()}+V) uma foto aqui.</span>
      </div>
      <input
        ref={input}
        type="file"
        accept="image/*,.heic,.heif"
        multiple
        hidden
        aria-label="Escolher fotos"
        onChange={(e) => {
          void addFiles([...(e.target.files ?? [])]);
          e.target.value = "";
        }}
      />
      {editing && (
        <PhotoEditSheet
          src={editing.dataUrl}
          onClose={() => setEditing(null)}
          onSave={(url) => {
            const id = editing.id;
            setEditing(null);
            void run(async () => photos.replace(await getDb(), id, url));
          }}
        />
      )}
      {camera && <CameraSheet onClose={() => setCamera(false)} onShot={(url) => void addUrls([url])} />}
    </div>
  );
}

/** Foto pela webcam ou câmera do computador (getUserMedia); sem permissão, explica e fecha. */
function CameraSheet({ onShot, onClose }: { onShot: (dataUrl: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let alive = true; // fechou antes de a permissão chegar: a câmera que chegar depois é desligada na hora (M20)
    navigator.mediaDevices
      .getUserMedia({ video: { width: { ideal: 1920 } }, audio: false })
      .then((s) => {
        if (!alive) return s.getTracks().forEach((t) => t.stop());
        stream = s;
        if (video.current) video.current.srcObject = s;
      })
      .catch(() => alive && setError("Não consegui abrir a câmera. Confira a permissão de câmera do app nos ajustes do sistema."));
    return () => {
      alive = false;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  function shoot() {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    const c = document.createElement("canvas");
    const s = Math.min(1, 1024 / Math.max(v.videoWidth, v.videoHeight));
    c.width = Math.round(v.videoWidth * s);
    c.height = Math.round(v.videoHeight * s);
    c.getContext("2d")!.drawImage(v, 0, 0, c.width, c.height);
    onShot(c.toDataURL("image/jpeg", 0.82));
    onClose();
  }

  return (
    <Sheet
      title="Tirar foto"
      icon={Camera}
      onClose={onClose}
      wide
      footer={
        <>
          <button type="button" onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className="primary" disabled={!!error} onClick={shoot}>
            Tirar foto
          </button>
        </>
      }
    >
      {error ? <p className="error">{error}</p> : <video ref={video} className="photo-camera" autoPlay playsInline muted />}
    </Sheet>
  );
}
