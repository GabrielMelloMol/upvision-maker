import { familyOf, modelOf } from "./families";
import { THUMBS } from "./thumbs";

/** Dados curtos de alguns kits (os demais mostram a descrição do próprio modelo). */
const KIT_INFO: Record<string, { tagline: string; facts: string[] }> = {
  kitBicho: { tagline: "Bicho de pé, de encaixar fatias", facts: ["6 a 9 peças", "Sem cola", "Cabeça e cauda à escolha"] },
  kitBau: { tagline: "Caixa com tampa que abre", facts: ["11 peças", "Dobradiça de pino", "3 tamanhos"] },
};

type Props = { id: string; onPick: (id: string) => void };

/** Galeria dos kits de montar: um card grande por kit da família (miniatura, o que é e o que vem), para escolher e personalizar abaixo. */
export default function KitGallery({ id, onPick }: Props) {
  return (
    <div className="kit-gallery" role="group" aria-label="Escolha o kit">
      {familyOf(id).variants.map((v) => {
        const m = modelOf(v.id);
        const info = KIT_INFO[v.id];
        const Icon = m.icon;
        return (
          <button key={v.id} type="button" className="kit-gallery-card" aria-pressed={v.id === id} onClick={() => v.id !== id && onPick(v.id)}>
            <span className="kit-gallery-thumb">{THUMBS[v.id] ? <img src={THUMBS[v.id]} alt="" loading="lazy" /> : <Icon aria-hidden />}</span>
            <span className="kit-gallery-name">{m.label}</span>
            <span className="kit-gallery-tag">{info?.tagline ?? m.blurb}</span>
            {info && (
              <span className="kit-gallery-facts">
                {info.facts.map((f) => (
                  <span key={f} className="pill">{f}</span>
                ))}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
