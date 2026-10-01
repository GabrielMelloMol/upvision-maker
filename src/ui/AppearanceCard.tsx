import { useState } from "react";
import { resetTours, setToursEnabled, toursEnabled } from "../help/tours";
import { modKey } from "./shortcuts";
import Segmented from "./Segmented";
import Toggle from "./Toggle";
import { saveSplashMode, SPLASH_MODES, storedSplashMode, type SplashMode } from "./splashMode";
import { applyTheme, THEMES, useTheme } from "./theme";
import { applyZoom, storedZoom, ZOOMS, type Zoom } from "./zoom";

/** Aparência: claro/escuro (#152), tamanho do texto do app inteiro (#144) e animação de abertura (#153). */
export default function AppearanceCard() {
  const [zoom, setZoom] = useState<Zoom>(storedZoom);
  const theme = useTheme();
  const [splash, setSplash] = useState<SplashMode>(storedSplashMode);
  const [tips, setTips] = useState(toursEnabled);
  const [tipsReset, setTipsReset] = useState(false);
  return (
    <>
    <section className="card stack">
      <h3>Tema</h3>
      <Segmented label="Tema" value={theme} options={THEMES} onChange={(t) => void applyTheme(t, { save: true })} />
      <span className="hint">
        Automático segue o sistema. Também dá para trocar pelo sol/lua embaixo da barra lateral ou com {modKey()}
        {modKey() === "⌘" ? "⇧" : "+Shift+"}L.
      </span>
    </section>
    <section className="card stack">
      <h3>Tamanho do texto</h3>
      <Segmented
        label="Tamanho do texto"
        value={zoom}
        options={ZOOMS}
        onChange={(z) => {
          setZoom(z);
          void applyZoom(z, true);
        }}
      />
      <span className="hint">
        Aumenta tudo, sem quebrar as telas. Também dá para usar {modKey()} + e {modKey()} −.
      </span>
    </section>
    <section className="card stack">
      <h3>Animação de abertura</h3>
      <Segmented
        label="Animação de abertura"
        value={splash}
        options={SPLASH_MODES}
        onChange={(m) => {
          setSplash(m);
          saveSplashMode(m);
        }}
      />
      <span className="hint">Completa: uns 3 segundos, toda vez que o app abre. Um clique ou qualquer tecla pulam. Vale a partir da próxima abertura.</span>
    </section>
    <section className="card stack">
      <h3>Dicas</h3>
      <Toggle
        label="Tour guiado na primeira visita de cada tela"
        checked={tips}
        onChange={(on) => {
          setTips(on);
          setToursEnabled(on);
        }}
      />
      <div className="row">
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
        {tipsReset && (
          <span className="hint" role="status">
            Pronto: o tour aparece de novo na próxima visita a cada tela.
          </span>
        )}
      </div>
      <span className="hint">Para rever o tour de uma tela, use o ? no canto de cima.</span>
    </section>
    </>
  );
}
