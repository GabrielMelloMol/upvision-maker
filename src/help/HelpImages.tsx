import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import type { HelpImage } from "./articles";

const FILES = import.meta.glob<string>("../assets/help/*.webp", { query: "?url", import: "default", eager: true });
export const helpImageUrl = (file: string): string | undefined => FILES[`../assets/help/${file}`];

/**
 * Imagens do artigo de ajuda com legenda (#84, #140). Uma imagem: figura simples. Várias: carrossel com setas,
 * pontos e ← → do teclado; o palco tem altura fixa para o texto do artigo não pular ao trocar de imagem.
 */
export default function HelpImages({ images, title }: { images: HelpImage[]; title: string }) {
  const list = images.filter((im) => helpImageUrl(im.file));
  const [i, setI] = useState(0);
  if (!list.length) return null;
  const n = list.length;
  const cur = list[Math.min(i, n - 1)];
  const go = (k: number) => setI((k + n) % n);

  const figure = (
    <figure className="help-figure" role={n > 1 ? "group" : undefined} aria-roledescription={n > 1 ? "imagem" : undefined} aria-label={n > 1 ? `${i + 1} de ${n}` : undefined}>
      <div className="help-stage">
        <img key={cur.file} src={helpImageUrl(cur.file)} alt="" loading="lazy" />
      </div>
      <figcaption>{cur.caption}</figcaption>
    </figure>
  );
  if (n === 1) return figure;

  return (
    <section
      className="help-carousel"
      aria-roledescription="carrossel"
      aria-label={`Imagens: ${title}`}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") go(i + 1);
        else if (e.key === "ArrowLeft") go(i - 1);
        else return;
        e.preventDefault();
      }}
    >
      {figure}
      <div className="help-carousel-nav">
        <button type="button" className="ghost icon-only" aria-label="Imagem anterior" onClick={() => go(i - 1)}>
          <ChevronLeft aria-hidden size={18} />
        </button>
        <div className="help-dots">
          {list.map((im, k) => (
            <button key={im.file} type="button" aria-label={`Imagem ${k + 1} de ${n}`} aria-current={k === i || undefined} onClick={() => go(k)} />
          ))}
        </div>
        <button type="button" className="ghost icon-only" aria-label="Próxima imagem" onClick={() => go(i + 1)}>
          <ChevronRight aria-hidden size={18} />
        </button>
      </div>
    </section>
  );
}
