/** Arquivos enviados que entram no rascunho da ferramenta (#85): até este tamanho vão junto (base64), maiores ficam só com o nome. */
export const STORED_FILE_MAX = 4 * 1024 * 1024;

export type StoredFile = { name: string; type: string; dataUrl?: string };

const readAsDataUrl = (f: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(f);
  });

/** File → JSON do rascunho (sem o conteúdo se passar de STORED_FILE_MAX). */
export async function storeFile(f: File | null): Promise<StoredFile | null> {
  if (!f) return null;
  return f.size <= STORED_FILE_MAX ? { name: f.name, type: f.type, dataUrl: await readAsDataUrl(f) } : { name: f.name, type: f.type };
}

/** Bytes (ex.: 3MF lido) ↔ texto base64 para o rascunho; acima de STORED_FILE_MAX não guarda (null). */
export function storeBytes(b: Uint8Array | null): string | null {
  if (!b || b.length > STORED_FILE_MAX) return null;
  let s = "";
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}
export function restoreBytes(s: string | null | undefined): Uint8Array | null {
  if (!s) return null;
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** JSON do rascunho → File (null se o conteúdo não foi guardado: a pessoa reenvia). */
export async function restoreFile(s: StoredFile | null | undefined): Promise<File | null> {
  if (!s?.dataUrl) return null;
  const blob = await (await fetch(s.dataUrl)).blob();
  return new File([blob], s.name, { type: s.type || blob.type });
}
