import { FileSpreadsheet } from "lucide-react";
import { useState } from "react";
import { parseDecimal } from "../../domain/format";
import { MARKETPLACES, type Marketplace } from "../../domain/marketplace/columns";
import { listingFile, listingRows } from "../../domain/marketplace/listing";
import { todayIso } from "../../domain/orders";
import { PRICE_NAMES } from "../../domain/pricing";
import type { Product } from "../../domain/products";
import Alert from "../../ui/Alert";
import Dropzone from "../../ui/Dropzone";
import { join } from "@tauri-apps/api/path";
import { open } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import Segmented from "../../ui/Segmented";
import Sheet from "../../ui/Sheet";
import { errorText, useToast } from "../../ui/Toast";
import type { ProductsData } from "./data";
import { savePhotosIn } from "./listingPhotos";

const MARKETS = (Object.keys(MARKETPLACES) as Marketplace[]).map((m) => [m, MARKETPLACES[m].label] as const);
const KEY = "upvision:exportar-marketplace";
type Remembered = { categoryId: string; packagingG: string; length: string; width: string; height: string };
const DEFAULTS: Remembered = { categoryId: "", packagingG: "30", length: "20", width: "15", height: "10" };

function remembered(): Remembered {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
  } catch {
    return DEFAULTS;
  }
}

type Props = { products: Product[]; data: ProductsData; onClose: () => void };

/** Exportar os produtos escolhidos para a planilha de upload em massa da Shopee ou do Mercado Livre (#78). */
export default function ExportSheet({ products, data, onClose }: Props) {
  const channels = [PRICE_NAMES.consumer.name, PRICE_NAMES.resale.name, ...data.settings.channels.map((c) => c.name)];
  const pickChannel = (m: Marketplace) => channels.find((c) => c.startsWith(MARKETPLACES[m].defaultChannel)) ?? channels[0];
  const [market, setMarket] = useState<Marketplace>("shopee");
  const [channel, setChannel] = useState(() => pickChannel("shopee"));
  const [f, setF] = useState(remembered);
  const [template, setTemplate] = useState<{ name: string; bytes: Uint8Array } | null>(null);
  const toast = useToast();
  const set = (k: keyof Remembered) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const num = (s: string, d: number) => (Number.isFinite(parseDecimal(s)) ? parseDecimal(s) : d);

  const rows = listingRows(products, data, {
    marketplace: market,
    channel,
    categoryId: f.categoryId,
    packagingG: num(f.packagingG, 0),
    box: { length: num(f.length, 20), width: num(f.width, 15), height: num(f.height, 10) },
  });
  const gaps = new Map<string, number>();
  for (const r of rows) for (const m of r.missing) gaps.set(m, (gaps.get(m) ?? 0) + 1);

  async function exportFile() {
    try {
      const { bytes, note } = listingFile(rows, market, template?.bytes);
      // a pasta inteira, não "Salvar como": as fotos vão ao lado da planilha e só a pasta escolhida libera isso (A12)
      const dir = await open({ directory: true, multiple: false, title: "Pasta para a planilha e as fotos" });
      if (typeof dir !== "string") return;
      const path = await join(dir, `${market}-upload-em-massa-${todayIso()}.xlsx`);
      await writeFile(path, bytes);
      try {
        localStorage.setItem(KEY, JSON.stringify(f));
      } catch {
        // só não lembra da próxima vez
      }
      const saved = await savePhotosIn(dir, products);
      toast(`Planilha salva em ${path}. ${note}${saved ? ` ${saved} ${saved === 1 ? "foto salva" : "fotos salvas"} na mesma pasta.` : ""}`);
      onClose();
    } catch (e) {
      toast(errorText(e), "error");
    }
  }

  return (
    <Sheet
      title="Exportar para marketplace"
      icon={FileSpreadsheet}
      onClose={onClose}
      wide
      footer={
        <>
          <button type="button" onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className="primary" onClick={exportFile}>
            Salvar planilha
          </button>
        </>
      }
    >
      <Segmented
        label="Marketplace"
        value={market}
        options={MARKETS}
        onChange={(m) => {
          setMarket(m);
          setChannel(pickChannel(m));
        }}
      />
      <div className="grid">
        <label>
          Preço do canal
          <select value={channel} onChange={(e) => setChannel(e.target.value)}>
            {channels.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        {MARKETPLACES[market].columns.category && (
          <label>
            Categoria (ID)
            <input inputMode="numeric" value={f.categoryId} onChange={set("categoryId")} placeholder="Ex.: 101152" />
            <span className="hint">Na árvore de categorias do Seller Center.</span>
          </label>
        )}
        <label>
          Embalagem (g)
          <input inputMode="decimal" value={f.packagingG} onChange={set("packagingG")} />
          <span className="hint">Somada ao filamento quando o produto não tem peso embalado.</span>
        </label>
        <label>
          Caixa padrão: comprimento (cm)
          <input inputMode="decimal" value={f.length} onChange={set("length")} />
        </label>
        <label>
          Caixa padrão: largura (cm)
          <input inputMode="decimal" value={f.width} onChange={set("width")} />
        </label>
        <label>
          Caixa padrão: altura (cm)
          <input inputMode="decimal" value={f.height} onChange={set("height")} />
        </label>
      </div>
      <Dropzone
        accept=".xlsx"
        label={template ? template.name : "Modelo baixado do marketplace (.xlsx, recomendado)"}
        hint={market === "shopee" ? "Seller Center → Upload em massa → baixar modelo" : "Anunciar em massa → baixar a planilha da categoria"}
        onFile={async (file) => setTemplate({ name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) })}
      />
      {!template && <p className="hint">Sem o modelo sai uma planilha simples com as mesmas colunas, para copiar e colar no modelo.</p>}
      <p aria-live="polite">
        <b>
          {products.length} {products.length === 1 ? "produto" : "produtos"}
        </b>
        {rows.length !== products.length && ` em ${rows.length} linhas (uma por variação)`}
        {gaps.size > 0 ? ` · faltando: ${[...gaps].map(([k, n]) => `${k} (${n})`).join(", ")}` : " · tudo preenchido"}
      </p>
      <Alert kind="info">A planilha só aceita fotos por link: as fotos dos produtos são salvas na mesma pasta, com o SKU no nome do arquivo, para enviar pelo Seller Center depois de subir a planilha.</Alert>
    </Sheet>
  );
}
