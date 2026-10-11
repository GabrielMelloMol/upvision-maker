import { designFromSvg } from "../../../tools/designInput";
import { cutout, type CutoutResult } from "../../../vectorize/cutout";
import { DEFAULT_TRACE, prepare } from "../../../vectorize/pipeline";
import { buildSvg } from "../../../vectorize/svgOut";
import { vectorizeMask } from "../../../vectorize/vtrace";
import type { CS } from "../../manifold";
import type { Raster } from "./images";

// ImageData não existe no Node; o vtracer só lê data/width/height.
class NodeImageData {
  constructor(public data: Uint8ClampedArray, public width: number, public height: number) {}
}
(globalThis as { ImageData?: unknown }).ImageData ??= NodeImageData;

/** A Silhueta (MediaPipe) não roda no Node: em fundo bagunçado o recorte cai na cor, incerto, como no app sem o modelo. */
const noMediaPipe = async (): Promise<never> => {
  throw new Error("sem MediaPipe no Node");
};

export type ArtFromImage = { cs: CS; cut: CutoutResult; svgBytes: number };

/** O caminho do app (`fileToCutSvg` → `designFromSvg`) sem o navegador: recorte do fundo, vetorização em silhueta e região 2D de 80 mm. */
export async function artFromImage(r: Raster): Promise<ArtFromImage> {
  const cut = await cutout(r.rgba, r.w, r.h, { segment: noMediaPipe });
  const prepared = prepare(r.rgba, r.w, r.h, { ...DEFAULT_TRACE, mode: "silhouette" }, cut.mask);
  const d = await vectorizeMask(prepared.mask, r.w, r.h, DEFAULT_TRACE.detail);
  const svg = buildSvg(d, r.w, r.h, 80);
  const { cs } = await designFromSvg(svg, 80, false);
  return { cs, cut, svgBytes: svg.length };
}
