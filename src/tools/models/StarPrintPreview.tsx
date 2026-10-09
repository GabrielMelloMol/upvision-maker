import { useMemo } from "react";
import { skyLines } from "../../geometry/models/starSky";
import { starMapPlan, type StarMapParams } from "../../geometry/models/starMap";
import type { Params } from "./fields";

const br = (n: number, digits = 2) => n.toLocaleString("pt-BR", { maximumFractionDigits: digits });
const EDGE = 0.97; // as estrelas ficam um pouco para dentro do aro (igual à peça)

type Props = { label: string; params: Params };

/**
 * "Como vai sair impresso" (mapa estelar): o céu desenhado com o tamanho que cada estrela e cada linha terão na peça, já
 * com o mínimo do bico. As estrelas engrossadas até o mínimo ganham um contorno; o texto diz quantas são.
 */
export default function StarPrintPreview({ label, params }: Props) {
  const p = params as unknown as StarMapParams;
  const view = useMemo(() => {
    try {
      const plan = starMapPlan(p);
      const lines = p.lines ? skyLines(plan.place, plan.when) : [];
      return { plan, lines };
    } catch {
      return null; // data inválida etc.: a própria peça mostra o aviso
    }
    // só o que muda o céu e os tamanhos
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.city, p.lat, p.lon, p.tz, p.tzAuto, p.utcOffset, p.year, p.month, p.day, p.hour, p.minute, p.density, p.nozzle, p.starScale, p.hollow, p.lines, p.width]);
  if (!view) return null;
  const { plan, lines } = view;
  const r = plan.R + 2;
  const stars = plan.stars;
  const lit = p.hollow; // vazada: as estrelas são furos por onde passa a luz
  return (
    <section className="star-print span-2" aria-label={label}>
      <h3 className="star-print-title">{label}</h3>
      <svg className="star-print-sky" viewBox={`${-r} ${-r} ${2 * r} ${2 * r}`} role="img" aria-label={`Prévia impressa: ${stars.length} estrelas, a menor com ${br(Math.min(...stars.map((s) => s.d)))} mm`}>
        <circle r={plan.R + 1} fill={lit ? "#0b0f1a" : p.plateColor as string} />
        <circle r={plan.R + 0.5} fill="none" stroke={p.starColor as string} strokeWidth={1} />
        {lines.map((l, i) => (
          <polyline key={i} fill="none" stroke={p.starColor as string} strokeWidth={plan.lineMm} strokeLinecap="round" strokeLinejoin="round" points={l.points.map(([x, y]) => `${x * plan.R * EDGE},${-y * plan.R * EDGE}`).join(" ")} />
        ))}
        {stars.map((s, i) => (
          <circle key={i} cx={s.px} cy={-s.py} r={s.d / 2} fill={lit ? "#fff7d6" : (p.starColor as string)} stroke={s.ideal < plan.minStar - 1e-9 ? "#f59e0b" : "none"} strokeWidth={0.18} />
        ))}
      </svg>
      <ul className="star-print-facts">
        <li>
          <strong>{stars.length}</strong> estrelas até a magnitude {br(plan.limit, 1)} (de {plan.visible} visíveis; o limite sai do tamanho da placa)
        </li>
        <li>
          Menor {lit ? "furo" : "estrela"}: <strong>{br(Math.min(...stars.map((s) => s.d)))} mm</strong> · linhas: <strong>{br(plan.lineMm)} mm</strong>
        </li>
        <li className={plan.tooSmall ? "warn" : undefined}>
          {plan.tooSmall ? (
            <>
              <strong>{plan.tooSmall}</strong> de {stars.length} ficariam menores que {br(plan.minStar)} mm e foram engrossadas até o mínimo (contorno laranja)
            </>
          ) : (
            <>Nenhuma estrela abaixo do mínimo de {br(plan.minStar)} mm do bico</>
          )}
        </li>
      </ul>
    </section>
  );
}
