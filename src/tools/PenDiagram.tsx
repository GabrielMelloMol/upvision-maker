import { AIR_MM, CAL_Z } from "../geometry/plotter";

const fmt = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
const INK = "#0B1F66";
const ACCENT = "#F85A00";
const MUTED = "#8a90a6";

/** Seta com ponta nas duas extremidades (cotas). */
function Dim({ x1, y1, x2, y2, color = MUTED }: { x1: number; y1: number; x2: number; y2: number; color?: string }) {
  return <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={1.2} markerStart="url(#pd-arrow)" markerEnd="url(#pd-arrow)" />;
}

/**
 * Montar a caneta sem medir nada (#322), em 3 quadros: a impressora para com o bico a 5 mm do papel; solta-se a caneta
 * no suporte até a ponta encostar; aperta-se o parafuso. Fora de escala de propósito (5 mm sumiria).
 */
export function MountSteps({ press, lift, air }: { press: number; lift: number; air: boolean }) {
  const PAPER = 132;
  const panel = (i: number, title: string, line2: string, tip: number, screw: boolean) => {
    const x = 8 + i * 124;
    const noz = PAPER - 28; // 5 mm "desenhado"
    return (
      <g key={i}>
        <rect x={x} y={4} width={116} height={176} rx={8} fill="#f6f7fb" stroke="#e1e4ee" />
        <text x={x + 8} y={22} fontSize={11} fontWeight={700} fill={INK}>{title}</text>
        <rect x={x + 6} y={PAPER} width={104} height={4} fill="#fff" stroke={MUTED} strokeWidth={0.5} />
        {/* cabeçote parado e bico */}
        <rect x={x + 14} y={noz - 50} width={40} height={34} rx={4} fill="#eef0f6" stroke={MUTED} />
        <path d={`M${x + 27} ${noz - 16}h14l-5 16h-4z`} fill={MUTED} />
        {/* suporte preso no cabeçote */}
        <rect x={x + 54} y={noz - 44} width={30} height={10} rx={2} fill="#d9dce6" stroke={MUTED} />
        {screw && <circle cx={x + 92} cy={noz - 39} r={6} fill={ACCENT} stroke="#fff" strokeWidth={1.5} />}
        {/* caneta */}
        <rect x={x + 63} y={tip - 70} width={12} height={62} rx={2} fill={INK} />
        <path d={`M${x + 63} ${tip - 8}h12l-6 8z`} fill={INK} />
        {i === 0 && <Dim x1={x + 34} y1={noz} x2={x + 34} y2={PAPER} color={ACCENT} />}
        {i === 1 && <path d={`M${x + 96} ${tip - 60}v36`} stroke={ACCENT} strokeWidth={2} markerEnd="url(#pd-arrow-a)" />}
        <text x={x + 8} y={160} fontSize={9.5} fill={i === 0 ? ACCENT : INK}>{line2.split("|")[0]}</text>
        <text x={x + 8} y={172} fontSize={9.5} fill={i === 0 ? ACCENT : INK}>{line2.split("|")[1]}</text>
      </g>
    );
  };
  return (
    <svg viewBox="0 0 380 216" role="img" aria-label={`Como montar a caneta: 1, a impressora para com o bico a ${fmt(CAL_Z)} mm do papel; 2, solte a caneta no suporte até a ponta encostar no papel; 3, aperte o parafuso e toque em Continuar. Desenhando, o bico desce mais ${fmt(press)} mm e a caneta aperta o papel; entre traços, sobe ${fmt(lift)} mm.`} style={{ width: "100%", maxWidth: 440 }}>
      <defs>
        <marker id="pd-arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0 0L10 5L0 10z" fill={ACCENT} />
        </marker>
        <marker id="pd-arrow-a" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M0 0L10 5L0 10z" fill={ACCENT} />
        </marker>
      </defs>
      {panel(0, "1. Ela para", `bico parado a ${fmt(CAL_Z)} mm|do papel, no meio`, PAPER - 34, false)}
      {panel(1, "2. Solte a caneta", "deixe descer até a|ponta encostar", PAPER, false)}
      {panel(2, "3. Aperte", "aperte o parafuso e|toque em Continuar", PAPER, true)}
      <text x={8} y={198} fontSize={10} fill={INK}>
        Desenhando, o bico desce mais <tspan fontWeight={700} fill={ACCENT}>{fmt(press)} mm</tspan>: a caneta aperta o papel.
      </text>
      <text x={8} y={212} fontSize={10} fill={air ? ACCENT : INK}>
        {air ? `Testar no ar ligado: tudo ${AIR_MM} mm mais alto, sem encostar.` : `Entre um traço e outro, sobe ${fmt(lift)} mm.`}
      </text>
    </svg>
  );
}

/** Vista de cima (#317): onde a ponta da caneta fica em relação ao bico. */
export function TopView({ offX, offY }: { offX: number; offY: number }) {
  const big = Math.max(Math.abs(offX), Math.abs(offY), 1);
  const S = Math.min(2.2, 70 / big); // px por mm: medidas pequenas aparecem, grandes cabem
  const c = [130, 105];
  const pen = [c[0] + offX * S, c[1] - offY * S];
  const label = (n: number, dir: string) => `${fmt(Math.abs(n))} mm ${dir}`;
  return (
    <svg viewBox="0 0 260 215" role="img" aria-label={`De cima, olhando a impressora de frente: a ponta da caneta fica ${fmt(Math.abs(offX))} mm ${offX >= 0 ? "à direita" : "à esquerda"} e ${fmt(Math.abs(offY))} mm ${offY > 0 ? "para trás" : "para a frente"} do bico.`} style={{ width: "100%", maxWidth: 300 }}>
      <defs>
        <marker id="pd-arrow2" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0 0L10 5L0 10z" fill={ACCENT} />
        </marker>
      </defs>
      <text x={8} y={14} fontSize={11} fontWeight={700} fill={INK}>De cima</text>
      <text x={c[0]} y={30} fontSize={9} fill={MUTED} textAnchor="middle">↑ fundo da impressora</text>
      <text x={c[0]} y={208} fontSize={9} fill={MUTED} textAnchor="middle">↓ frente (você está aqui)</text>
      <rect x={c[0] - 34} y={c[1] - 26} width={68} height={52} rx={8} fill="#eef0f6" stroke={MUTED} />
      <circle cx={c[0]} cy={c[1]} r={5} fill={MUTED} />
      <text x={c[0] + (offX > 0 ? -9 : 9)} y={c[1] + (offY > 0 ? 14 : -8)} fontSize={9} fill={MUTED} textAnchor={offX > 0 ? "end" : "start"}>bico</text>
      {offY !== 0 && (
        <>
          <line x1={c[0]} y1={c[1]} x2={c[0]} y2={pen[1]} stroke={ACCENT} strokeWidth={1.4} markerEnd="url(#pd-arrow2)" />
          <text x={c[0] + (offX > 0 ? -6 : 6)} y={(c[1] + pen[1]) / 2 + 3} fontSize={10} fill={ACCENT} fontWeight={700} textAnchor={offX > 0 ? "end" : "start"}>{label(offY, offY > 0 ? "para trás" : "para a frente")}</text>
        </>
      )}
      {offX !== 0 && (
        <>
          <line x1={c[0]} y1={pen[1]} x2={pen[0]} y2={pen[1]} stroke={ACCENT} strokeWidth={1.4} markerEnd="url(#pd-arrow2)" />
          <text x={(c[0] + pen[0]) / 2} y={pen[1] + (offY > 0 ? -7 : 14)} fontSize={10} fill={ACCENT} fontWeight={700} textAnchor="middle">{label(offX, offX > 0 ? "à direita" : "à esquerda")}</text>
        </>
      )}
      <circle cx={pen[0]} cy={pen[1]} r={6} fill={INK} stroke="#fff" strokeWidth={1.5} />
      <text x={pen[0] + (offX >= 0 ? 10 : -10)} y={pen[1] + 4} fontSize={10} fill={INK} fontWeight={700} textAnchor={offX >= 0 ? "start" : "end"}>caneta</text>
    </svg>
  );
}
