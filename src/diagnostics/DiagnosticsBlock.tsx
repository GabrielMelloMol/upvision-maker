import { getVersion } from "@tauri-apps/api/app";
import { FileDown, Stethoscope } from "lucide-react";
import { systemName } from "../about/system";
import Button from "../ui/Button";
import { saveFile } from "../ui/saveFile";
import { errorText, useToast } from "../ui/Toast";
import { readLog } from "./log";
import { fullReport, type ReportInfo } from "./report";

/** Versão, build, sistema e o registro de erros (já sem dados pessoais). */
export async function collectReport(what?: string): Promise<ReportInfo> {
  const [version, system, log] = await Promise.all([getVersion().catch(() => "dev"), systemName(), readLog().catch(() => "")]);
  return { version, build: __BUILD_DATE__, system, log, what };
}

/** "Algo deu errado?" em Sugerir ferramenta (#7, #83): junta o diagnóstico à mensagem ou salva o registro completo. */
export default function DiagnosticsBlock({ include, onInclude, what }: { include: boolean; onInclude: (v: boolean) => void; what?: string }) {
  const toast = useToast();

  async function saveAll() {
    try {
      const info = await collectReport(what);
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
      <label className="check">
        <input type="checkbox" checked={include} onChange={(e) => onInclude(e.target.checked)} /> Mandar junto o diagnóstico
      </label>
      <p className="hint">Vai a versão do app, o sistema e os últimos erros registrados, sem dados pessoais (e-mails, telefones, documentos e nomes são apagados antes de gravar).</p>
      <div className="row">
        <Button size="sm" variant="ghost" icon={FileDown} onClick={saveAll}>
          Salvar registro completo…
        </Button>
      </div>
    </div>
  );
}
