import { useEffect, useState } from "react";
import { errorText } from "../ui/Toast";
import { fileToSvg, svgWidthMm } from "./designInput";
import { clearHandoff, peekHandoff } from "./handoff";

/** Entrada de desenho compartilhada pelas ferramentas 3D: arquivo (SVG ou imagem) ou SVG vindo de outra ferramenta. */
export function useDesignInput(defaultWidth: number) {
  const [svg, setSvg] = useState<{ text: string; name: string } | null>(() => {
    const h = peekHandoff();
    return h && { text: h.svg, name: h.name };
  });
  const [width, setWidth] = useState(() => Math.round((svg && svgWidthMm(svg.text)) || defaultWidth));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(clearHandoff, []);

  async function onFile(f: File) {
    setLoading(true);
    setError(null);
    try {
      const text = await fileToSvg(f);
      setSvg({ text, name: f.name.replace(/\.[^.]+$/, "") });
      const w = svgWidthMm(text);
      if (w && f.name.toLowerCase().endsWith(".svg")) setWidth(Math.round(w));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }

  return { svg, width, setWidth, loading, error, onFile };
}
