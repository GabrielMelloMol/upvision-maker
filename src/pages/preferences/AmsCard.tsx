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

  /** Grava na hora, como nos Ajustes do sistema (#165); só avisa se der erro. */
  async function save(next: Ams) {
    setAms(next);
    try {
      const db = await getDb();
      await saveSettings(db, { ...(await loadSettings(db)), ams: { ...next, filaments: next.filaments.slice(0, next.slots) } });
    } catch (e) {
      toast(`Não foi possível salvar o AMS: ${errorText(e)}`, "error");
    }
  }
  const setSlot = (i: number, id: number | null) => void save({ ...ams, filaments: Array.from({ length: ams.slots }, (_, j) => (j === i ? id : (ams.filaments[j] ?? null))) });

  return (
    <section className="group" aria-labelledby="ams-title">
      <h2 className="group-title" id="ams-title">
        Meu AMS
      </h2>
      <div className="rows">
        <div className="row-control">
          <span className="row-label">Slots</span>
          <span className="hint">Quantos filamentos o seu AMS carrega.</span>
          <Segmented label="Slots" value={String(ams.slots)} options={SLOT_OPTIONS} onChange={(v) => void save({ ...ams, slots: Number(v) as Ams["slots"] })} />
        </div>
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
      <p className="hint group-note">
        {list.length
          ? "Os filamentos carregados aparecem primeiro nos seletores de cor, e o 3MF já sai com cada cor no slot certo."
          : "Cadastre seus filamentos em Filamentos para escolher o de cada slot."}
      </p>
    </section>
  );
}
