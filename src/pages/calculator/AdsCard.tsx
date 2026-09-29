import { Megaphone } from "lucide-react";
import { useState } from "react";
import { adsFor, adsSentence, type AdsInput } from "../../domain/ads";
import type { CalcResult } from "../../domain/calc";
import { money, parseDecimal } from "../../domain/format";
import type { ChannelRow } from "../../domain/pricing";
import type { Settings } from "../../domain/settings";
import MoneyField from "../../ui/MoneyField";
import { parseMoney } from "../../ui/parse";
import Segmented from "../../ui/Segmented";

type Props = {
  r: CalcResult;
  s: Settings;
  rows: ChannelRow[];
  freight: number;
  marginPct: number;
};

const MODES = [
  ["roas", "ROAS esperado"],
  ["cpc", "CPC × cliques"],
] as const;
const pct = (n: number) => `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
const num = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });

/** Anúncios pagos (#29): até que ROAS o anúncio se paga e o preço que mantém a margem pagando o anúncio. */
export default function AdsCard({ r, s, rows, freight, marginPct }: Props) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<AdsInput["mode"]>("roas");
  const [f, setF] = useState({ roas: "5", cpc: "", clicks: "", share: "100" });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const input: AdsInput = {
    mode,
    roas: parseDecimal(f.roas) || 0,
    cpc: parseMoney(f.cpc) || 0,
    clicks: parseDecimal(f.clicks) || 0,
    sharePct: f.share === "" ? 100 : parseDecimal(f.share) || 0,
  };
  const sentence = mode === "roas" ? adsSentence(input.roas) : null;

  return (
    <details className="card" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className="card-title">
        <Megaphone aria-hidden /> Anúncios pagos
      </summary>
      {open && (
        <>
          <p className="hint">Quanto do preço o anúncio pode levar sem virar prejuízo, e o preço que mantém a sua margem pagando o anúncio.</p>
          <div className="stack" style={{ gap: 6, marginBottom: "var(--space-3)" }}>
            <span className="field-label">Como você mede o anúncio</span>
            <Segmented label="Como você mede o anúncio" value={mode} onChange={setMode} options={MODES} />
          </div>
          <div className="grid">
            {mode === "roas" ? (
              <label>
                ROAS esperado
                <input inputMode="decimal" value={f.roas} onChange={set("roas")} />
              </label>
            ) : (
              <>
                <MoneyField label="Custo por clique (CPC)" value={f.cpc} onChange={(v) => setF({ ...f, cpc: v })} />
                <label>
                  Cliques até uma venda
                  <input inputMode="decimal" value={f.clicks} onChange={set("clicks")} />
                </label>
              </>
            )}
            <label>
              Vendas que vêm de anúncio (%)
              <input inputMode="decimal" value={f.share} placeholder="100" onChange={set("share")} />
            </label>
          </div>
          {sentence && <p className="hint">{sentence}</p>}
          <table>
            <thead>
              <tr>
                <th>Canal</th>
                <th className="num" title="Preço ÷ lucro: acima dele o anúncio se paga">
                  ROAS de equilíbrio
                </th>
                <th className="num" title="Lucro ÷ preço: o máximo do preço que pode ir para o anúncio">
                  ACOS máximo
                </th>
                <th className="num">Anúncio por venda</th>
                <th className="num">Lucro com anúncio</th>
                <th className="num">Preço com anúncio</th>
              </tr>
            </thead>
            <tbody>
              {rows
                .filter((c) => c.price !== null)
                .map((c) => {
                  const a = adsFor(c, r, s, freight, input, marginPct);
                  return (
                    <tr key={c.name}>
                      <td>{c.name}</td>
                      <td className="num">{a.breakEvenRoas === null ? "sem lucro" : num(a.breakEvenRoas)}</td>
                      <td className="num">{pct(a.maxAcosPct)}</td>
                      <td className="num">{money(a.adsPerSale)}</td>
                      <td className="num" style={a.profitWithAds < 0 ? { color: "var(--danger)" } : undefined}>
                        {money(a.profitWithAds)} {a.profitWithAds < 0 && <span className="badge">prejuízo</span>}
                      </td>
                      <td className="num">{a.priceWithAds === null ? "com este ROAS não há preço possível" : money(a.priceWithAds)}</td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </>
      )}
    </details>
  );
}
