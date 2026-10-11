import { THUMBS } from "./thumbs";
import { modelOf } from "./families";

/** O que cada kit entrega, em poucas palavras (a mesma linguagem do resto do app). */
const KIT_INFO: Record<string, { tagline: string; facts: string[] }> = {
  kitBicho: { tagline: "Bicho de pé, de encaixar fatias", facts: ["6 a 9 peças", "Sem cola", "Cabeça e cauda à escolha"] },
  kitBau: { tagline: "Caixa com tampa que abre", facts: ["11 peças", "Dobradiça de pino", "3 tamanhos"] },
  kitCard: { tagline: "Monta a partir da sua imagem", facts: ["Figura ou veículo", "Sua silhueta", "Com exemplos prontos"] },
};
export const KIT_IDS = Object.keys(KIT_INFO);

type Props = { id: string; onPick: (id: string) => void };

/** Galeria dos kits de montar: um card grande por kit (miniatura, o que é e o que vem), para escolher e depois personalizar abaixo. */
export default function KitGallery({ id, onPick }: Props) {
  return (
    <div className="kit-gallery" role="group" aria-label="Escolha o kit">
      {KIT_IDS.map((kit) => {
        const m = modelOf(kit);
        const info = KIT_INFO[kit];
        const Icon = m.icon;
        return (
          <button key={kit} type="button" className="kit-gallery-card" aria-pressed={kit === id} onClick={() => kit !== id && onPick(kit)}>
            <span className="kit-gallery-thumb">{THUMBS[kit] ? <img src={THUMBS[kit]} alt="" loading="lazy" /> : <Icon aria-hidden />}</span>
            <span className="kit-gallery-name">{m.label}</span>
            <span className="kit-gallery-tag">{info.tagline}</span>
            <span className="kit-gallery-facts">
              {info.facts.map((f) => (
                <span key={f} className="pill">{f}</span>
              ))}
            </span>
          </button>
        );
      })}
    </div>
  );
}
