import { useEffect, useState } from "react";
import { getDb } from "../../db";
import { filaments as filamentsRepo, loadSettings, saveSettings } from "../../db/repo";
import type { Filament } from "../../domain/entities";
import { AMS_SLOT_OPTIONS, type Ams } from "../../domain/settings";
import { amsSlots } from "../../tools/amsSlots";
import Field from "../../ui/Field";
import Segmented from "../../ui/Segmented";
import { errorText, useToast } from "../../ui/Toast";

const SLOT_OPTIONS = AMS_SLOT_OPTIONS.map((n) => [String(n), `${n} slots`] as [string, string]);

/** Meu AMS (#98): quantos slots e qual filamento cadastrado está em cada um. As ferramentas oferecem essas cores primeiro. */
export default function AmsCard() {
  const [ams, setAms] = useState<Ams | null>(null);
  const [list, setList] = useState<Filament[]>([]);
  const toast = useToast();

  useEffect(() => {
    getDb()
      .then(async (db) => {
        const [s, f] = await Promise.all([loadSettings(db), filamentsRepo.list(db)]);
        setList(f);
        // id de filamento excluído vira slot vazio
        setAms({ ...s.ams, filaments: amsSlots(s.ams, f).map((x) => x.filament?.id ?? null) });
      })
      .catch((e) => toast(`Erro ao ler o AMS: ${errorText(e)}`, "error"));
  }, [toast]);

  if (!ams) return null;
  const setSlot = (i: number, id: number | null) => setAms((a) => a && { ...a, filaments: Array.from({ length: a.slots }, (_, j) => (j === i ? id : (a.filaments[j] ?? null))) });

  async function save() {
    if (!ams) return;
    try {
      const db = await getDb();
      await saveSettings(db, { ...(await loadSettings(db)), ams: { ...ams, filaments: ams.filaments.slice(0, ams.slots) } });
      toast("AMS salvo.");
    } catch (e) {
      toast(`Não foi possível salvar: ${errorText(e)}`, "error");
    }
  }

  return (
    <section className="card stack" aria-label="Meu AMS">
      <h3>Meu AMS</h3>
      <p className="muted">Os filamentos carregados aparecem primeiro nos seletores de cor, e o 3MF já sai com cada cor no slot certo.</p>
      <div>
        <span className="field-label">Slots</span>
        <Segmented label="Slots" value={String(ams.slots)} options={SLOT_OPTIONS} onChange={(v) => setAms({ ...ams, slots: Number(v) as Ams["slots"] })} />
      </div>
      {!list.length && <span className="hint">Cadastre seus filamentos em Filamentos para escolher o de cada slot.</span>}
      <div className="grid two">
        {Array.from({ length: ams.slots }, (_, i) => (
          <Field key={i} label={`Slot ${i + 1}`}>
            <select value={ams.filaments[i] ?? ""} onChange={(e) => setSlot(i, e.target.value ? Number(e.target.value) : null)}>
              <option value="">Vazio</option>
              {list.map((f) => (
                <option key={f.id} value={f.id}>
                  {[f.material, f.color, f.brand && `(${f.brand})`].filter(Boolean).join(" ")}
                </option>
              ))}
            </select>
          </Field>
        ))}
      </div>
      <button type="button" className="primary" onClick={() => void save()}>
        Salvar AMS
      </button>
    </section>
  );
}
