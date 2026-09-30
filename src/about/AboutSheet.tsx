import { perfLine } from "./perf";
import { openUrl } from "@tauri-apps/plugin-opener";
import { CircleCheck, Copy, Download, ExternalLink, Info, RefreshCw, Sparkles, WifiOff } from "lucide-react";
import { useEffect, useState } from "react";
import logo from "../assets/logo.png";
import Button from "../ui/Button";
import Sheet from "../ui/Sheet";
import { errorText, useToast } from "../ui/Toast";
import { releaseHighlights, RELEASES_PAGE } from "./releases";
import { systemName } from "./system";
import { latestVersion, type UpdatesState } from "./useUpdates";

type Props = UpdatesState & { checkNow: () => Promise<void>; install: () => Promise<void>; onNews: () => void; onClose: () => void };

const MAX_MISSING = 5;
const plural = (n: number) => (n === 1 ? "1 versão" : `${n} versões`);

/** Texto do status de atualização (compartilhado com o selo da barra lateral). */
export function updateHeadline(s: Pick<UpdatesState, "status" | "version" | "update" | "behind">): string {
  const latest = latestVersion(s);
  if (s.status === "checking") return "Procurando atualizações…";
  if (s.status === "installing") return "Baixando e instalando…";
  if (s.status === "offline") return "Sem internet para procurar atualizações.";
  if (s.status === "available") {
    const n = s.behind?.count ?? 0;
    return n > 0 ? `Você está ${plural(n)} atrás (v${s.version} → v${latest})` : `Nova versão ${latest ? `v${latest} ` : ""}disponível.`;
  }
  if (s.status === "current") return "Em dia: você tem a versão mais recente.";
  return "";
}

/** Sobre o UpVision Maker (#18): versão, build, sistema, verificar/atualizar e copiar informações para o suporte. */
export default function AboutSheet(p: Props) {
  const [system, setSystem] = useState("…");
  const toast = useToast();
  useEffect(() => void systemName().then(setSystem), []);

  const info = [
    `UpVision Maker v${p.version ?? "?"} (build ${__BUILD_DATE__})`,
    system,
    p.status === "available" ? `Atualização disponível: v${latestVersion(p) ?? "?"}` : p.status === "current" ? "Na versão mais recente" : null,
    perfLine(),
  ]
    .filter(Boolean)
    .join("\n");

  async function copy() {
    try {
      await navigator.clipboard.writeText(info);
      toast("Informações copiadas. É só colar no WhatsApp.");
    } catch (e) {
      toast(`Não consegui copiar: ${errorText(e)}`, "error");
    }
  }

  const Icon = p.status === "offline" ? WifiOff : p.status === "available" ? Sparkles : p.status === "current" ? CircleCheck : RefreshCw;
  const missing = p.behind?.missing.slice(0, MAX_MISSING) ?? [];
  return (
    <Sheet
      title="Sobre o UpVision Maker"
      icon={Info}
      onClose={p.onClose}
      footer={
        <>
          <Button icon={Copy} onClick={copy} style={{ marginRight: "auto" }}>
            Copiar informações
          </Button>
          {p.update && p.status !== "installing" ? (
            <Button variant="primary" icon={Download} onClick={p.install} data-autofocus>
              Atualizar agora
            </Button>
          ) : (
            <Button variant="primary" icon={RefreshCw} onClick={p.checkNow} disabled={p.status === "checking" || p.status === "installing"} data-autofocus>
              {p.status === "checking" ? "Procurando…" : "Verificar atualizações"}
            </Button>
          )}
        </>
      }
    >
      <div className="about-head">
        <img src={logo} alt="" />
        <div>
          <strong>UpVision Maker</strong>
          <span className="about-version">v{p.version ?? "…"}</span>
          <span className="hint">
            Build de {__BUILD_DATE__.split("-").reverse().join("/")} · {system}
          </span>
        </div>
      </div>

      <div className={`about-status ${p.status}`} role="status" aria-live="polite">
        <Icon aria-hidden className={p.status === "checking" || p.status === "installing" ? "spin" : ""} />
        <span>{updateHeadline(p)}</span>
      </div>
      {p.error && <p className="error">{p.error}</p>}

      {missing.length > 0 && (
        <div className="about-missing">
          <h3>O que você está perdendo</h3>
          <ul>
            {missing.map((r) => (
              <li key={r.version}>
                <b>v{r.version}</b>
                {releaseHighlights(r.body).length > 0 && (
                  <ul>
                    {releaseHighlights(r.body).map((h) => (
                      <li key={h}>{h}</li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
          {p.update === null && <p className="hint">Esta versão não se atualiza sozinha: baixe o instalador na página de versões.</p>}
        </div>
      )}

      <div className="row">
        <Button variant="link" icon={Sparkles} onClick={p.onNews}>
          O que há de novo
        </Button>
        <Button variant="link" icon={ExternalLink} onClick={() => void openUrl(RELEASES_PAGE).catch((e) => toast(errorText(e), "error"))}>
          Página de versões
        </Button>
      </div>
      {p.checkedAt && <p className="hint">Última verificação às {p.checkedAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}. O app verifica sozinho a cada 6 horas.</p>}
    </Sheet>
  );
}
