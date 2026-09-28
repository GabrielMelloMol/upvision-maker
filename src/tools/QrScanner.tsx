import { Camera, CameraOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import Alert from "../ui/Alert";
import { decodeQr } from "./qrDecode";

const SCAN_EVERY_MS = 150;
const MAX_SIDE = 640; // reduz o quadro: mais rápido e o QR continua legível
const REPEAT_MS = 2500; // o mesmo QR parado na frente da câmera não dispara de novo

function cameraError(e: unknown): string {
  const name = e instanceof DOMException ? e.name : "";
  if (name === "NotAllowedError") return "Sem permissão para a câmera. Libere o UpVision Maker nas configurações de privacidade do sistema.";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "Nenhuma câmera encontrada. Use um leitor USB ou digite o código abaixo.";
  return "Não consegui abrir a câmera. Use um leitor USB ou digite o código abaixo.";
}

/**
 * Leitor de QR: câmera (webcam ou do notebook) e um campo que aceita leitor USB (ele "digita" o código + Enter)
 * ou o código digitado à mão. Chama `onCode` com o texto lido.
 */
export default function QrScanner({ onCode }: { onCode: (text: string) => void }) {
  const [on, setOn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const video = useRef<HTMLVideoElement>(null);
  const last = useRef({ text: "", at: 0 });
  const cb = useRef(onCode);
  useEffect(() => {
    cb.current = onCode;
  }, [onCode]);

  useEffect(() => {
    if (!on) return;
    let stream: MediaStream | null = null;
    let timer = 0;
    let alive = true;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    const tick = () => {
      const v = video.current;
      if (v && v.videoWidth) {
        const s = Math.min(1, MAX_SIDE / Math.max(v.videoWidth, v.videoHeight));
        canvas.width = Math.round(v.videoWidth * s);
        canvas.height = Math.round(v.videoHeight * s);
        ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
        const text = decodeQr(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
        const now = Date.now();
        if (text && (text !== last.current.text || now - last.current.at > REPEAT_MS)) {
          last.current = { text, at: now };
          cb.current(text);
        }
      }
      if (alive) timer = window.setTimeout(tick, SCAN_EVERY_MS);
    };
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" }, audio: false })
      .then((s) => {
        stream = s;
        if (!alive) return s.getTracks().forEach((t) => t.stop());
        if (video.current) {
          video.current.srcObject = s;
          void video.current.play().catch(() => {});
        }
        tick();
      })
      .catch((e) => {
        setError(cameraError(e));
        setOn(false);
      });
    return () => {
      alive = false;
      clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [on]);

  function submit() {
    const t = typed.trim();
    if (!t) return;
    onCode(t);
    setTyped("");
  }

  return (
    <div className="stack">
      <button
        onClick={() => {
          const hasCamera = !!navigator.mediaDevices?.getUserMedia;
          setError(hasCamera || on ? null : cameraError(null));
          setOn(!on && hasCamera);
        }}
      >
        {on ? <CameraOff aria-hidden /> : <Camera aria-hidden />} {on ? "Desligar câmera" : "Ler com a câmera"}
      </button>
      {on && <video ref={video} className="qr-video" muted playsInline aria-label="Imagem da câmera" />}
      {error && <Alert kind="warn">{error}</Alert>}
      <label>
        Código da etiqueta
        <input
          value={typed}
          placeholder="Leitor USB ou digite: upvision:filamento/12"
          onChange={(e) => setTyped(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
      </label>
    </div>
  );
}
