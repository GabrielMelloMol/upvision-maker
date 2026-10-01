import { writeFile } from "@tauri-apps/plugin-fs";
import { getDb } from "../../db";
import { ownerOf, photos } from "../../db/photosRepo";
import type { Product } from "../../domain/products";
import { slug } from "../../ui/saveFile";

/**
 * Fotos para o marketplace (#162): a planilha só aceita link, então as fotos de cada produto vão como arquivos ao
 * lado dela, com o SKU (ou o nome) no começo do arquivo para achar na hora de subir: "vaso-azul-1.jpg".
 */
export function photoFiles(items: { product: Pick<Product, "sku" | "name">; dataUrls: string[] }[]): { name: string; bytes: Uint8Array }[] {
  return items.flatMap(({ product, dataUrls }) =>
    dataUrls.map((url, i) => ({
      name: `${slug(product.sku || product.name)}-${i + 1}.${url.startsWith("data:image/png") ? "png" : "jpg"}`,
      bytes: Uint8Array.from(atob(url.split(",")[1]), (c) => c.charCodeAt(0)),
    })),
  );
}

/** Grava as fotos dos produtos na pasta da planilha; devolve quantas. */
export async function savePhotosBeside(sheetPath: string, products: Product[]): Promise<number> {
  const db = await getDb();
  const items = await Promise.all(products.map(async (product) => ({ product, dataUrls: (await photos.list(db, ownerOf("product", product.id))).map((p) => p.dataUrl) })));
  const dir = sheetPath.replace(/[^/\\]+$/, "");
  const files = photoFiles(items);
  for (const f of files) await writeFile(dir + f.name, f.bytes);
  return files.length;
}
