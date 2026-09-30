import { Copy, Download, Link, QrCode as QrIcon, Type, Wifi, Zap } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { getDb } from "../db";
import { loadCompany } from "../db/customersRepo";
import { qrMatrix, qrSvg } from "../domain/qr";
import { getManifold } from "../geometry/manifold";
import { QR_BASE_COLOR, QR_DARK_COLOR, qrModel } from "../geometry/qr3d";
import Alert from "../ui/Alert";
import ExportButtons from "../ui/ExportButtons";
import { DEFAULT_PROFILE } from "../geometry/printProfile";
import Field from "../ui/Field";
import MoneyField from "../ui/MoneyField";
import NumField, { inRange } from "../ui/NumField";
import Preview3D from "../ui/Preview3D";
import { saveFile, slug } from "../ui/saveFile";
import Segmented from "../ui/Segmented";
import { errorText, useToast } from "../ui/Toast";
import { useModelBuilder } from "../ui/useModelBuilder";
import { EMPTY_QR_FORM, qrContent, type QrForm, type QrMode } from "./qrContent";

const MODES = [
  ["pix", "Pix"],
  ["link", "Link"],
  ["wifi", "Wi-Fi"],
  ["text", "Texto"],
] as const;
const ICONS = { pix: Zap, link: Link, wifi: Wifi, text: Type };
const LIMITS = { size: [15, 200], base: [0.8, 8], relief: [0.4, 4], quiet: [1, 6], corner: [0, 20] } as const;

/** QR Code de Pix, link, Wi-Fi ou texto: SVG para imprimir no papel e 3MF em 2 cores para imprimir em 3D. */
export default function QrCode() {
  const [mode, setMode] = useState<QrMode>("pix");
  const [form, setForm] = useState<QrForm>(EMPTY_QR_FORM);
  const [view, setView] = useState<"2d" | "3d">("2d");
  const [p, setP] = useState({ size: 50, base: 2, relief: 1, quiet: 2, corner: 3 });
  const [colors, setColors] = useState([QR_BASE_COLOR, QR_DARK_COLOR]);
  const toast = useToast();

  // Pix já vem com os dados da empresa (Preferências → Dados da empresa).
  useEffect(() => {
    getDb()
      .then(loadCompany)
      .then((c) => setForm((f) => ({ ...f, pix: { ...f.pix, key: c.pixKey, name: c.pixName || c.tradeName || c.name, city: c.pixCity || c.city } })))
      .catch((e) => console.warn("Sem dados da empresa para o Pix:", e));
  }, []);

  const { text, error } = qrContent(mode, form);
  const valid = (Object.keys(LIMITS) as (keyof typeof LIMITS)[]).every((k) => inRange(p[k], LIMITS[k][0], LIMITS[k][1]));
  const svgUrl = useMemo(() => (text ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qrSvg(text, p.size))}` : null), [text, p.size]);
  const name = mode === "pix" ? "pix" : mode === "wifi" ? `wifi-${slug(form.wifi.ssid)}` : "qr-code";

  const { models, warnings, busy, error: buildError } = useModelBuilder(async () => {
    if (!text || !valid) return null;
    const M = await getManifold();
    const r = qrModel(M, qrMatrix(text), { sizeMm: p.size, baseMm: p.base, reliefMm: p.relief, quiet: p.quiet, cornerMm: p.corner, baseColor: colors[0], qrColor: colors[1] }, "QR Code");
    return { models: [r.model], warnings: r.warnings };
  }, [text, valid, p, colors]);

  const setPix = (k: keyof QrForm["pix"]) => (v: string) => setForm((f) => ({ ...f, pix: { ...f.pix, [k]: v } }));
  const setWifi = (patch: Partial<QrForm["wifi"]>) => setForm((f) => ({ ...f, wifi: { ...f.wifi, ...patch } }));
  const setNum = (k: keyof typeof p) => (v: number) => setP((o) => ({ ...o, [k]: v }));

  async function saveSvg() {
    if (!text) return;
    try {
      const path = await saveFile(`${name}.svg`, qrSvg(text, p.size), "svg", "SVG");
      if (path) toast(`SVG salvo em ${path}`);
    } catch (e) {
      toast(`Não foi possível salvar: ${errorText(e)}`, "error");
    }
  }

  async function copyPix() {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      toast("Pix copia e cola copiado.");
    } catch (e) {
      toast(`Não consegui copiar: ${errorText(e)}`, "error");
    }
  }

  const Icon = ICONS[mode];
  return (
    <div className="page">
      <h1>QR Code e Pix</h1>
      <p className="lead">Pix com valor, link, Wi-Fi ou texto. Salve em SVG para o papel ou em 3MF de 2 cores: placa clara com o código em relevo.</p>
      <div className="tool-layout">
        <div className="controls">
          <div className="card stack">
            <h3>Conteúdo</h3>
            <Segmented label="Tipo de QR" value={mode} onChange={setMode} options={MODES} full />
            {mode === "pix" && (
              <>
                <Field label="Chave Pix" hint="CPF, CNPJ, telefone com DDD, e-mail ou chave aleatória.">
                  <input value={form.pix.key} onChange={(e) => setPix("key")(e.target.value)} autoComplete="off" spellCheck={false} />
                </Field>
                <div className="grid two">
                  <Field label="Nome de quem recebe">
                    <input value={form.pix.name} maxLength={60} onChange={(e) => setPix("name")(e.target.value)} />
                  </Field>
                  <Field label="Cidade">
                    <input value={form.pix.city} maxLength={40} onChange={(e) => setPix("city")(e.target.value)} />
                  </Field>
                  <MoneyField label="Valor (opcional)" value={form.pix.amount} onChange={setPix("amount")} hint="Vazio: quem paga digita." />
                  <Field label="Identificador (opcional)" hint="Ex.: número do pedido.">
                    <input value={form.pix.txid} maxLength={25} onChange={(e) => setPix("txid")(e.target.value.replace(/[^A-Za-z0-9]/g, ""))} />
                  </Field>
                </div>
              </>
            )}
            {mode === "link" && (
              <Field label="Link" hint="Instagram, loja, cardápio, WhatsApp (wa.me/55…).">
                <input value={form.link} inputMode="url" placeholder="instagram.com/sualoja" onChange={(e) => setForm({ ...form, link: e.target.value })} />
              </Field>
            )}
            {mode === "wifi" && (
              <>
                <Field label="Nome da rede">
                  <input value={form.wifi.ssid} onChange={(e) => setWifi({ ssid: e.target.value })} autoComplete="off" />
                </Field>
                <Segmented
                  label="Segurança"
                  value={form.wifi.security}
                  onChange={(security) => setWifi({ security })}
                  options={[
                    ["WPA", "WPA/WPA2"],
                    ["WEP", "WEP"],
                    ["nopass", "Aberta"],
                  ]}
                />
                {form.wifi.security !== "nopass" && (
                  <Field label="Senha">
                    <input value={form.wifi.password} onChange={(e) => setWifi({ password: e.target.value })} autoComplete="off" spellCheck={false} />
                  </Field>
                )}
              </>
            )}
            {mode === "text" && (
              <Field label="Texto">
                <textarea value={form.text} maxLength={1000} onChange={(e) => setForm({ ...form, text: e.target.value })} placeholder="Obrigada pela compra! 💛" />
              </Field>
            )}
            {error && <Alert kind="info">{error}</Alert>}
          </div>

          <div className="card stack">
            <h3>Peça 3D</h3>
            <div className="grid two">
              <NumField label="Lado" value={p.size} onChange={setNum("size")} min={LIMITS.size[0]} max={LIMITS.size[1]} step={1} />
              <NumField label="Cantos" value={p.corner} onChange={setNum("corner")} min={LIMITS.corner[0]} max={LIMITS.corner[1]} step={0.5} />
              <NumField label="Base" value={p.base} onChange={setNum("base")} min={LIMITS.base[0]} max={LIMITS.base[1]} />
              <NumField label="Relevo do código" value={p.relief} onChange={setNum("relief")} min={LIMITS.relief[0]} max={LIMITS.relief[1]} />
              <NumField label="Margem" unit="módulos" value={p.quiet} onChange={setNum("quiet")} min={LIMITS.quiet[0]} max={LIMITS.quiet[1]} step={1} hint="2 lê bem em peça impressa." />
            </div>
            <div className="row">
              <label>
                Cor da base
                <input type="color" value={colors[0]} onChange={(e) => setColors([e.target.value, colors[1]])} />
              </label>
              <label>
                Cor do código
                <input type="color" value={colors[1]} onChange={(e) => setColors([colors[0], e.target.value])} />
              </label>
            </div>
            <span className="hint">Código escuro sobre base clara: é o que a câmera do celular lê melhor.</span>
          </div>

          <div className="card stack">
            <button className="action" disabled={!text} onClick={saveSvg}>
              <Download aria-hidden /> Salvar SVG (papel, adesivo, laser)
            </button>
            {mode === "pix" && (
              <button disabled={!text} onClick={copyPix}>
                <Copy aria-hidden /> Copiar Pix copia e cola
              </button>
            )}
          </div>
          <ExportButtons models={models} name={name} busy={busy} profile={DEFAULT_PROFILE} />
        </div>

        <div className="preview-col">
          <Segmented
            label="Prévia"
            value={view}
            onChange={setView}
            options={[
              ["2d", "Imagem"],
              ["3d", "3D"],
            ]}
          />
          {view === "2d" ? (
            <div className="viewer qr-preview" role="img" aria-label="Prévia do QR Code">
              {svgUrl ? (
                <img src={svgUrl} alt="" />
              ) : (
                <div className="overlay">
                  <div className="inner">
                    <QrIcon aria-hidden />
                    <span>Preencha o conteúdo para ver o QR Code.</span>
                  </div>
                </div>
              )}
              {text && (
                <div className="hud">
                  <Icon aria-hidden /> {MODES.find(([m]) => m === mode)![1]} · {text.length} caracteres
                </div>
              )}
            </div>
          ) : (
            <Preview3D models={models} busy={busy} error={buildError} emptyText="Preencha o conteúdo para ver a peça." />
          )}
          {warnings.map((w) => (
            <Alert key={w} kind="warn">
              {w}
            </Alert>
          ))}
          {mode === "pix" && text && <Alert kind="info">Teste o Pix no app do banco antes de imprimir: abra “Pagar com QR Code” e confira nome e valor.</Alert>}
        </div>
      </div>
    </div>
  );
}
