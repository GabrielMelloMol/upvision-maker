import { useCallback, useEffect, useRef, useState } from "react";
import { getDb } from "../db";
import { logError } from "../diagnostics/log";
import { errorText, useToast } from "../ui/Toast";
import { loadSyncConfig, session, syncNow, whenLabel, whoAmI, type SyncResult } from "./sync";
import { syncTuning } from "./tuning";

type Shown = Extract<SyncResult, { kind: "trava" | "conflito" | "versao" | "copias" | "vazio" }>;

/** "Ok" no aviso de versão vale até fechar o app: ele volta a cada minuto enquanto as versões forem diferentes. */
let versionDismissed = false;

/**
 * Sincronização entre 2 computadores rodando (#16): na abertura e a cada minuto. Mostra a faixa quando o app
 * está em uso no outro computador (assumir ou seguir sem sincronizar) ou quando houve conflito.
 */
export default function SyncBanner({ onImported, onOpenBackups }: { onImported: (fromDevice: string) => void; onOpenBackups: () => void }) {
  const [shown, setShown] = useState<Shown | null>(null);
  /** Erro da sincronização que a pessoa precisa ver (A10): arquivo corrompido na hora; outros depois da 2ª falha seguida. */
  const [failure, setFailure] = useState<string | null>(null);
  const failures = useRef(0);
  const toast = useToast();

  const run = useCallback(
    async (force = false) => {
      if (!session.active && !force) return;
      const db = await getDb();
      if (!(await loadSyncConfig(db)).enabled) return;
      const r = await syncNow(db, await whoAmI(db), {
        since: session.since,
        force,
      });
      if (r.kind === "trava") session.active = false;
      if (r.kind === "trava" || r.kind === "conflito" || r.kind === "copias" || (r.kind === "vazio" && r.where === "pasta")) setShown(r);
      if (r.kind === "versao" && !versionDismissed) setShown(r);
      if (r.kind === "importado") {
        toast(
          `Dados atualizados com o que ${r.from.deviceName} salvou (${whenLabel(r.from.savedAt)}).` +
            (r.from.conflict ? " Como os dois computadores tinham mudado dados, o que existia antes ficou guardado em Restaurar backup." : ""),
        );
        onImported(r.from.deviceName);
      }
    },
    [onImported, toast],
  );

  useEffect(() => {
    const safe = () =>
      run().then(
        () => {
          failures.current = 0;
          setFailure(null);
        },
        (e) => {
          logError("sincronização", e, "warn"); // pasta fora do ar: tenta no próximo minuto
          failures.current += 1;
          if (failures.current >= 2 || /corrompido/.test(errorText(e))) setFailure(errorText(e));
        },
      );
    void safe();
    const id = window.setInterval(safe, syncTuning.tickMs);
    return () => window.clearInterval(id);
  }, [run]);

  const failed = failure && (
    <div className="banner warn" role="alert">
      <span>Não consegui sincronizar: {failure} O app tenta de novo a cada minuto; enquanto isso, as mudanças deste computador não chegam ao outro.</span>
    </div>
  );
  if (!shown) return failed || null;
  if (shown.kind === "vazio")
    return (
      <div className="banner warn" role="status">
        <span>A pasta de sincronização está sem dados e este computador tem. Nada foi apagado nem enviado: confira se a pasta é a certa ou se a nuvem ainda está baixando os arquivos.</span>
        <button className="ghost" onClick={() => setShown(null)}>
          Ok
        </button>
      </div>
    );
  if (shown.kind === "copias")
    return (
      <div className="banner warn" role="status">
        <span>
          A nuvem guardou {shown.names.length === 1 ? "uma versão" : `${shown.names.length} versões`} a mais dos dados (provavelmente um computador ficou sem internet). Nada foi apagado: estão em Restaurar backup.
        </span>
        <button className="link" onClick={onOpenBackups}>
          Ver em Restaurar backup
        </button>
        <button className="ghost" onClick={() => setShown(null)}>
          Ok
        </button>
      </div>
    );
  if (shown.kind === "trava")
    return (
      <div className="banner warn" role="status">
        <span>
          Em uso no computador {shown.lock.deviceName} desde {whenLabel(shown.lock.since)}. O que você mudar aqui não vai para lá.
        </span>
        <button
          className="primary"
          onClick={() => {
            session.active = true;
            setShown(null);
            run(true).catch((e) => toast(`Não foi possível assumir: ${errorText(e)}`, "error"));
          }}
        >
          Assumir
        </button>
        <button className="ghost" onClick={() => setShown(null)}>
          Continuar sem sincronizar
        </button>
      </div>
    );
  if (shown.kind === "versao")
    return (
      <div className="banner warn" role="status">
        <span>
          {shown.newer
            ? `${shown.from.deviceName} está com uma versão mais nova do app. Atualize o app neste computador para voltar a sincronizar; até lá, nada daqui vai para lá.`
            : `${shown.from.deviceName} está com uma versão antiga do app. Atualize o app lá para voltar a sincronizar; até lá, os dados de um não passam para o outro.`}
        </span>
        <button
          className="ghost"
          onClick={() => {
            versionDismissed = true;
            setShown(null);
          }}
        >
          Ok
        </button>
      </div>
    );
  return (
    <div className="banner" role="status">
      <span>Os dois computadores mudaram os dados. Ficaram os deste computador; os de {shown.from.deviceName} foram guardados como cópia.</span>
      <button className="link" onClick={onOpenBackups}>
        Ver em Restaurar backup
      </button>
      <button className="ghost" onClick={() => setShown(null)}>
        Ok
      </button>
    </div>
  );
}
