import { useState } from "react";
import { resetTours, setToursEnabled, toursEnabled } from "../help/tours";
import { modKey } from "./shortcuts";
import Segmented from "./Segmented";
import Toggle from "./Toggle";
import { applyTheme, THEMES, useTheme } from "./theme";
import { applyZoom, storedZoom, ZOOMS, type Zoom } from "./zoom";

/** Aparência: claro/escuro (#152), tamanho do texto do app inteiro (#144). */
export default function AppearanceCard() {
  const [zoom, setZoom] = useState<Zoom>(storedZoom);
  const theme = useTheme();
  const [tips, setTips] = useState(toursEnabled);
  const [tipsReset, setTipsReset] = useState(false);
  const shortcut = `${modKey()}${modKey() === "⌘" ? "⇧" : "+Shift+"}L`;
  return (
    <section className="group">
      <h2 className="group-title">Aparência</h2>
      <div className="rows">
        <div className="row-control">
          <span className="row-label">Tema</span>
          <span className="hint">Automático segue o sistema. Atalho: sol/lua na barra lateral ou {shortcut}.</span>
          <Segmented label="Tema" value={theme} options={THEMES} onChange={(t) => void applyTheme(t, { save: true })} />
        </div>
        <div className="row-control">
          <span className="row-label">Tamanho do texto</span>
          <span className="hint">
            Também com {modKey()} + e {modKey()} −.
          </span>
          <Segmented
            label="Tamanho do texto"
            value={zoom}
            options={ZOOMS}
            onChange={(z) => {
              setZoom(z);
              void applyZoom(z, true);
            }}
          />
        </div>
        <Toggle
          label="Tour guiado na primeira visita de cada tela"
          checked={tips}
          onChange={(on) => {
            setTips(on);
            setToursEnabled(on);
          }}
        />
        <div className="row-control">
          <span className="row-label">Dicas já vistas</span>
          <span className="hint" role="status">
            {tipsReset ? "Pronto: o tour aparece de novo na próxima visita a cada tela." : "Para rever o tour de uma tela, use o ? no canto de cima."}
          </span>
          <button
            type="button"
            onClick={() => {
              resetTours();
              setTips(true);
              setTipsReset(true);
            }}
          >
            Reiniciar dicas
          </button>
        </div>
      </div>
    </section>
  );
}
