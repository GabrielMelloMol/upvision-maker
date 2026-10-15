import { Grid2x2, Paintbrush, Shapes, Cylinder, FileText } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { getManifold } from "../geometry/manifold";
import { buildKit, kitColors, pieceItemsOf, potFillWarning, type KitOut } from "../geometry/mosaic/kit";
import { assembledPreview } from "../geometry/mosaic/pieces";
import { DESIGNS } from "../geometry/mosaic/designs";
import { countCells } from "../geometry/mosaic/grid";
import { MOSAIC_BOARD_PROFILE, MOSAIC_PIECES_PROFILE, MOSAIC_POT_PROFILE } from "../geometry/printProfile";
import type { Model } from "../geometry/types";
import Alert from "../ui/Alert";
import ExportButtons from "../ui/ExportButtons";
import Preview3D from "../ui/Preview3D";
import SeeAlso from "../ui/SeeAlso";
import { useModelBuilder } from "../ui/useModelBuilder";
import BoardPanel from "./mosaic/BoardPanel";
import CardsPanel from "./mosaic/CardsPanel";
import DesignPanel from "./mosaic/DesignPanel";
import KitSummary from "./mosaic/KitSummary";
import MosaicEditor, { type Brush } from "./mosaic/MosaicEditor";
import PiecesPanel from "./mosaic/PiecesPanel";
import PotPanel from "./mosaic/PotPanel";
import { initialState, validState, type State, type Tab } from "./mosaic/state";
import ToolSessionBar from "./ToolSessionBar";
import { useToolState } from "./useToolState";

const TABS: { id: Tab; label: string; icon: typeof Grid2x2 }[] = [
  { id: "board", label: "Tabuleiro", icon: Grid2x2 },
  { id: "pieces", label: "Peças", icon: Shapes },
  { id: "pot", label: "Pote", icon: Cylinder },
  { id: "design", label: "Desenho", icon: Paintbrush },
  { id: "cards", label: "Cartões", icon: FileText },
];

const printable = (ms: Model[]) => ms.filter((m) => !m.previewOnly);

/** Mosaico (#206): tabuleiro com grade, peças de vários formatos, pote com divisórias e cartões de inspiração. */
export default function Mosaic() {
  const tool = useToolState<State>("mosaic", initialState, { label: "Mosaico" });
  const s = tool.state;
  const [tab, setTab] = useState<Tab>("board");
  const [brush, setBrush] = useState<Brush>({ color: "blue", shape: "square", rot: 0 });
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const valid = validState(s);

  // as peças dependem do desenho só quando vêm dele: pintar a grade não refaz o pote nem o tabuleiro
  const itemsKey = useMemo(() => JSON.stringify(pieceItemsOf(s).map((i) => [i.color.key, i.shape, i.n])), [s]);
  const kit = useModelBuilder<KitOut>(async () => {
    if (!valid) return null;
    const out = buildKit(await getManifold(), s);
    return { models: [out.board.model, ...out.pieces.models, ...out.pot.models], warnings: [], view: out };
  }, [s.board, s.piece, s.kit, s.counts, s.source, s.spare, s.layout, s.fill, s.pot, itemsKey, valid]);
  const asm = useModelBuilder<{ outside: number }>(async () => {
    if (!valid || !countCells(s.grid)) return null;
    const colors = kitColors(s);
    const black = colors.find((c) => c.key === "black")!;
    const r = assembledPreview(await getManifold(), s.board, s.piece, s.grid, colors, black);
    return { models: r.model ? [r.model] : [], warnings: [], view: { outside: r.outside } };
  }, [s.board, s.piece, s.kit, s.grid, valid]);

  const out = kit.view;
  const busy = kit.busy;
  useEffect(() => {
    document.title = "Mosaico";
  }, []);

  function printDesignParts() {
    tool.set((cur) => ({ ...cur, source: "design" }), "source");
    setTab("pieces");
  }

  function onKeyDown(e: KeyboardEvent, i: number) {
    const to = e.key === "ArrowRight" ? (i + 1) % TABS.length : e.key === "ArrowLeft" ? (i + TABS.length - 1) % TABS.length : e.key === "Home" ? 0 : e.key === "End" ? TABS.length - 1 : -1;
    if (to < 0) return;
    e.preventDefault();
    setTab(TABS[to].id);
    refs.current[TABS[to].id]?.focus();
  }

  const board = out ? [out.board.model] : [];
  const pieces = out ? out.pieces.models : [];
  const pot = out ? out.pot.models.filter((m) => m.name === "Pote") : [];
  const lid = out ? out.pot.models.filter((m) => m.name === "Tampa") : [];
  const preview: Model[] = tab === "board" ? [...board, ...asm.models] : tab === "pieces" ? pieces : tab === "pot" ? [...pot, ...lid] : [];
  const warnings: string[] =
    !out ? [] : tab === "board" ? [...out.board.warnings, ...(asm.view?.outside ? [`${asm.view.outside} casas do desenho ficam fora deste tabuleiro: aumente a grade ou monte um painel com mais tabuleiros.`] : [])] : tab === "pieces" ? out.pieces.warnings : tab === "pot" ? [...out.pot.warnings, ...(potFillWarning(out) ? [potFillWarning(out)!] : [])] : [];
  const first = DESIGNS.find((d) => s.cardIds.includes(d.id)) ?? (countCells(s.grid) ? { name: s.designName || "Meu desenho", grid: s.grid } : null);
  const exportModels = tab === "board" ? board : tab === "pieces" ? pieces : tab === "pot" ? [...pot, ...lid] : [];

  return (
    <div className="page">
      <h1>Mosaico</h1>
      <p className="lead">Tabuleiro, peças e pote para montar desenhos de mosaico.</p>
      <SeeAlso items={[{ label: "Pixel art", page: "pixel" }, { label: "Organizadores", page: "organizers" }]} />
      <ToolSessionBar tool={tool} />
      <div className="org-tabbar">
        <div role="tablist" aria-label="Partes do kit" className="org-tabs">
          {TABS.map((t, i) => (
            <button
              key={t.id}
              ref={(el) => void (refs.current[t.id] = el)}
              type="button"
              role="tab"
              id={`mosaic-tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls="mosaic-panel"
              tabIndex={tab === t.id ? 0 : -1}
              onClick={() => setTab(t.id)}
              onKeyDown={(e) => onKeyDown(e, i)}
            >
              <t.icon aria-hidden />
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="tool-layout" role="tabpanel" id="mosaic-panel" aria-labelledby={`mosaic-tab-${tab}`}>
        <div className="controls">
          {tab === "board" && <BoardPanel tool={tool} />}
          {tab === "pieces" && <PiecesPanel tool={tool} platesN={out?.pieces.platesN ?? 0} extra={out?.pieces.extra ?? 0} />}
          {tab === "pot" && <PotPanel tool={tool} />}
          {tab === "design" && <DesignPanel tool={tool} brush={brush} setBrush={setBrush} onPrintParts={printDesignParts} />}
          {tab === "cards" && <CardsPanel tool={tool} />}
          {exportModels.length > 0 && (
            <ExportButtons
              models={printable(exportModels)}
              name={tab === "board" ? "mosaico-tabuleiro" : tab === "pieces" ? "mosaico-pecas" : "mosaico-pote"}
              busy={busy}
              profile={tab === "board" ? MOSAIC_BOARD_PROFILE : tab === "pieces" ? MOSAIC_PIECES_PROFILE : MOSAIC_POT_PROFILE}
              onSaved={tool.exported}
            />
          )}
        </div>
        <div className="preview-col">
          {tab === "design" || tab === "cards" ? (
            <div className="card stack">
              {tab === "design" ? (
                <MosaicEditor grid={s.grid} colors={kitColors(s)} brush={brush} onChange={(g) => tool.set((cur) => ({ ...cur, grid: g }), "grid")} />
              ) : first ? (
                <>
                  <h3>{first.name}</h3>
                  <MosaicEditor readOnly grid={first.grid} colors={kitColors(s)} brush={brush} onChange={() => {}} />
                </>
              ) : (
                <span className="hint">Marque um desenho para ver o cartão.</span>
              )}
            </div>
          ) : (
            <Preview3D models={preview} busy={busy} busyText="Montando o kit…" error={kit.error} emptyText={!valid ? "Corrija os campos em vermelho para ver o kit." : "Montando o kit…"} views />
          )}
          {warnings.map((w) => (
            <Alert key={w} kind="warn">{w}</Alert>
          ))}
          {tab !== "design" && tab !== "cards" && out && !busy && (
            <KitSummary board={board} pieces={pieces} pot={pot} lid={lid} />
          )}
        </div>
      </div>
    </div>
  );
}

