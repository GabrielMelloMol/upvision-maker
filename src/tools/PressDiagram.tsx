/** O sanduíche da termoformagem, de baixo para cima: molde fêmea (cavidade para cima), tela plana (a que esquenta) e molde macho (domo para baixo), que desce e prensa. */
export default function PressDiagram() {
  return (
    <figure className="press-diagram">
      <svg viewBox="0 0 470 200" role="img" aria-label="Sanduíche da termoformagem, de baixo para cima: 1 molde fêmea com a cavidade para cima, 2 tela plana de PLA que é aquecida, 3 molde macho com o domo para baixo, que desce e prensa a tela dentro da fêmea." width="100%" style={{ maxWidth: 440 }}>
        <g strokeWidth="1.5" strokeLinejoin="round">
          <path d="M20 190 H220 V152 H175 Q120 182 65 152 H20 Z" fill="color-mix(in srgb, #3b82f6 45%, white)" stroke="#1d4ed8" />
          <path d="M20 40 H220 V76 H175 Q120 126 65 76 H20 Z" fill="#3b82f6" stroke="#1d4ed8" />
        </g>
        <rect x="20" y="108" width="200" height="5" rx="2" fill="#1f7a4d" />
        <path d="M50 126 q5 -8 10 0 t10 0 t10 0 M110 126 q5 -8 10 0 t10 0 t10 0 M170 126 q5 -8 10 0 t10 0" fill="none" stroke="#f97316" strokeWidth="2" strokeLinecap="round" />
        <path d="M120 4 V34 M112 26 L120 36 L128 26" fill="none" stroke="#f97316" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <g fill="currentColor" fontSize="12" fontWeight="600">
          <text x="236" y="62">3 Molde macho (de cima)</text>
          <text x="236" y="115">2 Tela (aqueça esta)</text>
          <text x="236" y="172">1 Molde fêmea (de baixo)</text>
        </g>
        <g fill="currentColor" fontSize="10.5" opacity="0.75">
          <text x="236" y="76">domo para baixo, desce e prensa</text>
          <text x="236" y="129">plana, de PLA, é a única que esquenta</text>
          <text x="236" y="186">cavidade para cima</text>
        </g>
      </svg>
    </figure>
  );
}
