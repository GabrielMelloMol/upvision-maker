/**
 * Miniaturas dos Modelos prontos (#149): render com fundo transparente, câmera ¾ e luz de estúdio, geradas por
 * `npm run thumbs` (src/thumbs/renderThumb.ts) em src/assets/model-thumbs/<id>.webp. O card dá o fundo (claro/escuro).
 */
const byId = (files: Record<string, string>) => Object.fromEntries(Object.entries(files).map(([path, url]) => [path.replace(/^.*\/(.+)\.(webp|jpg|png)$/, "$1"), url]));
const renders = byId(import.meta.glob("../../assets/model-thumbs/*.webp", { eager: true, query: "?url", import: "default" }) as Record<string, string>);
/** Foto real da peça impressa (#211): `src/assets/model-photos/<id>.webp|jpg|png`; quando existe, é a capa no lugar do desenho. */
const photos = byId(import.meta.glob("../../assets/model-photos/*.{webp,jpg,png}", { eager: true, query: "?url", import: "default" }) as Record<string, string>);
/** Cartões que são ferramentas (caixinha, cesto, pixel art): `src/assets/product-thumbs/<id do produto>.webp`, gerados por `npm run thumbs`. */
const productRenders = byId(import.meta.glob("../../assets/product-thumbs/*.webp", { eager: true, query: "?url", import: "default" }) as Record<string, string>);
/** Foto realista do cartão (#270, `npm run photos`): `src/assets/product-photos/<id do produto>.webp`; quando existe, vence o desenho. */
const productPhotos = byId(import.meta.glob("../../assets/product-photos/*.{webp,jpg,png}", { eager: true, query: "?url", import: "default" }) as Record<string, string>);
/** Foto realista do atalho de ferramenta dentro de uma família (#280): `src/assets/tool-photos/<página>.webp`; sem ela, a setinha. */
export const TOOL_THUMBS = byId(import.meta.glob("../../assets/tool-photos/*.{webp,jpg,png}", { eager: true, query: "?url", import: "default" }) as Record<string, string>);
export const PRODUCT_THUMBS: Record<string, string> = { ...productRenders, ...productPhotos };
export const THUMBS: Record<string, string> = { ...renders, ...photos };
