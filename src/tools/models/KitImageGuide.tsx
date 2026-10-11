import { Check, X } from "lucide-react";
import { KIT_EXAMPLES } from "./kitExamples";

const dataUrl = (svg: string) => `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
const example = (id: string) => KIT_EXAMPLES.find((e) => e.id === id)!.svg;

/** Desenhos dos exemplos "ruins" (próprios, simples): vista de frente, várias coisas e fundo bagunçado. */
const FRONT_CAR = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 120" fill="#1d1d1f"><rect x="62" y="22" width="76" height="34" rx="10"/><rect x="40" y="48" width="120" height="44" rx="12"/><rect x="34" y="78" width="26" height="26" rx="6"/><rect x="140" y="78" width="26" height="26" rx="6"/></svg>`;
const MANY = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 120" fill="#1d1d1f"><circle cx="40" cy="44" r="24"/><path d="M86 96L112 36L138 96Z"/><rect x="150" y="30" width="34" height="62" rx="6"/><circle cx="62" cy="98" r="9"/></svg>`;
const MESSY = (() => {
  const bars = Array.from({ length: 22 }, (_, i) => `<rect x="${(i * 37) % 190}" y="${(i * 53) % 110}" width="${14 + ((i * 11) % 30)}" height="${8 + ((i * 7) % 22)}" fill="${["#b9b4a8", "#8d887c", "#d6d1c4"][i % 3]}"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 120">${bars}<g fill="#1d1d1f" transform="translate(30 20) scale(0.72)">${example("dino").replace(/^<svg[^>]*>|<\/svg>$/g, "")}</g></svg>`;
})();

type Tile = { svg: string; title: string; text: string };
const GOOD: Tile[] = [
  { svg: example("elephant"), title: "De lado", text: "O bicho ou o carro inteiro, de perfil." },
  { svg: example("car"), title: "Uma figura só", text: "Sem outros objetos ao redor." },
  { svg: example("dino"), title: "Fundo liso", text: "Ou transparente, se for SVG." },
];
const BAD: Tile[] = [
  { svg: FRONT_CAR, title: "De frente", text: "Não mostra o comprimento." },
  { svg: MANY, title: "Várias coisas", text: "O kit usa uma figura só." },
  { svg: MESSY, title: "Fundo bagunçado", text: "O recorte erra o contorno." },
];

function Tiles({ tiles, good }: { tiles: Tile[]; good: boolean }) {
  const Icon = good ? Check : X;
  return (
    <ul className={`kit-guide-tiles ${good ? "good" : "bad"}`} aria-label={good ? "Funciona" : "Não funciona"}>
      {tiles.map((t) => (
        <li key={t.title} className="kit-guide-tile">
          <img src={dataUrl(t.svg)} alt="" />
          <span className="kit-guide-cap">
            <Icon aria-hidden />
            <strong>{t.title}</strong>
          </span>
          <span className="kit-guide-text">{t.text}</span>
        </li>
      ))}
    </ul>
  );
}

/** Quadro curto "Que imagem funciona" do Kit card: exemplos bons e ruins desenhados, no fim do texto o que o app faz com cada caso. */
export default function KitImageGuide() {
  return (
    <details className="kit-guide" open>
      <summary>Que imagem funciona</summary>
      <Tiles tiles={GOOD} good />
      <Tiles tiles={BAD} good={false} />
      <p className="hint">Desenho só de linha vira peça maciça e buracos pequenos somem. A vista de cima é opcional e só vale na figura.</p>
    </details>
  );
}
