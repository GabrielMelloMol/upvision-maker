import { getVersion } from "@tauri-apps/api/app";
import { ask } from "@tauri-apps/plugin-dialog";
import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { useCallback, useEffect, useRef, useState } from "react";
import { runCloseJob } from "../backup/closeJob";
import { flushPendingSaves } from "../tools/pendingSaves";
import { fetchReleases, versionsBehind, type Release } from "./releases";

/** Checagem automática enquanto o app fica aberto (#155: era 6 h e a pessoa com o app aberto não via a versão nova). */
export const RECHECK_MS = 60 * 60 * 1000;
/** Ao voltar para a janela, checa de novo se a última checagem passou disso. */
export const FOCUS_RECHECK_MS = 30 * 60 * 1000;
const NOTIFIED_KEY = "upvision:aviso-de-versao";

export type UpdateStatus = "idle" | "checking" | "current" | "available" | "offline" | "installing";
export type Behind = { count: number; latest: string | null; missing: Release[] };

export type UpdatesState = {
  version: string | null;
  status: UpdateStatus;
  /** Instalável pelo updater (latest.json). */
  update: Update | null;
  /** Contagem pela API de releases; null se a API falhou (aí vale só o updater). */
  behind: Behind | null;
  error: string | null;
  checkedAt: Date | null;
};

/**
 * Versão instalada, "quantas versões atrás" e atualização (#18).
 * Duas fontes: o updater do Tauri (latest.json, dá para instalar) e a API pública de releases (dá a contagem e a lista).
 * Se a API falhar, fica só o updater ("há versão nova", sem número). Se as duas falharem: "Sem internet".
 */
export function useUpdates() {
  const [s, setS] = useState<UpdatesState>({ version: null, status: "idle", update: null, behind: null, error: null, checkedAt: null });
  const busy = useRef(false);
  const lastCheck = useRef(0);
  // "Depois": some até a próxima abertura do app
  const [dismissed, setDismissed] = useState(false);

  const checkNow = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    lastCheck.current = Date.now();
    setS((c) => ({ ...c, status: c.status === "available" ? "available" : "checking", error: null }));
    try {
      const version = await getVersion().catch(() => null);
      const [upd, rel] = await Promise.allSettled([check(), fetchReleases()]);
      const update = upd.status === "fulfilled" ? upd.value : null;
      const behind = rel.status === "fulfilled" && version ? versionsBehind(version, rel.value) : null;
      const bothFailed = upd.status === "rejected" && rel.status === "rejected";
      const available = !!update || (behind?.count ?? 0) > 0;
      setS({
        version,
        update,
        behind,
        checkedAt: new Date(),
        status: bothFailed ? "offline" : available ? "available" : "current",
        error: bothFailed ? (rel.reason instanceof Error ? rel.reason.message : "Sem internet para procurar atualizações.") : null,
      });
      if (available) void notifyInBackground(latestVersion({ update, behind }));
    } finally {
      busy.current = false;
    }
  }, []);

  useEffect(() => {
    void checkNow();
    const id = setInterval(() => void checkNow(), RECHECK_MS);
    // voltou para o app: checa se faz tempo (computador que dormiu, app esquecido aberto)
    const onFocus = () => {
      if (document.visibilityState !== "hidden" && Date.now() - lastCheck.current >= FOCUS_RECHECK_MS) void checkNow();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [checkNow]);

  /** Baixa e instala sem fechar o app; reinicia no fim. Antes grava os rascunhos e pergunta se algo ainda está gerando. */
  const install = useCallback(async () => {
    if (!s.update) return;
    if (document.querySelector('[aria-busy="true"]')) {
      const go = await ask("Uma ferramenta ainda está gerando. Atualizar agora reinicia o app e interrompe isso (o que você fez fica guardado).", {
        title: "Atualizar agora?",
        kind: "warning",
        okLabel: "Atualizar mesmo assim",
        cancelLabel: "Esperar",
      }).catch(() => true);
      if (!go) return;
    }
    await flushPendingSaves();
    await runCloseJob(); // no Windows o instalador encerra o app: envia o daqui e solta a trava antes (M3)
    setS((c) => ({ ...c, status: "installing" }));
    try {
      await s.update.downloadAndInstall();
      await relaunch();
    } catch (e) {
      setS((c) => ({ ...c, status: "available", error: `Falha ao atualizar: ${e instanceof Error ? e.message : String(e)}` }));
    }
  }, [s.update]);

  return { ...s, checkNow, install, dismissed, dismiss: () => setDismissed(true) };
}

/** Notificação do sistema quando o app está em segundo plano (#155), uma vez por versão. */
async function notifyInBackground(version: string | null) {
  if (!version || (document.visibilityState !== "hidden" && document.hasFocus())) return;
  try {
    if (localStorage.getItem(NOTIFIED_KEY) === version) return;
    let ok = await isPermissionGranted();
    if (!ok) ok = (await requestPermission()) === "granted";
    if (!ok) return;
    sendNotification({ title: "UpVision Maker", body: `Nova versão ${version} disponível. Abra o app para ver as novidades e atualizar.` });
    localStorage.setItem(NOTIFIED_KEY, version);
  } catch (e) {
    console.warn("Sem notificação do sistema:", e); // permissão negada ou fora do app: fica o aviso dentro do app
  }
}

/** "v0.5.0", a versão mais nova conhecida (API ou updater). */
export const latestVersion = (s: Pick<UpdatesState, "update" | "behind">) => s.behind?.latest ?? s.update?.version ?? null;
