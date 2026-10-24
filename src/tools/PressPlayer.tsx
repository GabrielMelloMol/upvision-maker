import { Pause, Play } from "lucide-react";
import { useEffect, useMemo, useState, type ComponentProps } from "react";
import { morphAt, PRESS_NAMES, writeMorph, type PressMorph } from "../geometry/thermo/press";
import type { Model } from "../geometry/types";
import Button from "../ui/Button";
import Preview3D from "../ui/Preview3D";
import Slider from "../ui/Slider";

const DURATION_MS = 6000;
const STEPS = 1000;
const autoplay = () => !matchMedia("(prefers-reduced-motion: reduce)").matches; // sem movimento: começa parada, a barra continua

/** Em que pé está a prensagem no instante `u`, para a barra. */
function stageText(mo: PressMorph, u: number): string {
  const f = morphAt(mo, u);
  if (f.blend === 0) return f.male >= mo.travel ? "Aberto" : "O macho desce";
  if (f.blend < 1 || f.male === 0) return f.male === 0 ? "Prensado" : "Prensando";
  return f.male >= mo.travel ? "Pronto" : "Abrindo";
}

/**
 * Animação da prensagem (#270): o macho desce, a tela plana vira casca, o macho volta e a casca fica na fêmea. A geometria
 * vem pronta (`buildThermo`/`buildVessel` com `morph`); cada quadro só reescreve os vértices já carregados na prévia.
 */
export default function PressPlayer({ morph, ...preview }: { morph: PressMorph } & Omit<ComponentProps<typeof Preview3D>, "models" | "tick">) {
  const live = useMemo(() => {
    const male = Float32Array.from(morph.male.parts[0].mesh.positions);
    const sheets = morph.parts.map((p) => Float32Array.from(p.flat.positions));
    const models: Model[] = [
      morph.female,
      { ...morph.male, parts: [{ ...morph.male.parts[0], mesh: { positions: male, indices: morph.male.parts[0].mesh.indices } }] },
      { name: PRESS_NAMES.sheet, previewOnly: true, parts: morph.parts.map((p, i) => ({ name: i === 0 ? PRESS_NAMES.sheet : "", color: p.color, mesh: { positions: sheets[i], indices: p.flat.indices } })) },
    ];
    writeMorph(morph, 0, { male, sheets });
    return { models, out: { male, sheets } };
  }, [morph]);
  const [u, setU] = useState(0);
  const [playing, setPlaying] = useState(autoplay);
  // geometria nova (outra imagem, outra medida): volta ao começo e toca de novo
  const [seen, setSeen] = useState(live);
  if (seen !== live) {
    setSeen(live);
    setU(0);
    setPlaying(autoplay());
  }

  useEffect(() => {
    if (!playing) return;
    let raf = 0, last = performance.now();
    const step = (now: number) => {
      const dt = (now - last) / DURATION_MS;
      last = now;
      setU((cur) => {
        const next = Math.min(1, cur + dt);
        if (next >= 1) setPlaying(false);
        return next;
      });
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  // antes do efeito da prévia (o do filho roda primeiro): quando ela redesenha, os vértices já estão no quadro novo
  useMemo(() => writeMorph(morph, u, live.out), [morph, u, live]);

  const toggle = () => {
    if (!playing && u >= 1) setU(0);
    setPlaying(!playing);
  };
  return (
    <>
      <Preview3D {...preview} models={live.models} tick={u} />
      <div className="press-player">
        <Button size="sm" icon={playing ? Pause : Play} onClick={toggle} aria-label={playing ? "Pausar a prensagem" : "Tocar a prensagem"}>
          {playing ? "Pausar" : "Tocar"}
        </Button>
        <Slider
          label="Prensagem"
          value={Math.round(u * STEPS)}
          min={0}
          max={STEPS}
          display={(v) => stageText(morph, v / STEPS)}
          onChange={(v) => {
            setPlaying(false);
            setU(v / STEPS);
          }}
        />
      </div>
    </>
  );
}
