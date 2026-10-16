import { useEffect, useState } from "react";
import { getDb } from "../../db";
import { loadSettings, saveSettings } from "../../db/repo";
import { COUPONS, type Coupon, type FitKey, type Fits } from "../../geometry/testKit/catalog";
import { errorText, useToast } from "../../ui/Toast";
import { refreshFits } from "../fitsLoader";

const br = (v: number) => v.toFixed(2).replace(".", ",");

/** Grava (ou apaga, com `null`) a folga validada e entrega às ferramentas. Devolve o que ficou valendo. */
export async function saveFit(key: FitKey, value: number | null): Promise<Fits> {
  const db = await getDb();
  const s = await loadSettings(db);
  const next = { ...s.fits };
  if (value === null) delete next[key];
  else next[key] = value;
  await saveSettings(db, { ...s, fits: next });
  return refreshFits(db);
}

function Row({ c, value, onPick }: { c: Coupon; value: number | undefined; onPick: (n: number | null) => void }) {
  const chosen = value === undefined ? "" : String(c.sweep.indexOf(value) + 1);
  const label = `Peça escolhida: ${c.fitLabel}`;
  return (
    <div className="fit-row">
      <label>
        {label}
        <select value={chosen} onChange={(e) => onPick(e.target.value ? Number(e.target.value) : null)}>
          <option value="">Ainda não testei</option>
          {c.sweep.map((v, i) => (
            <option key={v} value={i + 1}>
              Nº {i + 1} · {br(v)} {c.unit}
            </option>
          ))}
        </select>
      </label>
      <span className="hint">
        {c.title}: {value === undefined ? `vale o padrão de ${br(c.fallback)} ${c.unit}` : `em uso: ${br(value)} ${c.unit} (o padrão era ${br(c.fallback)})`}.{" "}
        {c.appliedIn ? `Já vale em: ${c.appliedIn}.` : `Fica guardado e passa a valer em ${c.tool} quando a ferramenta usar as folgas validadas.`}
      </span>
    </div>
  );
}

/**
 * Lançar o resultado (#247): a pessoa escolhe o número da peça que serviu e a folga correspondente vira o padrão. A escolha fica nas
 * Preferências (entra no backup) e vale já nas ferramentas que leem as folgas validadas; voltar a "Ainda não testei" restaura o padrão.
 */
export default function FitsCard() {
  const [fits, setFits] = useState<Fits | null>(null);
  const toast = useToast();
  useEffect(() => {
    getDb()
      .then(async (db) => setFits((await loadSettings(db)).fits as Fits))
      .catch((e) => toast(`Erro ao ler as folgas validadas: ${errorText(e)}`, "error"));
  }, [toast]);
  if (!fits) return null;

  async function pick(c: Coupon, n: number | null) {
    try {
      const value = n === null ? null : c.sweep[n - 1];
      setFits(await saveFit(c.fitKey, value));
      toast(value === null ? `${c.fitLabel}: voltou ao padrão de ${br(c.fallback)} ${c.unit}.` : `${c.fitLabel}: ${br(value)} ${c.unit} agora é o seu padrão.`);
    } catch (e) {
      toast(`Não foi possível salvar: ${errorText(e)}`, "error");
    }
  }

  return (
    <div className="card stack">
      <h3>Lançar o resultado</h3>
      <span className="hint">Depois de imprimir e experimentar, escolha o número da peça que serviu. A folga dela vira o padrão.</span>
      {COUPONS.map((c) => (
        <Row key={c.id} c={c} value={fits[c.fitKey]} onPick={(n) => void pick(c, n)} />
      ))}
    </div>
  );
}
