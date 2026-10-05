import { ask } from "@tauri-apps/plugin-dialog";
import { useEffect, useState } from "react";
import { getDb } from "../db";
import { exportBackup } from "../db/backup";
import { errorText, useToast } from "../ui/Toast";
import Toggle from "../ui/Toggle";
import { dataHash, loadSyncConfig, readRemote, startSync, stopSync, whenLabel, whoAmI, type SyncConfig } from "./sync";

/**
 * Preferências → Dois computadores (#16): usa a pasta do backup automático (OneDrive/Google Drive/Dropbox)
 * para manter dois computadores iguais. Na pasta padrão a chave fica desligada: ela não sai deste computador.
 */
export default function SyncSettingsCard({ dir, onChooseDir }: { dir: string; onChooseDir: () => void }) {
  const [config, setConfig] = useState<SyncConfig | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const reload = async () => setConfig(await loadSyncConfig(await getDb()));
  useEffect(() => {
    (async () => setConfig(await loadSyncConfig(await getDb())))().catch((e) => toast(`Erro ao ler a sincronização: ${errorText(e)}`, "error"));
  }, [dir, toast]); // a pasta mudou no card do backup: relê

  async function turnOn() {
    const db = await getDb();
    const me = await whoAmI(db);
    const remote = await readRemote(dir);
    let keep: "pasta" | "daqui" = "daqui";
    if (remote && remote.mark.device !== me.device && remote.mark.hash !== (await dataHash(await exportBackup(db)))) {
      const bring = await ask(
        `Esta pasta já tem os dados de ${remote.mark.deviceName} (salvos ${whenLabel(remote.mark.savedAt)}). Trazer para este computador? Os dados daqui ficam guardados numa cópia de segurança.`,
        {
          title: "Dois computadores",
          kind: "info",
          okLabel: "Trazer os dados de lá",
          cancelLabel: "Manter os daqui",
        },
      );
      keep = bring ? "pasta" : "daqui";
    }
    const r = await startSync(db, me, keep);
    if (r.kind === "importado") {
      toast(`Dados de ${r.from.deviceName} trazidos.`);
      window.location.reload(); // todas as telas releem os dados
    } else if (r.kind === "conflito") toast(`Ficaram os dados daqui; os de ${r.from.deviceName} foram guardados em Backups guardados.`);
    else if (r.kind === "versao")
      toast(r.newer ? `${r.from.deviceName} está com uma versão mais nova do app: atualize este computador para sincronizar.` : `${r.from.deviceName} está com uma versão antiga do app: atualize lá para sincronizar.`, "error");
    else toast("Sincronização ligada.");
  }

  async function toggle(on: boolean) {
    setBusy(true);
    try {
      if (on) await turnOn();
      else {
        const db = await getDb();
        await stopSync(db, await whoAmI(db));
      }
      await reload();
    } catch (e) {
      toast(`Não foi possível ${on ? "ligar" : "desligar"} a sincronização: ${errorText(e)}`, "error");
    } finally {
      setBusy(false);
    }
  }

  const onDefault = dir === "";
  return (
    <section className="group" aria-labelledby="sync-title">
      <h2 className="group-title" id="sync-title">
        Dois computadores
      </h2>
      <div className="rows">
        <Toggle
          label="Sincronizar com outro computador por esta pasta"
          checked={!!config?.enabled}
          disabled={onDefault || busy || !config}
          onChange={toggle}
          hint={
            onDefault
              ? "Escolha uma pasta do OneDrive, Google Drive ou Dropbox no backup automático e instale o app no outro computador apontando para a mesma pasta."
              : config?.enabled
                ? `${config.lastAt ? `Última sincronização: ${whenLabel(config.lastAt)} · deste computador.` : "Ainda não sincronizou."} Ao abrir, o app traz o que o outro computador salvou; enquanto usa e ao fechar, envia o daqui. Use um computador de cada vez.`
                : "Ligue também no outro computador, com a mesma pasta."
          }
        />
        {onDefault && (
          <div className="row-action">
            <span className="hint">A pasta padrão fica só neste computador.</span>
            <button type="button" onClick={onChooseDir}>
              Escolher pasta…
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
