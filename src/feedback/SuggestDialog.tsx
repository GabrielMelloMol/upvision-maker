import { getVersion } from "@tauri-apps/api/app";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Copy, Lightbulb, MessageCircle, Send } from "lucide-react";
import { useState } from "react";
import { todayIso } from "../domain/orders";
import Alert from "../ui/Alert";
import Sheet from "../ui/Sheet";
import { errorText, useToast } from "../ui/Toast";
import DiagnosticsBlock, { collectReport } from "../diagnostics/DiagnosticsBlock";
import { shortReport } from "../diagnostics/report";
import { feedbackChannels, feedbackText, MAX_DESCRIPTION, MAX_TITLE, readImage, rememberSent, sendFeedback, sentHistory, whatsappUrl, type Channels, type Feedback, type SentEntry } from "./feedback";

const platform = () => (/Mac/i.test(navigator.userAgent) ? "macOS" : /Win/i.test(navigator.userAgent) ? "Windows" : "outro");
const BUILD_CHANNELS = feedbackChannels(import.meta.env);
const BUILD_TOKEN = import.meta.env.VITE_FEEDBACK_TOKEN ?? "";

type Props = { onClose: () => void; channels?: Channels; token?: string };

const DONE: Record<SentEntry["via"], string> = {
  app: "Recebido ✓ Obrigado! A mensagem chegou para a equipe do app.",
  whatsapp: "Abrimos o WhatsApp com a mensagem pronta. É só enviar.",
  copia: "Texto copiado. Cole no WhatsApp ou no e-mail de quem te passou o app.",
};

/**
 * Sugerir ferramenta / Algo deu errado (#83): envia pelo app (endpoint do Worker), pelo WhatsApp com o texto
 * pronto ou copia o texto. Não abre GitHub nem cliente de e-mail.
 */
export default function SuggestDialog({ onClose, channels = BUILD_CHANNELS, token = BUILD_TOKEN }: Props) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [withDiagnostics, setWithDiagnostics] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<SentEntry["via"] | null>(null);
  const [history] = useState(sentHistory);
  const toast = useToast();

  async function build(): Promise<Feedback | null> {
    const t = title.trim() || (withDiagnostics ? "Algo deu errado" : "");
    if (!t) {
      setError("Dê um título curto para a ideia (ou marque o diagnóstico, se algo deu errado).");
      return null;
    }
    const appVersion = await getVersion().catch(() => "dev");
    const diagnostics = withDiagnostics ? shortReport(await collectReport(description || t)) : undefined;
    return {
      kind: withDiagnostics && !title.trim() ? "Diagnóstico" : "Sugestão",
      title: t,
      description,
      appVersion,
      platform: platform(),
      diagnostics,
      image: image ? await readImage(image) : undefined,
    };
  }

  async function run(via: SentEntry["via"]) {
    setError(null);
    setBusy(true);
    try {
      const f = await build();
      if (!f) return;
      if (via === "app") await sendFeedback(f, { endpoint: channels.endpoint!, token });
      else if (via === "whatsapp") await openUrl(whatsappUrl(f, channels.whatsapp!));
      else {
        await navigator.clipboard.writeText(feedbackText(f));
        toast("Texto copiado.");
      }
      rememberSent({ title: f.title, kind: f.kind, via, at: todayIso() });
      setDone(via);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  const primary = channels.endpoint ? "app" : channels.whatsapp ? "whatsapp" : "copia";
  const button = (via: SentEntry["via"]) => {
    const [Icon, label] = via === "app" ? [Send, "Enviar"] : via === "whatsapp" ? [MessageCircle, "Enviar pelo WhatsApp"] : [Copy, "Copiar texto"];
    return (
      <button key={via} type={via === primary ? "submit" : "button"} className={via === primary ? "primary" : undefined} disabled={busy} onClick={via === primary ? undefined : () => run(via)}>
        <Icon aria-hidden /> {label}
      </button>
    );
  };

  return (
    <Sheet
      title="Sugerir ferramenta"
      icon={Lightbulb}
      onClose={onClose}
      onSubmit={(e) => {
        e.preventDefault();
        void run(primary);
      }}
      footer={
        done ? (
          <button type="button" className="primary" onClick={onClose}>
            Fechar
          </button>
        ) : (
          <>
            <button type="button" onClick={onClose}>
              Cancelar
            </button>
            {(["copia", "whatsapp", "app"] as const).filter((v) => v === "copia" || (v === "app" ? channels.endpoint : channels.whatsapp)).map(button)}
          </>
        )
      }
    >
      {done ? (
        <Alert kind="ok">
          {DONE[done]}
          {done !== "app" && image && ` Mande também a imagem ${image.name}.`}
        </Alert>
      ) : (
        <>
          <label>
            O que você queria que o app fizesse?
            <input data-autofocus value={title} maxLength={MAX_TITLE} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: gerador de etiqueta com QR e preço" />
          </label>
          <label>
            Conte mais (opcional)
            <textarea value={description} maxLength={MAX_DESCRIPTION} onChange={(e) => setDescription(e.target.value)} placeholder="Para que você usaria, exemplos, tamanhos…" />
          </label>
          <label>
            Imagem de exemplo (opcional, até 2 MB)
            <input type="file" accept="image/*" onChange={(e) => setImage(e.target.files?.[0] ?? null)} />
          </label>
          <DiagnosticsBlock include={withDiagnostics} onInclude={setWithDiagnostics} what={title || description} />
          {error && <Alert kind="error">{error}</Alert>}
          {history.length > 0 && (
            <details>
              <summary>Enviadas deste computador ({history.length})</summary>
              <ul className="dash-list">
                {history.map((h, i) => (
                  <li key={i}>
                    <span>{h.title}</span>
                    <span className="hint">{h.at.split("-").reverse().join("/")}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </Sheet>
  );
}
