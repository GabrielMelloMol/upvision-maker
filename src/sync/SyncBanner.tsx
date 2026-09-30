import { useCallback, useEffect, useState } from "react";
import { getDb } from "../db";
import { logError } from "../diagnostics/log";
import { errorText, useToast } from "../ui/Toast";
import { loadSyncConfig, session, syncNow, TICK_MS, whenLabel, whoAmI, type SyncResult } from "./sync";

type Shown = Extract<SyncResult, { kind: "trava" | "conflito" }>;

/**
 * Sincronização entre 2 computadores rodando (#16): na abertura e a cada minuto. Mostra a faixa quando o app
 * está em uso no outro computador (assumir ou seguir sem sincronizar) ou quando houve conflito.
 */
export default function SyncBanner({ onImported, onOpenBackups }: { onImported: () => void; onOpenBackups: () => void }) {
  const [shown, setShown] = useState<Shown | null>(null);
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
      if (r.kind === "trava" || r.kind === "conflito") setShown(r);
      if (r.kind === "importado") {
        toast(`Dados atualizados com o que ${r.from.deviceName} salvou (${whenLabel(r.from.savedAt)}).`);
        onImported();
      }
    },
    [onImported, toast],
  );

  useEffect(() => {
    const safe = () => run().catch((e) => logError("sincronização", e, "warn")); // pasta fora do ar: tenta no próximo minuto
    void safe();
    const id = window.setInterval(safe, TICK_MS);
    return () => window.clearInterval(id);
  }, [run]);

  if (!shown) return null;
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
