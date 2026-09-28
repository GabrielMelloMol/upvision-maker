import { ImageSegmenter } from "@mediapipe/tasks-vision";
import loaderUrl from "@mediapipe/tasks-vision/vision_wasm_internal.js?url";
import wasmUrl from "@mediapipe/tasks-vision/vision_wasm_internal.wasm?url";
import deeplabUrl from "../assets/models/deeplab_v3.tflite?url";
import selfieUrl from "../assets/models/selfie_segmenter.tflite?url";

/** O que a IA local deve recortar. "plain" = sem IA (fundo liso, por inundação da borda). */
export type Subject = "person" | "pet" | "plain";

const MODELS: Record<Exclude<Subject, "plain">, string> = { person: selfieUrl, pet: deeplabUrl };
const CONFIDENCE = 0.5;
const cache = new Map<string, Promise<ImageSegmenter>>();

function segmenter(subject: Exclude<Subject, "plain">): Promise<ImageSegmenter> {
  let s = cache.get(subject);
  if (!s) {
    s = ImageSegmenter.createFromOptions(
      { wasmLoaderPath: loaderUrl, wasmBinaryPath: wasmUrl },
      {
        baseOptions: { modelAssetPath: MODELS[subject], delegate: "CPU" },
        runningMode: "IMAGE",
        outputCategoryMask: subject === "pet",
        outputConfidenceMasks: subject === "person",
      },
    );
    s.catch(() => cache.delete(subject));
    cache.set(subject, s);
  }
  return s;
}

/**
 * Máscara do objeto principal (1 = objeto), do tamanho da imagem. Roda localmente (WASM, ~12 MB, carregado sob demanda).
 * Retorna null para "plain" (o pipeline usa a remoção de fundo por inundação).
 */
export async function segmentSubject(rgba: Uint8ClampedArray, w: number, h: number, subject: Subject): Promise<Uint8Array | null> {
  if (subject === "plain") return null;
  const seg = await segmenter(subject);
  const result = seg.segment(new ImageData(new Uint8ClampedArray(rgba), w, h));
  try {
    const out = new Uint8Array(w * h);
    if (subject === "person") {
      const conf = result.confidenceMasks![0].getAsFloat32Array();
      for (let i = 0; i < out.length; i++) out[i] = conf[i] >= CONFIDENCE ? 1 : 0;
    } else {
      const cat = result.categoryMask!.getAsUint8Array();
      for (let i = 0; i < out.length; i++) out[i] = cat[i] !== 0 ? 1 : 0; // 0 = fundo no DeepLab
    }
    return out;
  } finally {
    result.close();
  }
}
