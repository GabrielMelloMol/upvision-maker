import type { FieldDef, GuideHelp, ModelDef, Params } from "../fields";

const br = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });

type NumDef = Extract<FieldDef, { kind: "num" }>;
type ChoiceDef = Extract<FieldDef, { kind: "choice" }>;

const hintOf = (f: NumDef, defaults: Params) => (typeof f.hint === "function" ? f.hint(defaults) : (f.hint ?? ""));
const unitOf = (f: NumDef) => (f.unit ?? "mm");

// a dica vai numa linha inteira embaixo do campo: numa 4ª coluna o painel estreito a espremia (#277)
function NumRow({ f, defaults }: { f: NumDef; defaults: Params }) {
  const u = unitOf(f);
  const hint = hintOf(f, defaults);
  return (
    <tbody>
      <tr>
        <th scope="row">{f.label}</th>
        <td>{br(f.min)} a {br(f.max)} {u}</td>
        <td>{br(Number(defaults[f.k]))} {u}</td>
      </tr>
      {hint && (
        <tr className="gen-hint">
          <td colSpan={3}>{hint}</td>
        </tr>
      )}
    </tbody>
  );
}

function ChoiceRow({ f, defaults }: { f: ChoiceDef; defaults: Params }) {
  const std = f.options.find(([v]) => v === defaults[f.k])?.[1];
  return (
    <tbody>
      <tr>
        <th scope="row">{f.label}</th>
        <td>{f.options.map(([, t]) => t).join(", ")}</td>
        <td>{std ?? ""}</td>
      </tr>
    </tbody>
  );
}

const List = ({ title, items }: { title: string; items: string[] }) =>
  items.length > 0 ? (
    <div>
      <h4>{title}</h4>
      <ul>{items.map((t) => <li key={t}>{t}</li>)}</ul>
    </div>
  ) : null;

/**
 * "Como usar": quando usar, faixas e padrões (saem dos campos do modelo), dicas de impressão e perguntas frequentes.
 * Sem `def` (ferramentas com tela própria) não há tabela de campos; `help` manda no texto, senão vale o do `def.guide`.
 */
export default function GeneratorHelp({ def, help, showTips = false }: { def?: ModelDef; help?: GuideHelp; /** As dicas de impressão já aparecem junto do botão de salvar ("Dicas de impressão"): só mostre aqui numa tela sem esse botão. */ showTips?: boolean }) {
  const h = help ?? def?.guide?.help;
  if (!h) return null;
  const { use, avoid, tips, faq } = h;
  const fields = def ? def.sections.flatMap((s) => s.fields) : [];
  const rows = fields.filter((f): f is NumDef | ChoiceDef => f.kind === "num" || f.kind === "choice");
  return (
    <details className="gen-help">
      <summary>Como usar</summary>
      <div className="gen-help-body">
        <List title="Quando usar" items={use} />
        <List title="Quando não usar" items={avoid} />
        {rows.length > 0 && (
          <div className="gen-help-scroll" tabIndex={0} role="region" aria-label="Tabela de medidas, faixas e padrões">
            <table>
              <caption className="sr-only">Faixas e valores padrão dos campos</caption>
              <thead>
                <tr>
                  <th scope="col">Campo</th>
                  <th scope="col">Faixa</th>
                  <th scope="col">Padrão</th>
                </tr>
              </thead>
              {rows.map((f) => (f.kind === "num" ? <NumRow key={f.k} f={f} defaults={def!.defaults} /> : <ChoiceRow key={f.k} f={f} defaults={def!.defaults} />))}
            </table>
          </div>
        )}
        {showTips && <List title="Dicas de impressão" items={tips} />}
        {faq.length > 0 && (
          <div>
            <h4>Perguntas frequentes</h4>
            {faq.map((x) => (
              <details key={x.q} className="gen-faq">
                <summary>{x.q}</summary>
                <p>{x.a}</p>
              </details>
            ))}
          </div>
        )}
      </div>
    </details>
  );
}
