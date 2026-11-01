import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";
import { useSyncExternalStore } from "react";
import { z } from "zod";
import { getDb } from "../db";
import { getSecret, setSecret } from "../db/repo";
import type { Db } from "../db/types";
import { logError } from "../diagnostics/log";

/**
 * Impressoras Bambu ao vivo (#15), só leitura. A conexão (IP, série, código de acesso e a impressão digital do
 * certificado) fica na tabela local de segredos, fora do backup e da sincronização. O Rust (printer.rs) manda cada
 * relatório; aqui juntamos os pedaços (a A1 manda só o que mudou) e resumimos.
 */
const KEY = "bambu_links";

export const Link = z.object({
  serial: z.string().regex(/^[A-Za-z0-9]{8,24}$/),
  ip: z.string().min(7).max(45),
  code: z.string().regex(/^[A-Za-z0-9]{4,16}$/),
  pin: z.string().regex(/^([0-9a-f]{64})?$/),
  name: z.string().max(80),
});
export type Link = z.infer<typeof Link>;

export async function loadLinks(db: Db): Promise<Link[]> {
  try {
    return z.array(Link).parse(JSON.parse((await getSecret(db, KEY)) ?? "[]"));
  } catch (e) {
    logError("impressora na rede", e, "warn");
    return [];
  }
}
const saveLinks = (db: Db, links: Link[]) => setSecret(db, KEY, JSON.stringify(links));

// ---------- resumo do relatório ----------

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);

/** Junta um relatório parcial no estado (objetos por campo, listas e valores trocados inteiros). */
export function merge(into: Obj, part: Obj): Obj {
  const out: Obj = { ...into };
  for (const [k, v] of Object.entries(part)) out[k] = isObj(v) && isObj(out[k]) ? merge(out[k] as Obj, v) : v;
  return out;
}

export const STATE_LABEL: Record<string, string> = {
  IDLE: "Parada",
  PREPARE: "Preparando",
  SLICING: "Preparando",
  RUNNING: "Imprimindo",
  PAUSE: "Pausada",
  FINISH: "Terminou",
  FAILED: "Parou com erro",
};

export type Tray = { hex: string | null; type: string; remain: number | null };
export type PrinterNow = {
  state: string;
  label: string;
  job: string;
  percent: number | null;
  remainingMin: number | null;
  layer: number | null;
  layers: number | null;
  nozzle: number | null;
  bed: number | null;
  trays: Tray[];
  error: boolean;
};

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : null);
const str = (v: unknown) => (typeof v === "string" ? v : "");

function tray(t: unknown): Tray | null {
  if (!isObj(t) || !str(t.tray_type)) return null;
  const c = str(t.tray_color);
  const remain = num(t.remain);
  return { hex: /^[0-9A-Fa-f]{6}/.test(c) ? `#${c.slice(0, 6).toLowerCase()}` : null, type: str(t.tray_type), remain: remain !== null && remain >= 0 ? remain : null };
}

export function summarize(print: Obj): PrinterNow {
  const state = str(print.gcode_state).toUpperCase() || "IDLE";
  const ams = isObj(print.ams) && Array.isArray(print.ams.ams) ? print.ams.ams : [];
  const trays = [...ams.flatMap((u) => (isObj(u) && Array.isArray(u.tray) ? u.tray : [])), print.vt_tray].map(tray).filter((t): t is Tray => !!t);
  const busy = state === "RUNNING" || state === "PAUSE" || state === "PREPARE";
  return {
    state,
    label: STATE_LABEL[state] ?? state,
    job: busy || state === "FINISH" || state === "FAILED" ? str(print.subtask_name) : "",
    percent: busy ? num(print.mc_percent) : null,
    remainingMin: busy ? num(print.mc_remaining_time) : null,
    layer: busy ? num(print.layer_num) : null,
    layers: busy ? num(print.total_layer_num) : null,
    nozzle: num(print.nozzle_temper),
    bed: num(print.bed_temper),
    trays,
    error: state === "FAILED" || (num(print.print_error) ?? 0) !== 0,
  };
}

/** Aviso do sistema quando muda algo que pede a pessoa: terminou, parou com erro, pausou. */
export function noticeFor(name: string, before: PrinterNow | undefined, now: PrinterNow): string | null {
  if (!before || before.state === now.state) return null;
  const job = now.job ? `: ${now.job}` : "";
  if (now.state === "FINISH") return `${name} terminou${job}. Pode tirar a peça.`;
  if (now.state === "FAILED") return `${name} parou com erro${job}. Confira na impressora.`;
  if (now.state === "PAUSE" && before.state === "RUNNING") return `${name} pausou${job}. Pode ser troca de filamento ou o filamento acabou.`;
  return null;
}

// ---------- estado ao vivo ----------

export type Live = { link: Link; raw: Obj; now?: PrinterNow; online: boolean; error?: string };
let live = new Map<string, Live>();
const subs = new Set<() => void>();
const set = (serial: string, patch: Partial<Live>) => {
  const cur = live.get(serial);
  if (!cur) return;
  live = new Map(live).set(serial, { ...cur, ...patch });
  subs.forEach((f) => f());
};
const subscribe = (f: () => void) => (subs.add(f), () => void subs.delete(f));
export const usePrinters = () => useSyncExternalStore(subscribe, () => live);
export const printersNow = () => [...live.values()];

async function notify(body: string) {
  try {
    if (!(await isPermissionGranted()) && (await requestPermission()) !== "granted") return;
    sendNotification({ title: "UpVision Maker", body });
  } catch (e) {
    logError("impressora na rede", e, "warn");
  }
}

export function onReport(serial: string, text: string) {
  const cur = live.get(serial);
  if (!cur) return;
  let msg: unknown;
  try {
    msg = JSON.parse(text);
  } catch {
    return;
  }
  if (!isObj(msg) || !isObj(msg.print)) return;
  const raw = merge(cur.raw, msg.print);
  const now = summarize(raw);
  const n = noticeFor(cur.link.name || "A impressora", cur.now, now);
  if (n) void notify(n);
  set(serial, { raw, now, online: true, error: undefined });
}

/** Conecta e passa a acompanhar; na primeira vez guarda a impressão digital do certificado. */
export async function watch(link: Link): Promise<void> {
  live = new Map(live).set(link.serial, { link, raw: {}, online: false, ...(live.get(link.serial) && { now: live.get(link.serial)!.now }) });
  subs.forEach((f) => f());
  try {
    const pin = await invoke<string>("printer_watch", { ip: link.ip, serial: link.serial, code: link.code, pin: link.pin });
    const db = await getDb();
    const links = (await loadLinks(db)).filter((l) => l.serial !== link.serial);
    await saveLinks(db, [...links, { ...link, pin }]);
    set(link.serial, { link: { ...link, pin }, online: true, error: undefined });
  } catch (e) {
    set(link.serial, { online: false, error: String(e) });
    throw e;
  }
}

export async function forget(serial: string): Promise<void> {
  await invoke("printer_unwatch", { serial });
  const db = await getDb();
  await saveLinks(db, (await loadLinks(db)).filter((l) => l.serial !== serial));
  live = new Map(live);
  live.delete(serial);
  subs.forEach((f) => f());
}

/** Na abertura do app: escuta os relatórios e reconecta as impressoras guardadas. */
export function installPrinterBridge(): () => void {
  const offs = [
    listen<{ serial: string; report: string }>("printer-report", ({ payload }) => onReport(payload.serial, payload.report)),
    listen<{ serial: string; error: string }>("printer-offline", ({ payload }) => set(payload.serial, { online: false, error: payload.error })),
    listen<{ serial: string }>("printer-online", ({ payload }) => set(payload.serial, { online: true, error: undefined })),
  ];
  void getDb()
    .then(loadLinks)
    .then((links) => Promise.all(links.map((l) => watch(l).catch(() => {})))) // erro fica na tela de Impressoras
    .catch((e) => logError("impressora na rede", e));
  return () => offs.forEach((o) => void o.then((f) => f()).catch(() => {}));
}
