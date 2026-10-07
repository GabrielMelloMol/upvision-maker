import { join } from "@tauri-apps/api/path";
import { open } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Download, ExternalLink } from "lucide-react";
import { useState } from "react";
import { AMS_LABEL, amsNeed, platesByColor } from "../geometry/amsNeed";
import { bambuProject } from "../geometry/bambuProject";
import { mergeClosest } from "../geometry/colorMatch";
import { printPlan, type PrintMode } from "../geometry/printPlan";
import { profileSummary, type PrintProfile } from "../geometry/printProfile";
import { writeStl } from "../geometry/stl";
import { filamentPlan, modelColors, write3mf } from "../geometry/threemf";
import type { Model } from "../geometry/types";
import Alert from "./Alert";
import EstimateCard from "./EstimateCard";
import NumField, { inRange } from "./NumField";
import { saveFile, slug } from "./saveFile";
import Segmented from "./Segmented";
import Toggle from "./Toggle";
import { loadAms, type AmsSlot } from "../tools/amsSlots";
import { errorText, useToast } from "./Toast";
import { useData } from "./useData";
import { loadSettings } from "../db/repo";
import type { Db } from "../db/types";
import { listSlicers, openInSlicer, pickSlicer, SLICER_DOWNLOADS, type InstalledSlicer } from "../slicer/openInSlicer";

/** Fatiador do "Abrir no…" (#160): o de Ajustes, se instalado, senão o primeiro achado; null = nenhum. */
const loadSlicer = async (db: Db): Promise<InstalledSlicer | null> => pickSlicer(await listSlicers(), (await loadSettings(db)).slicer);

/** "plates" (#118): cada cor numa mesa própria, para montar ou colar depois (sem AMS e sem pausas). */
type Mode = PrintMode | "plates";
const MODES: [Mode, string][] = [
  ["ams", "Multicor"],
  ["manual", "Com pausas"],
  ["plates", "Mesa por cor"],
  ["single", "1 cor"],
];

type Props = {
  models: Model[];
  name: string;
  busy?: boolean;
  pauses?: number[];
  /** Mostra "Como vai imprimir" (1 cor / troca manual / AMS). Desligue onde a ferramenta já cuida disso. */
  printModes?: boolean;
  /** Configuração de impressão recomendada: vai no 3MF (Bambu/Orca) e aparece na tela. */
  profile?: PrintProfile;
  /** Depois de salvar um arquivo (com o `name` legível): a ferramenta guarda o projeto nos "Últimos projetos" (#85). */
  onSaved?: (fileName: string) => void;
  /** O 3MF não é a saída principal da tela (ex.: etiquetas, cujo principal é o PDF): botão comum, sem cor (#139). */
  secondary?: boolean;
};

/** Troca as cores das partes pelo mapa (cor → cor que fica). */
const recolor = (models: Model[], map: Record<string, string>): Model[] => models.map((m) => ({ ...m, parts: m.parts.map((p) => ({ ...p, color: map[p.color.toLowerCase()] ?? p.color })) }));

/** Botões padrão de exportação: 3MF com cores (principal) e STL por objeto, ajustados ao jeito de imprimir. */
export default function ExportButtons({ models: input, name, busy, pauses: inputPauses, printModes = true, profile, onSaved, secondary = false }: Props) {
  const toast = useToast();
  const [mode, setMode] = useState<Mode>("ams");
  const [layer, setLayer] = useState(profile?.layerHeight ?? 0.2);
  const [merge, setMerge] = useState(false);
  const [ams] = useData(loadAms, [] as AmsSlot[]);
  const [slicer, , slicerLoading] = useData(loadSlicer, null as InstalledSlicer | null);
  const [opening, setOpening] = useState(false);
  const colors = modelColors(input);
  const colorCount = colors.length;
  const showModes = printModes && colorCount > 1;
  const multi = colorCount > 1 && (!showModes || mode === "ams");
  // Meu AMS (#98): com filamentos carregados, cada cor vai no slot dela (ou no mais parecido); sem, avisa se passar dos slots
  const slots = multi && ams.some((s) => s.hex) ? ams.map((s) => s.hex) : undefined;
  const tooMany = multi && !slots && ams.length > 0 && colorCount > ams.length;
  const merged = tooMany && merge ? recolor(input, mergeClosest(colors, ams.length)) : input;
  const moved = slots ? filamentPlan(input, slots).moved : [];
  const plan = printPlan(merged, showModes && mode !== "plates" ? mode : "ams", inRange(layer, 0.04, 0.4) ? layer : 0.2, inputPauses ?? []);
  const models = plan.models;
  const pauses = plan.pauses;
  const disabled = busy || models.length === 0 || !!plan.error || (showModes && mode === "manual" && !inRange(layer, 0.04, 0.4));

  const hasPauses = pauses.length > 0;
  const perColor = showModes && mode === "plates";

  /** Uma mesa por cor (#118): um 3MF por cor, na pasta escolhida. */
  async function savePlates() {
    try {
      const dir = await open({ directory: true, multiple: false, title: "Pasta para as mesas (uma por cor)" });
      if (typeof dir !== "string") return;
      const plates = platesByColor(input);
      for (const [i, p] of plates.entries()) await writeFile(await join(dir, `${slug(name)}-cor-${i + 1}.3mf`), write3mf(p.models, { profile }));
      toast(`${plates.length} mesas salvas em ${dir} (uma por cor).`);
      onSaved?.(name);
    } catch (e) {
      toast(`Não foi possível salvar: ${errorText(e)}`, "error");
    }
  }

  /** Abrir no fatiador com 1 clique (#160): no Bambu Studio vai como projeto (impressora, AMS, pausas). */
  async function openSlicer() {
    if (!slicer) return;
    setOpening(true);
    try {
      const r = await openInSlicer(models, name, { pauses, profile, slicer, slots: slots ?? null });
      toast(
        !r.project
          ? `Abrindo no ${slicer.name}.`
          : r.defaultPresets
            ? `Abrindo no ${slicer.name} como projeto, mas não consegui ler os presets do Bambu Studio: usei a impressora e o filamento padrão (A1). Confira antes de imprimir.`
            : `Abrindo no ${slicer.name} como projeto, com a impressora e os filamentos.`,
      );
      onSaved?.(name);
    } catch (e) {
      toast(`Não foi possível abrir no ${slicer.name}: ${errorText(e)}`, "error");
    } finally {
      setOpening(false);
    }
  }

  async function save(file: string, data: Uint8Array | (() => Promise<Uint8Array>), ext: string, label: string) {
    try {
      const p = await saveFile(file, typeof data === "function" ? await data() : data, ext, label);
      if (p) {
        toast(`Arquivo salvo em ${p}`);
        onSaved?.(name);
      }
    } catch (e) {
      toast(`Não foi possível salvar: ${errorText(e)}`, "error");
    }
  }

  return (
    <div className="card stack">
      <EstimateCard models={input} profile={profile} name={name} busy={busy} />
      {input.length > 0 && !busy && <span className="hint">{AMS_LABEL[amsNeed(input)]}</span>}
      {showModes && (
        <>
          <span className="field-label">Como vai imprimir</span>
          <Segmented label="Como vai imprimir" value={mode} options={MODES} onChange={setMode} full />
          {mode === "manual" && (
            <>
              <NumField label="Altura de camada" value={layer} onChange={setLayer} min={0.04} max={0.4} step={0.02} hint="A mesma do fatiador (e na 1ª camada)." />
              {plan.error ? (
                <Alert kind="warn">{plan.error}</Alert>
              ) : (
                <ol className="hint">
                  {plan.swaps.map((s) => (
                    <li key={s.z}>
                      Z = {s.z.toFixed(2).replace(".", ",")} mm: a impressora pausa, troque para{" "}
                      <span className="swatch-inline">
                        <i style={{ background: s.color }} />
                        {s.color}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </>
          )}
          {mode === "single" && <span className="hint">Sai tudo num filamento só (as partes continuam separadas no arquivo).</span>}
          {mode === "plates" && <span className="hint">Cada cor sai num 3MF próprio, com as peças deitadas na mesa: imprima uma cor por vez e monte ou cole (pixel art, shadowbox, marchetaria).</span>}
        </>
      )}
      {tooMany && (
        <>
          <Alert kind="warn">
            Este modelo usa {colorCount} cores e seu AMS tem {ams.length} slots (Preferências → Meu AMS).
          </Alert>
          <Toggle label={`Juntar as cores mais parecidas (fica com ${ams.length})`} checked={merge} onChange={setMerge} />
        </>
      )}
      {moved.length > 0 && (
        <ul className="hint" aria-label="Cores sem filamento igual no AMS">
          {moved.map((m) => (
            <li key={m.color}>
              <span className="swatch-inline">
                <i style={{ background: m.color }} />
                {m.color}
              </span>{" "}
              sai no slot {m.slot} ({ams[m.slot - 1]?.label}), a cor mais parecida carregada.
            </li>
          ))}
        </ul>
      )}
      {perColor ? (
        <button className={secondary ? undefined : "action"} disabled={busy || input.length === 0} onClick={() => void savePlates()}>
          <Download aria-hidden /> Salvar uma mesa por cor ({colorCount} arquivos)
        </button>
      ) : (
        <button className={secondary ? undefined : "action"} disabled={disabled} onClick={() => save(`${slug(name)}.3mf`, write3mf(models, { pauses, profile, slots }), "3mf", "3MF")}>
          <Download aria-hidden /> Salvar 3MF{hasPauses ? " (Orca / Prusa)" : ""}
        </button>
      )}
      {!perColor && slicer && (
        <button disabled={disabled || opening} onClick={() => void openSlicer()}>
          <ExternalLink aria-hidden /> {opening ? `Abrindo no ${slicer.name}…` : `Abrir no ${slicer.name}`}
        </button>
      )}
      {!perColor && !slicer && !slicerLoading && (
        <span className="hint">
          Para abrir direto no fatiador, instale o{" "}
          {Object.values(SLICER_DOWNLOADS).map((d, i, all) => (
            <span key={d.name}>
              <button className="link" onClick={() => void openUrl(d.url).catch((e) => toast(errorText(e), "error"))}>
                {d.name}
              </button>
              {i < all.length - 2 ? ", " : i === all.length - 2 ? " ou " : ""}
            </span>
          ))}
          .
        </span>
      )}
      {/* um só botão cheio (#139); os outros formatos ficam numa linha discreta, sempre à vista */}
      <div className="export-more">
        <span>Outros formatos:</span>
        {hasPauses && (
          <button className="link" disabled={disabled} onClick={() => save(`${slug(name)}-bambu.3mf`, () => bambuProject(models, pauses!, profile, slots), "3mf", "Projeto do Bambu Studio")}>
            Projeto do Bambu Studio (pausa pronta)
          </button>
        )}
        {models.length <= 1 ? (
          <button className="link" disabled={disabled} onClick={() => save(`${slug(name)}.stl`, writeStl(models), "stl", "STL")}>
            Salvar STL
          </button>
        ) : (
          models.map((m) => (
            <button key={m.name} className="link" disabled={disabled} onClick={() => save(`${slug(`${name}-${m.name}`)}.stl`, writeStl([m]), "stl", "STL")}>
              STL {m.name.toLowerCase()}
            </button>
          ))
        )}
      </div>
      {/* polimento: uma linha à vista; o resto recolhido em "Dicas de impressão" (antes eram 4 a 6 linhas de parágrafo) */}
      {profile && (
        <span className="hint" aria-label="Configuração recomendada">
          <strong>Imprima com:</strong> {profileSummary(profile)}.
        </span>
      )}
      <details className="advanced export-tips">
        <summary>Dicas de impressão</summary>
        <div className="stack">
          {profile && <span className="hint">A configuração já vai no 3MF para o Bambu Studio e o OrcaSlicer.</span>}
          {profile?.notes?.map((n) => (
            <span key={n} className="hint">
              {n}
            </span>
          ))}
          <span className="hint">{hasPauses ? "A pausa já vai no 3MF para Orca e Prusa; no Bambu Studio, use o projeto." : "Abre no Bambu Studio, Orca e Prusa com as cores separadas."}</span>
        </div>
      </details>
    </div>
  );
}
