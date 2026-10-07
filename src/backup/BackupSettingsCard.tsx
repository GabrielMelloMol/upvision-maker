import { ask, open } from "@tauri-apps/plugin-dialog";
import { DatabaseBackup, FolderOpen, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { restoreFromText } from "../backupActions";
import { getDb } from "../db";
import Button from "../ui/Button";
import NumField from "../ui/NumField";
import { errorText, useToast } from "../ui/Toast";
import Toggle from "../ui/Toggle";
import SyncSettingsCard from "../sync/SyncSettingsCard";
import { photos } from "../db/photosRepo";
import { AUTO_DEFAULTS, KEEP_MAX, KEEP_MIN, defaultBackupDir, listAutoBackups, loadAutoBackupConfig, readAutoBackup, runAutoBackup, saveAutoBackupConfig, type AutoBackupConfig, type BackupEntry } from "./auto";

/** Avisa o App (lembrete de backup) que acabou de haver um backup. */
export const BACKUP_DONE_EVENT = "upvision:backup-done";
export const notifyBackupDone = () => window.dispatchEvent(new Event(BACKUP_DONE_EVENT));

/** "upvision-auto-2026-09-28-153000.json" → "28/09/2026 às 15:30". */
export function backupLabel(name: string): string {
  const m = /(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})/.exec(name);
  if (!m) return name;
  const when = `${m[3]}/${m[2]}/${m[1]} às ${m[4]}:${m[5]}`;
  if (name.startsWith("upvision-conflito-")) return `${when} · cópia de conflito do outro computador`;
  return name.startsWith("upvision-antes-") ? `${when} · cópia de antes de restaurar` : when;
}
const kb = (b: number) => `${Math.max(1, Math.round(b / 1024)).toLocaleString("pt-BR")} KB`;

/** Preferências → Backup automático (#5): liga/desliga, pasta, quantos dias manter, fazer agora e restaurar. Logo abaixo, Dois computadores (#16). */
const mb = (chars: number) => `${(chars / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;

export default function BackupSettingsCard() {
  const [config, setConfig] = useState<AutoBackupConfig>(AUTO_DEFAULTS);
  const [keepDraft, setKeepDraft] = useState(AUTO_DEFAULTS.keep); // o campo pode ficar vazio enquanto ela digita
  const [defaultDir, setDefaultDir] = useState("");
  const [list, setList] = useState<BackupEntry[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [photoBytes, setPhotoBytes] = useState<number | null>(null);
  const toast = useToast();

  const refresh = useCallback(async (c: AutoBackupConfig) => {
    try {
      setList(await listAutoBackups(c.dir));
    } catch (e) {
      setList([]);
      toast(`Não consegui ler a pasta de backup: ${errorText(e)}`, "error");
    }
  }, [toast]);

  useEffect(() => {
    (async () => {
      const db = await getDb();
      const c = await loadAutoBackupConfig(db);
      setConfig(c);
      setPhotoBytes(await photos.totalChars(db));
      setKeepDraft(c.keep);
      setDefaultDir(await defaultBackupDir().catch(() => ""));
      await refresh(c);
    })().catch((e) => toast(`Erro ao ler o backup automático: ${errorText(e)}`, "error"));
  }, [refresh, toast]);

  async function update(patch: Partial<AutoBackupConfig>) {
    const next = { ...config, ...patch };
    setConfig(next);
    try {
      await saveAutoBackupConfig(await getDb(), next);
      if (patch.dir !== undefined) await refresh(next);
    } catch (e) {
      toast(`Não foi possível salvar: ${errorText(e)}`, "error");
    }
  }

  async function chooseDir() {
    const dir = await open({ directory: true, multiple: false, title: "Pasta dos backups automáticos" });
    if (typeof dir === "string") await update({ dir });
  }

  async function backupNow() {
    setBusy(true);
    try {
      const e = await runAutoBackup(await getDb(), config);
      toast(`Backup salvo: ${backupLabel(e.name)}.`);
      notifyBackupDone();
      await refresh(config);
    } catch (e) {
      toast(`Não foi possível fazer o backup: ${errorText(e)}`, "error");
    } finally {
      setBusy(false);
    }
  }

  async function restore(entry: BackupEntry) {
    const when = backupLabel(entry.name);
    const ok = await ask(`Restaurar o backup de ${when}? Os dados atuais serão substituídos. Uma cópia deles é guardada antes, por segurança.`, {
      title: "Restaurar backup",
      kind: "warning",
      okLabel: "Restaurar este backup",
      cancelLabel: "Cancelar",
    });
    if (!ok) return;
    try {
      await restoreFromText(await readAutoBackup(config.dir, entry.name));
      toast(`Backup de ${when} restaurado.`);
      window.location.reload(); // todas as telas releem os dados
    } catch (e) {
      toast(`Não foi possível restaurar: ${errorText(e)}`, "error");
    }
  }

  const shown = config.dir || defaultDir;
  return (
    <>
    <section className="group" aria-labelledby="auto-backup-title">
      <h2 className="group-title" id="auto-backup-title">
        Backup automático
      </h2>
      <div className="rows">
        <Toggle label="Fazer backup sozinho todo dia e ao fechar o app" checked={config.enabled} onChange={(enabled) => update({ enabled })} />
        <div className="row-control">
          <span className="row-label">Pasta</span>
          <code className="path hint" title={shown}>
            {shown || "…"}
          </code>
          <div className="row">
            <Button size="sm" icon={FolderOpen} onClick={chooseDir}>
              Escolher pasta…
            </Button>
            {config.dir && (
              <Button size="sm" variant="ghost" onClick={() => update({ dir: "" })}>
                Usar a padrão
              </Button>
            )}
          </div>
        </div>
        <NumField label="Manter os últimos" unit="dias" value={keepDraft} min={KEEP_MIN} max={KEEP_MAX} step={1} onChange={(keep) => {
            setKeepDraft(keep);
            if (Number.isInteger(keep) && keep >= KEEP_MIN && keep <= KEEP_MAX) void update({ keep });
          }} hint="Um backup por dia; os mais antigos são apagados." />
        <Toggle
          label="Incluir as fotos das peças"
          checked={config.photos}
          onChange={(v) => update({ photos: v })}
          hint={`${photoBytes ? `As fotos ocupam ${mb(photoBytes)}. ` : ""}Sem as fotos o backup fica leve; restaurar um backup assim mantém as fotos que já estão no app. A sincronização entre computadores sempre leva as fotos.`}
        />
        <div className="row-action">
          <span className="hint">Uma cópia de tudo na pasta, agora.</span>
          <Button icon={DatabaseBackup} onClick={backupNow} disabled={busy}>
            {busy ? "Salvando…" : "Fazer backup agora"}
          </Button>
        </div>
      </div>
      <p className="hint group-note">Dica: escolha uma pasta do OneDrive ou do Google Drive e o backup também fica guardado fora deste computador.</p>

      <h3 className="group-title">Backups guardados</h3>
      {list === null ? (
        <span className="skeleton line" style={{ width: "60%" }} />
      ) : list.length === 0 ? (
        <p className="hint group-note">Nenhum backup automático nesta pasta ainda.</p>
      ) : (
        <ul className="rows backup-list">
          {list.map((b) => (
            <li key={b.name}>
              <span>{backupLabel(b.name)}</span>
              <span className="muted small">{kb(b.bytes)}</span>
              <Button size="sm" variant="link" icon={RotateCcw} onClick={() => restore(b)}>
                Restaurar
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
    <SyncSettingsCard dir={config.dir} onChooseDir={chooseDir} />
    </>
  );
}
