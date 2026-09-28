import { getVersion } from "@tauri-apps/api/app";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchReleases, versionsBehind, type Release } from "./releases";

/** Checagem automática enquanto o app fica aberto. */
export const RECHECK_MS = 6 * 60 * 60 * 1000;

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

  const checkNow = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setS((c) => ({ ...c, status: "checking", error: null }));
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
    } finally {
      busy.current = false;
    }
  }, []);

  useEffect(() => {
    void checkNow();
    const id = setInterval(() => void checkNow(), RECHECK_MS);
    return () => clearInterval(id);
  }, [checkNow]);

  /** Baixa e instala sem fechar o app; reinicia no fim. */
  const install = useCallback(async () => {
    if (!s.update) return;
    setS((c) => ({ ...c, status: "installing" }));
    try {
      await s.update.downloadAndInstall();
      await relaunch();
    } catch (e) {
      setS((c) => ({ ...c, status: "available", error: `Falha ao atualizar: ${e instanceof Error ? e.message : String(e)}` }));
    }
  }, [s.update]);

  return { ...s, checkNow, install };
}

/** "v0.5.0", a versão mais nova conhecida (API ou updater). */
export const latestVersion = (s: Pick<UpdatesState, "update" | "behind">) => s.behind?.latest ?? s.update?.version ?? null;
