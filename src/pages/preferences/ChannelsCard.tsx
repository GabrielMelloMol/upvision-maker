import { Plus, Store } from "lucide-react";
import { Fragment } from "react";
import { CHANNEL_PRESETS, staleChannelText } from "../../domain/channels";
import { parseDecimal } from "../../domain/format";
import { todayIso } from "../../domain/orders";
import type { Channel } from "../../domain/settings";
import MoneyField from "../../ui/MoneyField";
import { formatMoneyInput, parseMoney } from "../../ui/parse";

/** Faixas de preço opcionais de cada canal (#31). */
const BANDS = [
  ["fixedBelow", "Taxa fixa só abaixo de"],
  ["feeCapPerItem", "Teto da comissão por item"],
  ["freeShippingAbove", "Frete por sua conta a partir de"],
  ["shippingCost", "Custo desse frete"],
] as const;
/** Campos opcionais do canal: vazio = não se aplica. */
const OPTIONAL = [["extraPerSale", "Custo extra por venda"], ...BANDS] as const;
type OptionalKey = (typeof OPTIONAL)[number][0];
export type ChannelForm = { name: string; feePct: string; feeFixed: string; checkedAt: string } & Record<OptionalKey, string>;

const str = (n: number) => String(n).replace(".", ",");
const dateBr = (iso: string) => iso.split("-").reverse().join("/");

export const toChannelForm = (c: Channel): ChannelForm =>
  ({
    name: c.name,
    feePct: str(c.feePct),
    feeFixed: formatMoneyInput(String(c.feeFixed)),
    checkedAt: c.checkedAt ?? "",
    ...Object.fromEntries(OPTIONAL.map(([k]) => [k, c[k] === undefined ? "" : formatMoneyInput(String(c[k]))])),
  }) as ChannelForm;

export const fromChannelForm = (c: ChannelForm) => ({
  name: c.name,
  feePct: parseDecimal(c.feePct),
  feeFixed: parseMoney(c.feeFixed),
  ...Object.fromEntries(OPTIONAL.flatMap(([k]) => (c[k].trim() === "" ? [] : [[k, parseMoney(c[k])]]))), // vazio = não se aplica
  ...(c.checkedAt ? { checkedAt: c.checkedAt } : {}),
});

type Props = { channels: ChannelForm[]; setChannels: (c: ChannelForm[]) => void; error?: string };

/** Canais de venda com as taxas, faixas de preço, canais prontos e a data da última conferência (#34). */
export default function ChannelsCard({ channels, setChannels, error }: Props) {
  const today = todayIso();
  // mexer numa taxa conta como conferir o canal hoje
  const setChannel = (i: number, k: keyof ChannelForm, v: string) =>
    setChannels(channels.map((c, j) => (j === i ? { ...c, [k]: v, ...(k === "name" ? {} : { checkedAt: today }) } : c)));
  const presets = CHANNEL_PRESETS.filter((p) => !channels.some((c) => c.name.trim().toLowerCase() === p.name.toLowerCase()));

  return (
    <div className="card">
      <h2 className="card-title">
        <Store aria-hidden /> Canais de venda (taxas)
      </h2>
      <p className="hint" style={{ marginTop: -8, marginBottom: 16 }}>As taxas dos marketplaces mudam com frequência. Confira os valores atuais de cada canal.</p>
      {channels.map((c, i) => {
        const stale = staleChannelText(fromChannelForm(c) as Channel, today);
        return (
          <Fragment key={i}>
            <div className="row line">
              <label>Canal<input value={c.name} onChange={(e) => setChannel(i, "name", e.target.value)} /></label>
              <label>Comissão (%)<input inputMode="decimal" value={c.feePct} onChange={(e) => setChannel(i, "feePct", e.target.value)} /></label>
              <MoneyField label="Taxa fixa por venda" value={c.feeFixed} onChange={(v) => setChannel(i, "feeFixed", v)} />
              <MoneyField label="Custo extra por venda" value={c.extraPerSale} placeholder="0,00" hint="Só neste canal: embalagem reforçada, etiqueta, brinde." onChange={(v) => setChannel(i, "extraPerSale", v)} />
              <button type="button" className="link danger" onClick={() => setChannels(channels.filter((_, j) => j !== i))}>Remover</button>
            </div>
            <p className="hint">
              {stale ? <span className="badge warn">{stale}</span> : c.checkedAt ? `Conferido em ${dateBr(c.checkedAt)}.` : "Taxas ainda não conferidas por você."}{" "}
              {c.checkedAt !== today && (
                <button type="button" className="link" onClick={() => setChannel(i, "checkedAt", today)}>
                  Conferi hoje ({c.name || "canal"})
                </button>
              )}
            </p>
            <details style={{ marginBottom: "var(--space-3)" }}>
              <summary>Faixas de preço{BANDS.some(([k]) => c[k].trim()) ? " (em uso)" : ""}</summary>
              <p className="hint">Quando as taxas mudam com o preço: por exemplo, a taxa fixa só vale abaixo de um valor e, acima dele, o frete fica por sua conta. Deixe em branco o que não se aplica.</p>
              <div className="grid">
                {BANDS.map(([k, label]) => (
                  <MoneyField key={k} label={`${label} (${c.name || "canal"})`} value={c[k]} placeholder="—" onChange={(v) => setChannel(i, k, v)} />
                ))}
              </div>
            </details>
          </Fragment>
        );
      })}
      <div className="row" style={{ flexWrap: "wrap", gap: "var(--space-3)" }}>
        <button type="button" className="sm" onClick={() => setChannels([...channels, toChannelForm({ name: "", feePct: 0, feeFixed: 0 })])}>
          <Plus aria-hidden /> Adicionar canal
        </button>
        {presets.length > 0 && (
          <label>
            Adicionar canal pronto
            <select
              value=""
              onChange={(e) => {
                const p = presets.find((x) => x.name === e.target.value);
                if (p) setChannels([...channels, toChannelForm(p)]);
              }}
            >
              <option value="">Escolha…</option>
              {presets.map((p) => (
                <option key={p.name}>{p.name}</option>
              ))}
            </select>
          </label>
        )}
      </div>
      {presets.length > 0 && <p className="hint">Os canais prontos são um ponto de partida: confira as taxas no site de cada um.</p>}
      {error && <p className="error">Confira os canais: nome obrigatório e comissão entre 0 e 100%.</p>}
    </div>
  );
}
