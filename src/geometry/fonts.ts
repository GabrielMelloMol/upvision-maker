import opentype, { type Font } from "opentype.js";
import { CATALOG, fontUrl, type FontCategory } from "./fontCatalog";

export { FONT_CATEGORIES, type FontCategory } from "./fontCatalog";

export type FontEntry = {
  id: string;
  label: string;
  category: FontCategory | "Minhas";
  /** font-family CSS (registrada sob demanda com ensureCssFont). */
  css: string;
  url?: string;
};
export type FontId = string;

/** Fontes embutidas no app (todas SIL Open Font License, Google Fonts). */
export const FONTS: FontEntry[] = CATALOG.map((f) => ({ id: f.id, label: f.family, category: f.category, css: `'uvf-${f.id}'`, url: fontUrl(f.file) }));

const USER_PREFIX = "user-";
const MAX_FONT_BYTES = 15 * 1024 * 1024;
export const FONT_ACCEPT = ".ttf,.otf";

// ---------- fontes importadas: ficam no IndexedDB do app (não vão no backup JSON) ----------
type Stored = { id: string; name: string; data: ArrayBuffer };
const DB_NAME = "upvision-fonts";
const STORE = "fonts";

function idb<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB_NAME, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(STORE, { keyPath: "id" });
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction(STORE, mode);
      const req = run(tx.objectStore(STORE));
      tx.oncomplete = () => {
        db.close();
        resolve(req.result);
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error ?? req.error);
      };
    };
  });
}

const userEntry = (s: { id: string; name: string }): FontEntry => ({ id: s.id, label: s.name, category: "Minhas", css: `'uvf-${s.id}'` });

let userFonts: FontEntry[] = [];
let userLoaded = false;
const listeners = new Set<(f: FontEntry[]) => void>();
const publish = (next: FontEntry[]) => {
  userFonts = next;
  listeners.forEach((l) => l(next));
};

/** Avisa quando a lista de fontes importadas muda (lê do disco na primeira inscrição). */
export function subscribeUserFonts(fn: (f: FontEntry[]) => void): () => void {
  listeners.add(fn);
  fn(userFonts);
  if (!userLoaded && typeof indexedDB !== "undefined") {
    userLoaded = true;
    idb<Stored[]>("readonly", (s) => s.getAll())
      .then((all) => publish(all.map(userEntry)))
      .catch((e) => {
        userLoaded = false;
        console.warn("Não deu para ler as fontes importadas:", e);
      });
  }
  return () => void listeners.delete(fn);
}

/** Valida o arquivo e devolve a fonte + o nome dela. Erros em português, para mostrar direto. */
export function parseFontFile(data: ArrayBuffer, fileName: string): { font: Font; name: string } {
  if (!/\.(ttf|otf)$/i.test(fileName)) throw new Error("Escolha um arquivo de fonte .ttf ou .otf.");
  if (data.byteLength > MAX_FONT_BYTES) throw new Error("Arquivo de fonte grande demais (máx. 15 MB).");
  let font: Font;
  try {
    font = opentype.parse(data);
  } catch {
    throw new Error("Este arquivo não é uma fonte válida.");
  }
  if (!font.charToGlyphIndex("a") && !font.charToGlyphIndex("A")) throw new Error("Esta fonte não tem letras do alfabeto latino.");
  const names = font.names as unknown as { windows?: Record<string, { en?: string }> } & Record<string, { en?: string }>;
  const n = names.windows ?? names;
  const name = n.fullName?.en || n.fontFamily?.en || fileName.replace(/\.(ttf|otf)$/i, "");
  return { font, name };
}

export async function importFont(file: File): Promise<FontEntry> {
  const data = await file.arrayBuffer();
  const { font, name } = parseFontFile(data, file.name);
  const id = `${USER_PREFIX}${Date.now().toString(36)}`;
  await idb("readwrite", (s) => s.put({ id, name, data } satisfies Stored));
  cache.set(id, Promise.resolve(font));
  const entry = userEntry({ id, name });
  publish([...userFonts, entry]);
  return entry;
}

export async function removeUserFont(id: FontId): Promise<void> {
  await idb("readwrite", (s) => s.delete(id));
  cache.delete(id);
  publish(userFonts.filter((f) => f.id !== id));
}

// ---------- carregar ----------
async function fontBytes(id: FontId): Promise<ArrayBuffer> {
  if (id.startsWith(USER_PREFIX)) {
    const s = await idb<Stored | undefined>("readonly", (st) => st.get(id));
    if (!s) throw new Error("Esta fonte importada foi removida. Escolha outra.");
    return s.data;
  }
  const url = FONTS.find((x) => x.id === id)?.url;
  if (!url) throw new Error(`Fonte desconhecida: ${id}`);
  const r = await fetch(url);
  if (r.ok === false) throw new Error(`Não deu para abrir a fonte (${r.status}).`); // === false: os stubs de fetch dos testes não têm `ok`
  return r.arrayBuffer();
}

const cache = new Map<FontId, Promise<Font>>();

export function loadFont(id: FontId): Promise<Font> {
  let f = cache.get(id);
  if (!f) {
    f = fontBytes(id).then((b) => opentype.parse(b));
    f.catch(() => cache.delete(id));
    cache.set(id, f);
  }
  return f;
}

const EMOJI_FILE = "noto-emoji-700.ttf";
let emoji: Promise<Font> | null = null;

/** Fonte reserva de emoji (Noto Emoji monocromática, fora do seletor). Carregue só se o texto tiver emoji (hasEmoji). */
export function loadEmojiFont(): Promise<Font> {
  if (!emoji) {
    emoji = fetch(fontUrl(EMOJI_FILE))
      .then((r) => {
        if (r.ok === false) throw new Error(`Não deu para abrir a fonte de emoji (${r.status}).`);
        return r.arrayBuffer();
      })
      .then((b) => opentype.parse(b));
    emoji.catch(() => (emoji = null));
  }
  return emoji;
}

const cssDone = new Map<FontId, Promise<void>>();

/** Registra a fonte no CSS (prévia no seletor), uma vez por fonte. Sem FontFace (testes), não faz nada. */
export function ensureCssFont(id: FontId): Promise<void> {
  if (typeof FontFace === "undefined") return Promise.resolve();
  let p = cssDone.get(id);
  if (!p) {
    p = fontBytes(id).then(async (b) => {
      document.fonts.add(await new FontFace(`uvf-${id}`, b).load());
    });
    p.catch(() => cssDone.delete(id));
    cssDone.set(id, p);
  }
  return p;
}

export const isCursive = (id: FontId) => FONTS.find((f) => f.id === id)?.category === "Cursiva";
