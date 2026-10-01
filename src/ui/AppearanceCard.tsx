import { useState } from "react";
import { modKey } from "./shortcuts";
import Segmented from "./Segmented";
import { applyTheme, THEMES, useTheme } from "./theme";
import { applyZoom, storedZoom, ZOOMS, type Zoom } from "./zoom";

/** Aparência: claro/escuro (#152) e tamanho do texto do app inteiro (#144). */
export default function AppearanceCard() {
  const [zoom, setZoom] = useState<Zoom>(storedZoom);
  const theme = useTheme();
  return (
    <>
    <section className="card stack">
      <h3>Tema</h3>
      <Segmented label="Tema" value={theme} options={THEMES} onChange={(t) => void applyTheme(t, { save: true, fade: true })} />
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
    </>
  );
}
