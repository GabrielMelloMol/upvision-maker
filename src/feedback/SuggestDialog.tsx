import { getVersion } from "@tauri-apps/api/app";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Lightbulb, Send } from "lucide-react";
import { useState } from "react";
import Alert from "../ui/Alert";
import Sheet from "../ui/Sheet";
import { errorText } from "../ui/Toast";
import { feedbackUrl } from "./feedback";

const platform = () => (/Mac/i.test(navigator.userAgent) ? "macOS" : /Win/i.test(navigator.userAgent) ? "Windows" : "outro");
const FEEDBACK_EMAIL = import.meta.env.VITE_FEEDBACK_EMAIL;

/** Formulário curto de sugestão: abre e-mail pré-preenchido (ou issue no GitHub se o e-mail não foi configurado no build). */
export default function SuggestDialog({ onClose }: { onClose: () => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return setError("Dê um título curto para a ideia.");
    try {
      const appVersion = await getVersion().catch(() => "dev");
      await openUrl(feedbackUrl({ title, description, imageName: image?.name ?? null, appVersion, platform: platform() }, FEEDBACK_EMAIL));
      setSent(true);
    } catch (err) {
      setError(`Não consegui abrir o e-mail/navegador: ${errorText(err)}`);
    }
  }

  return (
    <Sheet
      title="Sugerir ferramenta"
      icon={Lightbulb}
      onClose={onClose}
      onSubmit={submit}
      footer={
        sent ? (
          <button type="button" className="primary" onClick={onClose}>
            Fechar
          </button>
        ) : (
          <>
            <button type="button" onClick={onClose}>
              Cancelar
            </button>
            <button className="primary" type="submit">
              <Send aria-hidden /> {FEEDBACK_EMAIL ? "Abrir e-mail" : "Abrir no GitHub"}
            </button>
          </>
        )
      }
    >
      {sent ? (
        <Alert kind="ok">
          {FEEDBACK_EMAIL ? "Abrimos seu e-mail com a sugestão pronta. É só enviar." : "Abrimos o GitHub com a sugestão pronta. É só publicar."}
          {image && ` Não esqueça de anexar a imagem ${image.name}.`}
        </Alert>
      ) : (
        <>
          <label>
            O que você queria que o app fizesse?
            <input data-autofocus value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: gerador de etiqueta com QR e preço" />
          </label>
          <label>
            Conte mais (opcional)
            <textarea value={description} maxLength={1500} onChange={(e) => setDescription(e.target.value)} placeholder="Para que você usaria, exemplos, tamanhos…" />
          </label>
          <label>
            Imagem de exemplo (opcional)
            <input type="file" accept="image/*" onChange={(e) => setImage(e.target.files?.[0] ?? null)} />
            <span className="hint">{FEEDBACK_EMAIL ? "O e-mail" : "A página"} abre pronta; a imagem você anexa antes de enviar.</span>
          </label>
          {error && <Alert kind="error">{error}</Alert>}
        </>
      )}
    </Sheet>
  );
}
