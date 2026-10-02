import { Clock, Cylinder, Package, Store, Zap } from "lucide-react";
import type { ChangeEvent, ReactNode } from "react";
import type { Printer } from "../../domain/entities";
import { parseDecimal } from "../../domain/format";
import type { Settings } from "../../domain/settings";
import MoneyField from "../../ui/MoneyField";
import SmartField from "../../ui/SmartField";
import TimeField from "../../ui/TimeField";
import SlicerImport, { type SlicerApply } from "../SlicerImport";
import Lines from "./Lines";
import PostProcessing from "./PostProcessing";
import type { CalcForm, Line } from "./saved";

type Options = Parameters<typeof Lines>[0]["options"];

type Props = {
  data: { stock: Parameters<typeof SlicerImport>[0]["stock"]; printers: Printer[]; filaments: Options; materials: Options; settings: Settings };
  fil: Line[];
  setFil: (l: Line[]) => void;
  ext: Line[];
  setExt: (l: Line[]) => void;
  f: CalcForm;
  setText: (k: keyof CalcForm) => (v: string) => void;
  set: (k: keyof CalcForm) => (e: ChangeEvent<HTMLInputElement>) => void;
  printerSelect: ReactNode;
  timeField: ReactNode;
  piecesField: ReactNode;
  /** Dica do campo de potência (a da impressora do catálogo, ou exemplos). */
  wattsHint: string;
  onWatts: (v: string) => void;
  onApplySlicer: (a: SlicerApply) => void;
  onStockAdded: () => void;
  onOpenPlug: () => void;
};

/** Modo Completo da calculadora: fatiador, filamentos, impressão e mão de obra, materiais extras e venda. */
export default function FullForm({ data, fil, setFil, ext, setExt, f, setText, set, printerSelect, timeField, piecesField, wattsHint, onWatts, onApplySlicer, onStockAdded, onOpenPlug }: Props) {
  return (
    <>
      <SlicerImport stock={data.stock} printers={data.printers} onApply={onApplySlicer} onStockAdded={onStockAdded} />
      <section className="card">
        <h2 className="card-title">
          <Cylinder aria-hidden /> Filamentos
        </h2>
        <Lines lines={fil} setLines={setFil} options={data.filaments} priceLabel="Preço por kg" qtyLabel="Gramas" addLabel="Adicionar filamento" />
        {/* purga multicor sem o arquivo do fatiador (#147); com o arquivo ela já vem somada nas gramas */}
        <div className="grid two">
          <SmartField label="Trocas de cor" inputMode="decimal" parse={parseDecimal} invalidText="Digite quantas trocas, ex.: 40." value={f.swaps} onChange={setText("swaps")} placeholder="0" hint="Só sem o arquivo do fatiador (importado, a purga já vem nas gramas). Conta: camadas com mais de uma cor × (cores − 1); ex.: 2 cores em 60 camadas ≈ 60 trocas." />
          <SmartField label="Purga por troca (g)" inputMode="decimal" parse={parseDecimal} invalidText="Digite as gramas, ex.: 0,8." value={f.perSwap} onChange={setText("perSwap")} hint="Bambu com AMS (A1, A1 mini, P1S), PLA: cada troca joga fora ~0,3 g de cor clara para escura e ~0,8 g de escura para clara, mais ~0,05 g na torre. 0,8 g é a conta segura." />
        </div>
      </section>
      
      <section className="card">
        <h2 className="card-title">
          <Clock aria-hidden /> Impressão e mão de obra
        </h2>
        <div className="grid">
          {printerSelect}
          <div className="stack" style={{ gap: 4 }}>
            <SmartField
              label="Potência (W)"
              inputMode="decimal"
              parse={parseDecimal}
              invalidText="Digite os watts, ex.: 95."
              value={f.watts}
              hint={wattsHint}
              onChange={onWatts}
            />
            <button type="button" className="link" style={{ justifySelf: "start" }} onClick={onOpenPlug}>
              <Zap aria-hidden size={14} /> Medir com tomada inteligente
            </button>
          </div>
          {timeField}
          <TimeField label="Mão de obra" bare="min" value={f.labor} onChange={setText("labor")} placeholder="15 min" hint="Ex.: 15 (minutos), 1h10" />
          <PostProcessing labor={f.labor} onLabor={setText("labor")} />
          {piecesField}
          <SmartField
            label="kWh medido desta impressão"
            inputMode="decimal"
            parse={parseDecimal}
            invalidText="Digite os kWh, ex.: 0,3."
            value={f.kwh}
            placeholder="Opcional"
            hint="Para quem mede cada peça na tomada: substitui potência × tempo."
            onChange={setText("kwh")}
          />
        </div>
      </section>
      
      <section className="card">
        <h2 className="card-title">
          <Package aria-hidden /> Materiais extras
        </h2>
        <Lines lines={ext} setLines={setExt} options={data.materials} priceLabel="Preço unitário" qtyLabel="Quantidade" addLabel="Adicionar material" />
      </section>
      
      <section className="card">
        <h2 className="card-title">
          <Store aria-hidden /> Venda
        </h2>
        <div className="grid">
          <MoneyField label="Frete absorvido por peça" value={f.freight} onChange={setText("freight")} />
          <label>Margem em marketplace (%)<input inputMode="decimal" placeholder={String(data.settings.marketplaceMarginPct)} value={f.margin} onChange={set("margin")} /></label>
        </div>
      </section>
    </>
  );
}
