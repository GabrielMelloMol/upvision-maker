import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";

/** Diálogo "Salvar como" + grava. Retorna o caminho ou null se cancelado. */
export async function saveFile(defaultName: string, data: string | Uint8Array, ext: string, label: string): Promise<string | null> {
  const path = await save({ defaultPath: defaultName, filters: [{ name: label, extensions: [ext] }] });
  if (!path) return null;
  await writeFile(path, typeof data === "string" ? new TextEncoder().encode(data) : data);
  return path;
}

/** Nome de arquivo seguro a partir de um texto livre. */
export const slug = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "modelo";
