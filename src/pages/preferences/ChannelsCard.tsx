import { Plus } from "lucide-react";
import { Fragment } from "react";
import { CHANNEL_PRESETS, newRulesFor, ruleText, staleChannelText, withNewRules } from "../../domain/channels";
import { OTHER_CATEGORY, RULES_DATE } from "../../domain/channelDefaults";
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
  ["feeMinPerItem", "Comissão mínima por item"],
] as const;
/** Campos opcionais do canal: vazio = não se aplica. */
const OPTIONAL = [["extraPerSale", "Custo extra por venda"], ...BANDS] as const;
type OptionalKey = (typeof OPTIONAL)[number][0];
export type TierForm = { from: string; feePct: string; feeFixed: string };
export type CategoryForm = { name: string; feePct: string };
export type ChannelForm = { name: string; feePct: string; feeFixed: string; checkedAt: string; rulesNote: string; tiers: TierForm[]; categories: CategoryForm[]; category: string } & Record<OptionalKey, string>;

const str = (n: number) => String(n).replace(".", ",");
const dateBr = (iso: string) => iso.split("-").reverse().join("/");

export const toChannelForm = (c: Channel): ChannelForm =>
  ({
    name: c.name,
    feePct: str(c.feePct),
    feeFixed: formatMoneyInput(String(c.feeFixed)),
    checkedAt: c.checkedAt ?? "",
    rulesNote: c.rulesNote ?? "",
    categories: (c.categories ?? []).map((x) => ({ name: x.name, feePct: str(x.feePct) })),
    category: c.category ?? "",
    tiers: (c.tiers ?? []).map((t) => ({ from: formatMoneyInput(String(t.from)), feePct: str(t.feePct), feeFixed: formatMoneyInput(String(t.feeFixed)) })),
    ...Object.fromEntries(OPTIONAL.map(([k]) => [k, c[k] === undefined ? "" : formatMoneyInput(String(c[k]))])),
  }) as ChannelForm;

export const fromChannelForm = (c: ChannelForm) => ({
  name: c.name,
  feePct: parseDecimal(c.feePct),
  feeFixed: parseMoney(c.feeFixed),
  ...Object.fromEntries(OPTIONAL.flatMap(([k]) => (c[k].trim() === "" ? [] : [[k, parseMoney(c[k])]]))), // vazio = não se aplica
  ...(c.checkedAt ? { checkedAt: c.checkedAt } : {}),
  ...(c.rulesNote.trim() ? { rulesNote: c.rulesNote.trim() } : {}),
  ...(c.categories.some((x) => x.name.trim()) ? { categories: c.categories.filter((x) => x.name.trim()).map((x) => ({ name: x.name.trim(), feePct: parseDecimal(x.feePct) })) } : {}),
  ...(c.category && c.categories.some((x) => x.name.trim() === c.category) ? { category: c.category } : {}),
  // faixa sem "a partir de" é linha em branco: não entra
  ...(c.tiers.some((t) => t.from.trim()) ? { tiers: c.tiers.filter((t) => t.from.trim()).map((t) => ({ from: parseMoney(t.from), feePct: parseDecimal(t.feePct), feeFixed: parseMoney(t.feeFixed) })) } : {}),
});

type Props = { channels: ChannelForm[]; setChannels: (c: ChannelForm[]) => void; error?: string };

/** Canais de venda com as taxas, faixas de preço, canais prontos e a data da última conferência (#34). */
export default function ChannelsCard({ channels, setChannels, error }: Props) {
  const today = todayIso();
  // mexer numa taxa conta como conferir o canal hoje
  const setChannel = (i: number, k: keyof ChannelForm, v: string) =>
    setChannels(channels.map((c, j) => (j === i ? { ...c, [k]: v, ...(k === "name" ? {} : { checkedAt: today }) } : c)));
  const setTiers = (i: number, tiers: TierForm[]) => setChannels(channels.map((c, j) => (j === i ? { ...c, tiers, checkedAt: today } : c)));
  const keepMine = (i: number) => setChannel(i, "checkedAt", RULES_DATE); // "manter as minhas": conferido, o aviso some
  const adopt = (i: number, fresh: Channel) => setChannels(channels.map((c, j) => (j === i ? toChannelForm(withNewRules(fromChannelForm(c) as Channel, { ...fresh, checkedAt: RULES_DATE })) : c)));
  const setCategories = (i: number, categories: CategoryForm[]) => setChannels(channels.map((c, j) => (j === i ? { ...c, categories, checkedAt: today } : c)));
  /** Escolher "Outra" cria a linha dela (com a comissão do canal) para a pessoa digitar a %. */
  const pickCategory = (i: number, value: string) =>
    setChannels(channels.map((c, j) => (j !== i ? c : { ...c, category: value, checkedAt: today, categories: value === OTHER_CATEGORY && !c.categories.some((x) => x.name === OTHER_CATEGORY) ? [...c.categories, { name: OTHER_CATEGORY, feePct: c.feePct }] : c.categories })));
  const presets = CHANNEL_PRESETS.filter((p) => !channels.some((c) => c.name.trim().toLowerCase() === p.name.toLowerCase()));

  return (
    <section className="group">
    <h2 className="group-title">Canais de venda (taxas)</h2>
    <p className="hint group-note">As taxas dos marketplaces mudam com frequência: confira os valores de cada canal. Custo extra = só naquele canal (embalagem reforçada, etiqueta, brinde).</p>
    <div className="card">
      {channels.map((c, i) => {
        const mine = fromChannelForm(c) as Channel;
        const stale = staleChannelText(mine, today);
        const fresh = newRulesFor(mine);
        return (
          <Fragment key={i}>
            <div className="row line channel-line">
              <label>Canal<input value={c.name} onChange={(e) => setChannel(i, "name", e.target.value)} /></label>
              <label>Comissão (%)<input inputMode="decimal" value={c.feePct} onChange={(e) => setChannel(i, "feePct", e.target.value)} /></label>
              <MoneyField label="Taxa fixa por venda" value={c.feeFixed} onChange={(v) => setChannel(i, "feeFixed", v)} />
              <MoneyField label="Custo extra por venda" value={c.extraPerSale} placeholder="0,00" onChange={(v) => setChannel(i, "extraPerSale", v)} />
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
            {fresh && (
              <div className="rules-news" role="group" aria-label={`Regras novas para ${c.name}`}>
                <p>
                  <b>Há regras novas de 2026 para este canal (de {dateBr(fresh.checkedAt ?? RULES_DATE)}): atualizar?</b>
                </p>
                <p className="hint">Antes (as suas): {ruleText(mine)}</p>
                <p className="hint">Depois (regras de 2026): {ruleText(fresh)}</p>
                <div className="row">
                  <button type="button" className="primary sm" onClick={() => adopt(i, fresh)}>
                    Atualizar {c.name}
                  </button>
                  <button type="button" className="link" onClick={() => keepMine(i)}>
                    Manter as minhas
                  </button>
                </div>
              </div>
            )}
            {c.rulesNote && <p className="hint">{c.rulesNote}</p>}
            {c.categories.length > 0 && (
              <div className="category-pick">
                <label>
                  Categoria do anúncio ({c.name || "canal"})
                  <select value={c.category} onChange={(e) => pickCategory(i, e.target.value)}>
                    <option value="">Sem categoria (comissão do canal)</option>
                    {c.categories.filter((x) => x.name.trim() && x.name.trim() !== OTHER_CATEGORY).map((x) => (
                      <option key={x.name} value={x.name.trim()}>
                        {x.name} — {x.feePct}%
                      </option>
                    ))}
                    <option value={OTHER_CATEGORY}>Outra (digitar %)</option>
                  </select>
                </label>
                {c.category === OTHER_CATEGORY && (
                  <label>
                    Comissão (%) da outra categoria ({c.name || "canal"})
                    <input inputMode="decimal" value={c.categories.find((x) => x.name === OTHER_CATEGORY)?.feePct ?? c.feePct} onChange={(e) => setCategories(i, c.categories.map((x) => (x.name === OTHER_CATEGORY ? { ...x, feePct: e.target.value } : x)))} />
                  </label>
                )}
                <span className="hint">A comissão da categoria vale no lugar da do canal. Confira a sua na central do canal.</span>
              </div>
            )}
            <details style={{ marginBottom: "var(--space-3)" }} open={c.tiers.length > 0}>
              <summary>Faixas de preço e categorias{BANDS.some(([k]) => c[k].trim()) || c.tiers.length > 0 || c.categories.length > 0 ? " (em uso)" : ""}</summary>
              <p className="hint">Taxas por faixa: a comissão e a taxa fixa acima valem até a primeira faixa; a partir do preço de cada linha valem as dela.</p>
              {c.tiers.map((t, k) => (
                <div key={k} className="row line tier-line">
                  <MoneyField label={`A partir de (faixa ${k + 1}, ${c.name || "canal"})`} value={t.from} onChange={(v) => setTiers(i, c.tiers.map((x, j) => (j === k ? { ...x, from: v } : x)))} />
                  <label>Comissão (%) da faixa {k + 1} ({c.name || "canal"})<input inputMode="decimal" value={t.feePct} onChange={(e) => setTiers(i, c.tiers.map((x, j) => (j === k ? { ...x, feePct: e.target.value } : x)))} /></label>
                  <MoneyField label={`Taxa fixa da faixa ${k + 1} (${c.name || "canal"})`} value={t.feeFixed} onChange={(v) => setTiers(i, c.tiers.map((x, j) => (j === k ? { ...x, feeFixed: v } : x)))} />
                  <button type="button" className="link danger" onClick={() => setTiers(i, c.tiers.filter((_, j) => j !== k))}>Remover faixa {k + 1} ({c.name || "canal"})</button>
                </div>
              ))}
              <button type="button" className="sm" onClick={() => setTiers(i, [...c.tiers, { from: "", feePct: c.feePct, feeFixed: c.feeFixed }])}>
                <Plus aria-hidden /> Adicionar faixa de preço ({c.name || "canal"})
              </button>
              <p className="hint">Quando as taxas mudam com o preço: por exemplo, a taxa fixa só vale abaixo de um valor e, acima dele, o frete fica por sua conta. Deixe em branco o que não se aplica.</p>
              <p className="hint">Categorias de comissão: o canal cobra uma % diferente por categoria. Cadastre as suas e escolha a do anúncio acima.</p>
              {c.categories.map((x, k) => (
                <div key={k} className="row line tier-line">
                  <label>Categoria {k + 1} ({c.name || "canal"})<input value={x.name} onChange={(e) => setCategories(i, c.categories.map((y, j) => (j === k ? { ...y, name: e.target.value } : y)))} /></label>
                  <label>Comissão (%) da categoria {k + 1} ({c.name || "canal"})<input inputMode="decimal" value={x.feePct} onChange={(e) => setCategories(i, c.categories.map((y, j) => (j === k ? { ...y, feePct: e.target.value } : y)))} /></label>
                  <button type="button" className="link danger" onClick={() => setCategories(i, c.categories.filter((_, j) => j !== k))}>Remover categoria {k + 1} ({c.name || "canal"})</button>
                </div>
              ))}
              <button type="button" className="sm" onClick={() => setCategories(i, [...c.categories, { name: "", feePct: c.feePct }])}>
                <Plus aria-hidden /> Adicionar categoria de comissão ({c.name || "canal"})
              </button>
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
    </section>
  );
}
