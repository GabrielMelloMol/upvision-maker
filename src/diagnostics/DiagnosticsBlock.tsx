import { getVersion } from "@tauri-apps/api/app";
import { openUrl } from "@tauri-apps/plugin-opener";
import { FileDown, Stethoscope } from "lucide-react";
import { useState } from "react";
import { systemName } from "../about/system";
import { feedbackUrl } from "../feedback/feedback";
import Button from "../ui/Button";
import { saveFile } from "../ui/saveFile";
import { errorText, useToast } from "../ui/Toast";
import { readLog } from "./log";
import { fullReport, shortReport, type ReportInfo } from "./report";

const FEEDBACK_EMAIL = import.meta.env.VITE_FEEDBACK_EMAIL;

async function collect(what?: string): Promise<ReportInfo> {
  const [version, system, log] = await Promise.all([getVersion().catch(() => "dev"), systemName(), readLog().catch(() => "")]);
  return { version, build: __BUILD_DATE__, system, log, what };
}

/** "Algo deu errado?" em Sugerir ferramenta (#7): envia o diagnóstico (e-mail/issue) ou salva o registro completo. */
export default function DiagnosticsBlock({ what }: { what?: string }) {
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  async function send() {
    setBusy(true);
    try {
      const info = await collect(what);
      const title = what?.trim().slice(0, 60) || "Algo deu errado";
      await openUrl(feedbackUrl({ kind: "Diagnóstico", title, description: shortReport(info), imageName: null, appVersion: info.version, platform: info.system }, FEEDBACK_EMAIL));
      toast(FEEDBACK_EMAIL ? "E-mail de diagnóstico aberto. Para mandar tudo, anexe também o registro completo." : "Página aberta com o diagnóstico. É só publicar.");
    } catch (e) {
      toast(`Não consegui abrir o diagnóstico: ${errorText(e)}`, "error");
    } finally {
      setBusy(false);
    }
  }

  async function saveAll() {
    try {
      const info = await collect(what);
      const p = await saveFile(`upvision-diagnostico-${new Date().toISOString().slice(0, 10)}.txt`, fullReport(info), "txt", "Registro");
      if (p) toast(`Registro salvo em ${p}`);
    } catch (e) {
      toast(`Não consegui salvar o registro: ${errorText(e)}`, "error");
    }
  }

  return (
    <div className="diagnostics" role="group" aria-labelledby="diag-title">
      <h3 id="diag-title">
        <Stethoscope aria-hidden /> Algo deu errado?
      </h3>
      <p className="hint">Envie o diagnóstico: vai a versão do app, o sistema e os últimos erros registrados, sem dados pessoais (e-mails, telefones, documentos e nomes são apagados antes de gravar).</p>
      <div className="row">
        <Button size="sm" icon={Stethoscope} onClick={send} disabled={busy}>
          Enviar diagnóstico
        </Button>
        <Button size="sm" variant="ghost" icon={FileDown} onClick={saveAll}>
          Salvar registro completo…
        </Button>
      </div>
    </div>
  );
}
