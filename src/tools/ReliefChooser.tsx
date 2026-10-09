import { Layers, Mountain, Palette, Sun, SwatchBook, type LucideIcon } from "lucide-react";

/** As cinco formas de fazer uma foto (ou imagem) virar relevo: abas da ferramenta "Foto em relevo". */
export type ReliefMode = "litho" | "color" | "relief" | "layered" | "shadowbox";

export const RELIEF_MODES: { id: ReliefMode; label: string; icon: LucideIcon; blurb: string }[] = [
  { id: "litho", label: "Litofania", icon: Sun, blurb: "A foto aparece quando uma luz acende atrás. Em branco e preto: placa, abajur, coração ou círculo, com base de LED." },
  { id: "color", label: "Colorida", icon: Palette, blurb: "Litofania em cores: camadas de ciano, magenta, amarelo e preto sobre branco. Pede 5 filamentos." },
  { id: "relief", label: "Relevo", icon: Mountain, blurb: "Placa de uma cor só, como pedra ou gesso: o claro da foto sobe. Bom para rosto e bicho." },
  { id: "layered", label: "Quadro por camadas", icon: Layers, blurb: "Foto em relevo em cores, trocando o filamento a cada altura. Num quadro, pingente ou ímã." },
  { id: "shadowbox", label: "Shadowbox", icon: SwatchBook, blurb: "Placas recortadas, uma por cor, empilhadas para dar profundidade. Parte de uma imagem colorida." },
];

type Props = { onPick: (mode: ReliefMode) => void };

/** Primeira tela da ferramenta: o que a pessoa quer fazer, em palavras simples (ela troca depois nas abas). */
export default function ReliefChooser({ onPick }: Props) {
  return (
    <section className="relief-chooser" aria-labelledby="relief-chooser-title">
      <h2 id="relief-chooser-title">O que você quer fazer?</h2>
      <p className="hint">Escolha um jeito de transformar a foto em relevo. Dá para trocar a qualquer momento.</p>
      <ul className="relief-cards">
        {RELIEF_MODES.map(({ id, label, icon: Icon, blurb }) => (
          <li key={id}>
            <button type="button" onClick={() => onPick(id)}>
              <Icon aria-hidden />
              <strong>{label}</strong>
              <span>{blurb}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
