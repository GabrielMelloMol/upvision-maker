import { useEffect, useState } from "react";
import { getDb } from "../../db";
import { loadSettings, saveSettings } from "../../db/repo";
import { SLICER_IDS, type SlicerId } from "../../domain/settings";
import { listSlicers, pickSlicer, SLICER_DOWNLOADS, type InstalledSlicer } from "../../slicer/openInSlicer";
import Field from "../../ui/Field";
import { errorText, useToast } from "../../ui/Toast";

/** Fatiador do "Abrir no…" nas ferramentas (#160): automático (o primeiro instalado) ou um escolhido. */
export default function SlicerCard() {
  const [installed, setInstalled] = useState<InstalledSlicer[] | null>(null);
  const [choice, setChoice] = useState<SlicerId | null>(null);
  const toast = useToast();

  useEffect(() => {
    Promise.all([listSlicers(), getDb().then(loadSettings)])
      .then(([list, s]) => {
        setInstalled(list);
        setChoice(s.slicer);
      })
      .catch((e) => toast(`Erro ao ler o fatiador: ${errorText(e)}`, "error"));
  }, [toast]);

  if (!installed) return null;
  const auto = pickSlicer(installed, null);

  async function change(v: SlicerId | null) {
    setChoice(v);
    try {
      const db = await getDb();
      await saveSettings(db, { ...(await loadSettings(db)), slicer: v });
      toast("Fatiador salvo.");
    } catch (e) {
      toast(`Não foi possível salvar: ${errorText(e)}`, "error");
    }
  }

  return (
    <section className="card stack" aria-label="Fatiador">
      <h3>Fatiador</h3>
      <p className="muted">O botão "Abrir no…" das ferramentas salva o arquivo e abre direto nele. No Bambu Studio, abre como projeto, com a impressora e o AMS.</p>
      {installed.length ? (
        <Field label="Abrir no">
          <select value={choice ?? ""} onChange={(e) => void change((e.target.value || null) as SlicerId | null)}>
            <option value="">Automático{auto ? ` (${auto.name})` : ""}</option>
            {SLICER_IDS.filter((id) => installed.some((s) => s.id === id)).map((id) => (
              <option key={id} value={id}>
                {SLICER_DOWNLOADS[id].name}
              </option>
            ))}
          </select>
        </Field>
      ) : (
        <span className="hint">Nenhum fatiador encontrado neste computador. Instale o Bambu Studio, o OrcaSlicer ou o PrusaSlicer.</span>
      )}
    </section>
  );
}
