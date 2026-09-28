import { Download, Inbox, Palette, Plus, Sparkles } from "lucide-react";
import { useState, type ReactNode } from "react";
import Alert from "../ui/Alert";
import Button from "../ui/Button";
import Card from "../ui/Card";
import Dropzone from "../ui/Dropzone";
import EmptyState from "../ui/EmptyState";
import Field from "../ui/Field";
import NumField from "../ui/NumField";
import Segmented from "../ui/Segmented";
import Sheet from "../ui/Sheet";
import Slider from "../ui/Slider";
import { useToast } from "../ui/Toast";
import Toggle from "../ui/Toggle";

/*
 * Catálogo interno do design system (só aparece no modo dev).
 * Tokens: src/styles/tokens.css · Componentes: src/ui/* · Estilos: src/styles/*.css.
 * Ao criar um componente novo, coloque um exemplo aqui.
 */

const COLORS = ["--bg", "--surface", "--surface-2", "--fill", "--text", "--muted", "--accent", "--accent-text", "--brand-orange", "--action", "--danger", "--ok", "--warn"];
const TYPE = [
  ["--title-1", "Large title · h1"],
  ["--title-2", "Título 2 · h2"],
  ["--title-3", "Título 3 · h3"],
  ["--text-lg", "Lead"],
  ["--text-md", "Corpo"],
  ["--text-sm", "Legenda · .hint"],
] as const;

function Demo({ title, code, children }: { title: string; code: string; children: ReactNode }) {
  return (
    <Card title={title}>
      <div className="stack">{children}</div>
      <pre className="demo-code">{code}</pre>
    </Card>
  );
}

export default function DesignCatalog() {
  const toast = useToast();
  const [seg, setSeg] = useState<"a" | "b" | "c">("a");
  const [on, setOn] = useState(true);
  const [num, setNum] = useState(2);
  const [slider, setSlider] = useState(40);
  const [sheet, setSheet] = useState(false);

  return (
    <div className="page">
      <h1>Design system</h1>
      <p className="lead">Catálogo interno para manutenção. Tudo aqui usa os tokens de src/styles/tokens.css e se adapta ao modo claro e escuro do sistema.</p>

      <h2>Cores</h2>
      <div className="swatches">
        {COLORS.map((c) => (
          <div key={c} className="swatch">
            <i style={{ background: `var(${c})` }} />
            <code>{c}</code>
          </div>
        ))}
      </div>

      <h2>Tipografia</h2>
      <Card>
        {TYPE.map(([v, label]) => (
          <p key={v} style={{ fontSize: `var(${v})`, fontWeight: v.startsWith("--title") ? 650 : 400, fontFamily: v.startsWith("--title") ? "var(--font-display)" : undefined }}>
            {label} <span className="muted small">{v}</span>
          </p>
        ))}
      </Card>

      <h2>Componentes</h2>
      <div className="catalog">
        <Demo title="Button" code={`<Button variant="primary" icon={Plus}>Adicionar</Button>`}>
          <div className="row">
            <Button variant="primary" icon={Plus}>Primário</Button>
            <Button variant="action" icon={Download}>Exportar</Button>
            <Button>Secundário</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="link">Link</Button>
            <Button variant="danger">Excluir</Button>
          </div>
          <div className="row">
            <Button size="sm">Pequeno</Button>
            <Button size="lg" variant="primary">Grande</Button>
            <Button disabled>Desativado</Button>
          </div>
        </Demo>

        <Demo title="Field · NumField" code={`<Field label="Nome" hint="…" error={err}><input /></Field>`}>
          <div className="grid two">
            <Field label="Nome" hint="Uma dica curta.">
              <input placeholder="Ex.: Bambu Lab A1" />
            </Field>
            <Field label="Com erro" error="Digite um número.">
              <input aria-invalid defaultValue="abc" />
            </Field>
            <NumField label="Altura" value={num} onChange={setNum} min={0.2} max={10} />
            <Field label="Select">
              <select>
                <option>PLA</option>
                <option>PETG</option>
              </select>
            </Field>
          </div>
        </Demo>

        <Demo title="Slider · Toggle · Segmented" code={`<Segmented label="Modo" value={v} options={[["a","Logo"],["b","Silhueta"]]} onChange={setV} />`}>
          <Slider label="Detalhe" min={0} max={100} value={slider} onChange={setSlider} display={(v) => `${v}%`} hint="Trilho preenchido via --fill." />
          <Toggle label="Base por baixo" checked={on} onChange={setOn} />
          <label className="check">
            <input type="checkbox" defaultChecked /> Checkbox
          </label>
          <Segmented label="Exemplo" value={seg} onChange={setSeg} options={[["a", "Logo"], ["b", "Silhueta"], ["c", "Texto"]]} />
        </Demo>

        <Demo title="Alert · Badge" code={`<Alert kind="warn">…</Alert>  <span className="badge ok">ok</span>`}>
          <Alert kind="info">Informação neutra.</Alert>
          <Alert kind="ok">Deu certo.</Alert>
          <Alert kind="warn">Atenção a este detalhe.</Alert>
          <Alert kind="error">Algo falhou e como resolver.</Alert>
          <div className="row">
            <span className="badge">estoque baixo</span>
            <span className="badge ok">salva</span>
            <span className="badge warn">rascunho</span>
          </div>
        </Demo>

        <Demo title="Toast · Sheet" code={`toast("Salvo.")  ·  <Sheet title="…" onClose={…} footer={…}>…</Sheet>`}>
          <div className="row">
            <Button onClick={() => toast("Preferências salvas.")}>Toast ok</Button>
            <Button onClick={() => toast("Não foi possível salvar: disco cheio.", "error")}>Toast erro</Button>
            <Button variant="primary" onClick={() => setSheet(true)}>Abrir sheet</Button>
          </div>
        </Demo>

        <Demo title="Dropzone · Skeleton" code={`<Dropzone accept=".svg" label="Arraste…" onFile={f => …} />  <span className="skeleton line" />`}>
          <Dropzone accept="image/*" label="Arraste uma imagem ou clique" hint="PNG, JPG ou SVG" onFile={(f) => toast(`Arquivo: ${f.name}`)} />
          <span className="skeleton line" style={{ width: "70%" }} />
          <span className="skeleton line" style={{ width: "45%" }} />
        </Demo>
      </div>

      <h2>EmptyState</h2>
      <EmptyState icon={Inbox} title="Nada por aqui ainda." action={<Button variant="primary" icon={Plus}>Criar o primeiro</Button>}>
        Uma frase humana dizendo o que aparece aqui e como começar.
      </EmptyState>

      {sheet && (
        <Sheet
          title="Exemplo de sheet"
          icon={Sparkles}
          onClose={() => setSheet(false)}
          footer={
            <>
              <Button onClick={() => setSheet(false)}>Cancelar</Button>
              <Button variant="primary" onClick={() => setSheet(false)} data-autofocus>
                Confirmar
              </Button>
            </>
          }
        >
          <p className="muted">Esc, clique fora ou o X fecham. O foco fica preso aqui dentro e volta para quem abriu.</p>
          <Field label="Campo">
            <input />
          </Field>
        </Sheet>
      )}
      <p className="muted small" style={{ marginTop: 32 }}>
        <Palette size={14} aria-hidden /> Página visível só em desenvolvimento.
      </p>
    </div>
  );
}
