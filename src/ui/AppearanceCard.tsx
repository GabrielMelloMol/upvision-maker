import { useState } from "react";
import { modKey } from "./shortcuts";
import Segmented from "./Segmented";
import { applyZoom, storedZoom, ZOOMS, type Zoom } from "./zoom";

/** Aparência (#144): tamanho do texto do app inteiro. O tema claro/escuro segue o sistema (HIG). */
export default function AppearanceCard() {
  const [zoom, setZoom] = useState<Zoom>(storedZoom);
  return (
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
        Aumenta tudo, sem quebrar as telas. Também dá para usar {modKey()} + e {modKey()} −. Claro e escuro seguem o sistema.
      </span>
    </section>
  );
}
