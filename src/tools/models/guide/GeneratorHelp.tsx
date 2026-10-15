import type { FieldDef, ModelDef, Params } from "../fields";

const br = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });

type NumDef = Extract<FieldDef, { kind: "num" }>;
type ChoiceDef = Extract<FieldDef, { kind: "choice" }>;

const hintOf = (f: NumDef, defaults: Params) => (typeof f.hint === "function" ? f.hint(defaults) : (f.hint ?? ""));
const unitOf = (f: NumDef) => (f.unit ?? "mm");

function NumRow({ f, defaults }: { f: NumDef; defaults: Params }) {
  const u = unitOf(f);
  return (
    <tr>
      <th scope="row">{f.label}</th>
      <td>{br(f.min)} a {br(f.max)} {u}</td>
      <td>{br(Number(defaults[f.k]))} {u}</td>
      <td>{hintOf(f, defaults)}</td>
    </tr>
  );
}

function ChoiceRow({ f, defaults }: { f: ChoiceDef; defaults: Params }) {
  const std = f.options.find(([v]) => v === defaults[f.k])?.[1];
  return (
    <tr>
      <th scope="row">{f.label}</th>
      <td>{f.options.map(([, t]) => t).join(", ")}</td>
      <td>{std ?? ""}</td>
      <td />
    </tr>
  );
}

const List = ({ title, items }: { title: string; items: string[] }) =>
  items.length > 0 ? (
    <div>
      <h4>{title}</h4>
      <ul>{items.map((t) => <li key={t}>{t}</li>)}</ul>
    </div>
  ) : null;

/** "Como usar": quando usar, faixas e padrões (saem dos campos do modelo), dicas de impressão e perguntas frequentes. */
export default function GeneratorHelp({ def }: { def: ModelDef }) {
  if (!def.guide) return null;
  const { use, avoid, tips, faq } = def.guide.help;
  const fields = def.sections.flatMap((s) => s.fields);
  const rows = fields.filter((f): f is NumDef | ChoiceDef => f.kind === "num" || f.kind === "choice");
  return (
    <details className="gen-help">
      <summary>Como usar</summary>
      <div className="gen-help-body">
        <List title="Quando usar" items={use} />
        <List title="Quando não usar" items={avoid} />
        {rows.length > 0 && (
          <div className="gen-help-scroll">
            <table>
              <caption className="sr-only">Faixas e valores padrão dos campos</caption>
              <thead>
                <tr>
                  <th scope="col">Campo</th>
                  <th scope="col">Faixa</th>
                  <th scope="col">Padrão</th>
                  <th scope="col">Dica</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((f) => (f.kind === "num" ? <NumRow key={f.k} f={f} defaults={def.defaults} /> : <ChoiceRow key={f.k} f={f} defaults={def.defaults} />))}
              </tbody>
            </table>
          </div>
        )}
        <List title="Dicas de impressão" items={tips} />
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
