import { Building2, ImagePlus } from "lucide-react";
import { useState } from "react";
import { getDb } from "../db";
import { loadCompany, saveCompany } from "../db/customersRepo";
import { CompanyInput, type Company } from "../domain/customers";
import { pixPayload, validPixKey } from "../domain/pix";
import { qrSvg } from "../domain/qr";
import Alert from "../ui/Alert";
import Button from "../ui/Button";
import { fieldErrors } from "../ui/fieldErrors";
import { logoToDataUrl } from "../ui/photo";
import { errorText, useToast } from "../ui/Toast";
import { useData } from "../ui/useData";
import AddressFields from "./customers/AddressFields";

export default function CompanyPage() {
  const [company] = useData(loadCompany, null as Company | null);
  return company ? <CompanyForm initial={company} /> : null;
}

const QR_PREVIEW_MM = 40;

function CompanyForm({ initial }: { initial: Company }) {
  const [v, setV] = useState<Company>(initial);
  const [validity, setValidity] = useState(String(initial.quoteValidityDays));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const toast = useToast();
  const set = (k: keyof Company) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV({ ...v, [k]: e.target.value });

  let pixError: string | null = null;
  let qr: string | null = null;
  if (v.pixKey.trim()) {
    try {
      validPixKey(v.pixKey);
      qr = qrSvg(pixPayload({ key: v.pixKey, name: v.pixName || v.tradeName || v.name, city: v.pixCity || v.city }), QR_PREVIEW_MM);
    } catch (e) {
      pixError = errorText(e);
    }
  }

  async function onLogo(files: FileList | null) {
    const f = files?.[0];
    if (!f) return;
    try {
      setV({ ...v, logo: await logoToDataUrl(f) });
    } catch (e) {
      toast(errorText(e), "error");
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    try {
      const saved = await saveCompany(await getDb(), CompanyInput.parse({ ...v, quoteValidityDays: Number(validity) }));
      setV(saved);
      setErrors({});
      toast("Dados da empresa salvos.");
    } catch (err) {
      setErrors(fieldErrors(err));
    }
  }

  const err = (k: string) => errors[k] && <span className="error">{errors[k]}</span>;
  return (
    <form className="page stack" onSubmit={save} noValidate>
      <div className="page-head">
        <div>
          <h1>Dados da empresa</h1>
          <p className="lead">Aparecem no orçamento e no catálogo.</p>
        </div>
        <Button variant="primary" type="submit" icon={Building2}>
          Salvar dados
        </Button>
      </div>

      <section className="group">
        <h2 className="group-title">Empresa</h2>
        <div className="rows">
        <div className="row-control">
          <span className="row-label">Logo</span>
          <span className="hint">Sai no orçamento e no catálogo. PNG, JPG ou WebP.</span>
          <div className="row" style={{ alignItems: "center" }}>
          {v.logo ? <img className="logo-preview" src={v.logo} alt="Logo da empresa" /> : <span className="muted small">Sem logo</span>}
          <label className="button-like">
            <span className="btn-inline">
              <ImagePlus size={16} aria-hidden /> {v.logo ? "Trocar logo" : "Enviar logo"}
            </span>
            <input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => onLogo(e.target.files)} />
          </label>
          {v.logo && (
            <Button variant="link" className="danger" onClick={() => setV({ ...v, logo: "" })}>
              Remover logo
            </Button>
          )}
          </div>
        </div>
        <div className="grid">
          <label>Nome / razão social<input value={v.name} maxLength={120} onChange={set("name")} /></label>
          <label>Nome fantasia<input value={v.tradeName} maxLength={120} onChange={set("tradeName")} /></label>
          <label>
            CPF ou CNPJ
            <input inputMode="numeric" value={v.document} maxLength={20} aria-invalid={!!errors.document} onChange={set("document")} />
            {err("document")}
          </label>
          <label>WhatsApp / telefone<input inputMode="tel" value={v.phone} maxLength={30} onChange={set("phone")} /></label>
          <label>
            E-mail
            <input type="email" value={v.email} maxLength={120} aria-invalid={!!errors.email} onChange={set("email")} />
            {err("email")}
          </label>
          <label>Instagram<input value={v.instagram} maxLength={60} onChange={set("instagram")} /></label>
          <label>Site<input value={v.website} maxLength={120} onChange={set("website")} /></label>
        </div>
        </div>
      </section>

      <section className="group" aria-labelledby="company-address">
        <h2 className="group-title" id="company-address">Endereço</h2>
        <div className="rows">
          <AddressFields value={v} onChange={setV} />
        </div>
      </section>

      <section className="group">
        <h2 className="group-title">Pix para receber</h2>
        <div className="rows">
          <div className="grid">
            <label>
              Chave Pix
              <input value={v.pixKey} maxLength={120} aria-invalid={!!(pixError || errors.pixKey)} onChange={set("pixKey")} placeholder="CPF, CNPJ, e-mail, telefone ou aleatória" />
              {pixError ? <span className="error">{pixError}</span> : err("pixKey")}
            </label>
            <label>
              Nome de quem recebe
              <input value={v.pixName} maxLength={60} onChange={set("pixName")} placeholder={v.tradeName || v.name} />
            </label>
            <label>
              Cidade
              <input value={v.pixCity} maxLength={40} onChange={set("pixCity")} placeholder={v.city} />
            </label>
          </div>
          {qr && (
            <div className="row-control">
              <span className="row-label">Prévia do QR</span>
              <span className="hint">Teste lendo com o app do banco.</span>
              <div className="qr-thumb" role="img" aria-label="Prévia do QR Pix" dangerouslySetInnerHTML={{ __html: qr }} />
            </div>
          )}
        </div>
        <p className="hint group-note">O orçamento gera um QR Pix com o valor exato.</p>
      </section>

      <section className="group">
        <h2 className="group-title">Orçamentos</h2>
        <div className="rows">
        <label>
          Prefixo do número
          <input value={v.quotePrefix} maxLength={10} aria-invalid={!!errors.quotePrefix} onChange={set("quotePrefix")} />
          {errors.quotePrefix ? <span className="error">{errors.quotePrefix}</span> : <span className="hint">Fica assim: {v.quotePrefix || "ORC"}-{new Date().getFullYear()}-001</span>}
        </label>
        <label>
          Validade padrão (dias)
          <input inputMode="numeric" value={validity} aria-invalid={!!errors.quoteValidityDays} onChange={(e) => setValidity(e.target.value)} />
          {errors.quoteValidityDays && <span className="error">Use de 1 a 365 dias.</span>}
        </label>
        <label className="wide">
          Condições comerciais padrão
          <textarea value={v.quoteTerms} maxLength={2000} rows={3} onChange={set("quoteTerms")} />
        </label>
        </div>
      </section>
      {errors._ && <Alert kind="error">{errors._}</Alert>}
    </form>
  );
}
