/**
 * Silhuetas de exemplo do Kit card (desenhos próprios, formas simples sobrepostas, uma cor só, fundo transparente): servem
 * para experimentar sem ter imagem. Todas de lado, viradas para a direita, numa figura só.
 */
const FILL = "#1d1d1f";
const svg = (w: number, h: number, body: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}mm" height="${h}mm" fill="${FILL}">${body}</svg>`;

export type KitExample = { id: "elephant" | "dino" | "car" | "plane"; label: string; mode: "figure" | "vehicle"; svg: string };

export const KIT_EXAMPLES: readonly KitExample[] = [
  {
    id: "elephant", label: "Elefante", mode: "figure",
    svg: svg(200, 130, `<ellipse cx="92" cy="62" rx="62" ry="36"/><circle cx="160" cy="52" r="26"/><ellipse cx="142" cy="52" rx="12" ry="18"/>`
      + `<path d="M176 60C190 70 192 92 186 108L174 106C178 92 176 82 168 72Z"/><path d="M34 52C20 58 18 74 22 86L28 86C26 74 28 62 38 58Z"/>`
      + `<rect x="44" y="78" width="20" height="42" rx="6"/><rect x="68" y="78" width="20" height="42" rx="6"/><rect x="102" y="78" width="20" height="42" rx="6"/><rect x="126" y="78" width="20" height="42" rx="6"/>`),
  },
  {
    id: "dino", label: "Dinossauro", mode: "figure",
    svg: svg(200, 130, `<ellipse cx="90" cy="62" rx="50" ry="30"/><path d="M118 50L150 20L188 22L192 46L162 52L140 74Z"/><path d="M48 50L4 84L10 90L56 78Z"/>`
      + `<rect x="70" y="80" width="20" height="40" rx="6"/><rect x="98" y="80" width="20" height="40" rx="6"/><path d="M140 62L156 64L152 72L138 70Z"/>`),
  },
  {
    id: "car", label: "Carro", mode: "vehicle",
    svg: svg(200, 110, `<rect x="8" y="56" width="184" height="32" rx="10"/><path d="M48 58L70 26H132L158 58Z"/><circle cx="50" cy="90" r="18"/><circle cx="150" cy="90" r="18"/>`),
  },
  {
    id: "plane", label: "Avião", mode: "vehicle",
    svg: svg(200, 120, `<ellipse cx="100" cy="58" rx="90" ry="16"/><path d="M26 56L12 20H36L52 52Z"/><path d="M86 62H130L102 104H78Z"/><path d="M40 60L16 78H36L58 62Z"/>`),
  },
];

/** O exemplo como um arquivo SVG, igual ao que a pessoa enviaria. */
export const kitExampleFile = (ex: KitExample): File => new File([ex.svg], `${ex.id}.svg`, { type: "image/svg+xml" });
