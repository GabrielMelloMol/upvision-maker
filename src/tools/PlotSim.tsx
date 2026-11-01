import { Pause, Play, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Stroke } from "../geometry/plotter";
import Button from "../ui/Button";
import Segmented from "../ui/Segmented";

type Pt = [number, number];
const SPEEDS = [["5", "5×"], ["20", "20×"], ["60", "60×"]] as const;
const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Até onde a caneta chegou depois de `done` mm de linha: os traços inteiros, o pedaço do atual e a ponta. */
export function progress(strokes: Stroke[], done: number): { lines: Pt[][]; tip: Pt | null } {
  const lines: Pt[][] = [];
  let left = done;
  for (const s of strokes) {
    const part: Pt[] = [s[0]];
    for (let i = 1; i < s.length; i++) {
      const d = dist(s[i - 1], s[i]);
      if (left >= d) {
        part.push(s[i]);
        left -= d;
        continue;
      }
      const k = left / d;
      part.push([s[i - 1][0] + (s[i][0] - s[i - 1][0]) * k, s[i - 1][1] + (s[i][1] - s[i - 1][1]) * k]);
      lines.push(part);
      return { lines, tip: part[part.length - 1] };
    }
    lines.push(part);
  }
  return { lines, tip: null };
}

/**
 * Simulação (#317): a caneta percorre os traços na ordem em que a impressora vai desenhar, numa velocidade acelerada.
 * Desenha dentro do <g> da prévia (Y para cima); os botões vão em `controls`.
 */
export function usePlotSim(strokes: Stroke[] | null, feedMmMin: number) {
  const total = useMemo(() => (strokes ?? []).reduce((t, s) => t + s.slice(1).reduce((u, p, i) => u + dist(s[i], p), 0), 0), [strokes]);
  // a simulação vale para um desenho só: mudou o desenho, volta a mostrar tudo
  const [run, setRun] = useState<{ of: Stroke[] | null; done: number | null; playing: boolean }>({ of: null, done: null, playing: false });
  const mine = run.of === strokes;
  const done = mine ? run.done : null; // null = sem simulação (mostra o desenho todo)
  const playing = mine && run.playing;
  const setDone = (f: number | null | ((d: number | null) => number | null)) => setRun((r) => ({ ...r, of: strokes, done: typeof f === "function" ? f(r.of === strokes ? r.done : null) : f }));
  const setPlaying = (p: boolean) => setRun((r) => ({ ...r, of: strokes, playing: p }));
  const [speed, setSpeed] = useState("20");
  const last = useRef(0);

  useEffect(() => {
    if (!playing) return;
    let id = 0;
    last.current = performance.now();
    const tick = (now: number) => {
      const dt = (now - last.current) / 1000;
      last.current = now;
      setRun((r) => {
        const next = Math.min(total, (r.done ?? 0) + (feedMmMin / 60) * Number(speed) * dt);
        return { ...r, done: next, playing: next < total };
      });
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [playing, total, feedMmMin, speed]);

  const view = done === null || !strokes ? null : progress(strokes, done);
  const layer = view && (
    <g aria-hidden>
      {view.lines.map((l, i) => (
        <polyline key={i} points={l.map((p) => p.join(",")).join(" ")} fill="none" stroke="#F85A00" strokeWidth={0.6} strokeLinejoin="round" />
      ))}
      {view.tip && <circle cx={view.tip[0]} cy={view.tip[1]} r={2.2} fill="#F85A00" stroke="#fff" strokeWidth={0.6} />}
    </g>
  );
  const pct = total ? Math.round(((done ?? 0) / total) * 100) : 0;
  const controls = strokes?.length ? (
    <div className="row" style={{ alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      {playing ? (
        <Button icon={Pause} onClick={() => setPlaying(false)}>
          Pausar
        </Button>
      ) : (
        <Button icon={Play} onClick={() => (done === null || done >= total ? (setDone(0), setPlaying(true)) : setPlaying(true))}>
          {done !== null && done < total ? "Continuar" : "Simular o desenho"}
        </Button>
      )}
      {done !== null && (
        <Button icon={RotateCcw} onClick={() => (setDone(null), setPlaying(false))}>
          Ver tudo
        </Button>
      )}
      <Segmented label="Velocidade da simulação" value={speed} options={SPEEDS} onChange={setSpeed} />
      {done !== null && <span className="hint" aria-live="polite">{pct}% desenhado</span>}
    </div>
  ) : null;
  return { layer, controls, simulating: done !== null };
}
