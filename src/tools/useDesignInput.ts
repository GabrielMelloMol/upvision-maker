import { useEffect, useState } from "react";
import { errorText } from "../ui/Toast";
import { fileToSvg, svgWidthMm } from "./designInput";
import { clearHandoff, peekHandoff } from "./handoff";

export type Design = { svg: { text: string; name: string } | null; width: number };

/** Desenho inicial: o SVG vindo de outra ferramenta (Imagem → SVG), com a largura dele, ou nenhum. */
export function initialDesign(defaultWidth: number): Design {
  const h = peekHandoff();
  const svg = h && { text: h.svg, name: h.name };
  return { svg, width: Math.round((svg && svgWidthMm(svg.text)) || defaultWidth) };
}

/**
 * Entrada de desenho compartilhada pelas ferramentas 3D: arquivo (SVG ou imagem) ou SVG vindo de outra ferramenta.
 * O desenho e a largura ficam no estado da ferramenta (`value`/`set`, #85: desfazer e rascunho guardado).
 */
export function useDesignInput(value: Design, set: (patch: Partial<Design>, key?: string) => void) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(clearHandoff, []);

  async function onFile(f: File) {
    setLoading(true);
    setError(null);
    try {
      const text = await fileToSvg(f);
      const w = svgWidthMm(text);
      set({ svg: { text, name: f.name.replace(/\.[^.]+$/, "") }, ...(w && f.name.toLowerCase().endsWith(".svg") ? { width: Math.round(w) } : {}) });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }

  return { svg: value.svg, width: value.width, setWidth: (width: number) => set({ width }, "width"), loading, error, onFile };
}
