import { Search, Shapes } from "lucide-react";
import { useState } from "react";
import { PAGES, type Go } from "../pages";
import { AMS_LABEL } from "../geometry/amsNeed";
import { openModel } from "../tools/modelPlaces";
import { AMS_NEED, worksWithoutAms } from "../tools/models/amsTable";
import { CATEGORIES } from "../tools/models/defs";
import { familiesIn, type Family } from "../tools/models/families";
import { matchesAll, modelText, toolText } from "../tools/models/search";
import { THUMBS } from "../tools/models/thumbs";
import OccasionCard from "../ui/OccasionCard";
import Segmented from "../ui/Segmented";
import Toggle from "../ui/Toggle";


/** Tipos de ferramenta da galeria: o que a pessoa tem em mãos ou quer fazer, não como a ferramenta funciona. */
const KINDS = [
  ["all", "Tudo"],
  ["make", "Personalizar"],
  ["image", "De um desenho ou foto"],
  ["files", "Arquivos 3D"],
  ["ideas", "Ideias"],
] as const;
type Kind = (typeof KINDS)[number][0];
/** Selo curto do card (#118); o rótulo inteiro (AMS_LABEL) fica na dica. */
const AMS_SHORT = { "uma-cor": "1 cor", "troca-manual": "Sem AMS, com pausas", ams: "Com AMS" } as const;
const KIND_OF: Record<string, Exclude<Kind, "all">> = {
  keychain: "make", medal: "make", qr: "make", spools: "make", organizers: "make",
  svg: "image", cutter: "image", extrude: "image", lithophane: "image", pixel: "image",
  colorsplit: "files", scad: "files",
  search3d: "ideas", ai: "ideas",
};

/** Criar (#139): todas as ferramentas e os Modelos prontos numa galeria só, com busca. Novas ferramentas entram aqui, não na barra lateral. */
export default function Create({ go }: { go: Go }) {
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<Kind>("all");
  const [noAms, setNoAms] = useState(false);
  const hit = (text: string) => matchesAll(text, q);
  const tools = PAGES.filter((p) => p.section === "create" && p.id !== "create" && p.id !== "models" && p.id !== "projects") // Meus projetos não é ferramenta (#161)
    .filter((p) => kind === "all" || KIND_OF[p.id] === kind)
    .filter((p) => hit(toolText(p.id, p.label, p.blurb)));
  // modelos prontos em famílias (#141): o card abre a variação que a busca achou ("anilha" → Chaveiro › Anilha)
  const variantText = (id: string, label: string) => `${label} ${modelText(id)}`;
  // "Imprime sem troca automática de cor (AMS)" (#118): o card mostra a primeira variação que dá para imprimir sem AMS
  const pickIn = (f: Family) => {
    const ok = f.variants.filter((v) => !noAms || worksWithoutAms(v.id));
    return hit(f.label) ? ok[0] : ok.find((v) => hit(variantText(v.id, v.label)));
  };
  const models =
    kind === "all" || kind === "make"
      ? CATEGORIES.flatMap(([cat]) => familiesIn(cat).map((f) => ({ f, cat, v: pickIn(f) }))).filter((x): x is { f: Family; cat: (typeof CATEGORIES)[number][0]; v: Family["variants"][number] } => !!x.v)
      : [];
  const open = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    go(id);
  };

  return (
    <div className="page create">
      <h1>Criar</h1>
      <OccasionCard go={go} />
      <div className="create-filters">
        <label className="affix has-prefix create-search">
          <Search aria-hidden className="prefix" />
          <input type="search" aria-label="Buscar ferramenta ou modelo" placeholder="Buscar ferramenta ou modelo" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <Segmented label="Tipo" value={kind} options={KINDS} onChange={setKind} />
        {(kind === "all" || kind === "make") && <Toggle label="Imprime sem troca automática de cor (AMS)" checked={noAms} onChange={setNoAms} />}
        {/* atalho fixo para a biblioteca (#161) */}
        <a className="create-projects" href="#projects" data-page="projects" onClick={(e) => open(e, "projects")}>
          Meus projetos →
        </a>
      </div>

      {tools.length > 0 && (
        <section aria-labelledby="create-tools">
          <h2 id="create-tools">Ferramentas</h2>
          <ul className="create-tools">
            {tools.map((p) => (
              <li key={p.id}>
                <a href={`#${p.id}`} data-page={p.id} onClick={(e) => open(e, p.id)}>
                  <p.icon aria-hidden />
                  <span>
                    <strong>{p.label}</strong>
                    <small>{p.blurb}</small>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {models.length > 0 &&
        CATEGORIES.map(([cat, label]) => {
          const list = models.filter((m) => m.cat === cat);
          if (!list.length) return null;
          return (
            <section key={cat} aria-labelledby={`create-${cat}`}>
              <h2 id={`create-${cat}`}>
                {label} <span className="muted">· Modelos prontos</span>
              </h2>
              <ul className="create-models">
                {list.map(({ f, v }) => {
                  const thumb = THUMBS[v.id] ?? f.variants.map((x) => THUMBS[x.id]).find(Boolean);
                  const need = AMS_NEED[v.id];
                  return (
                    <li key={f.id}>
                      <a
                        href={`#models/${v.id}`}
                        aria-describedby={need ? `ams-${f.id}` : undefined}
                        onClick={(e) => {
                          open(e, openModel(v.id)); // o que virou aba de ferramenta (Shadowbox) abre na aba
                        }}
                      >
                        <span className="model-thumb">{thumb ? <img src={thumb} alt="" loading="lazy" /> : <Shapes aria-hidden />}</span>
                        <strong>{f.label}</strong>
                        {need && (
                          <small className="ams-need" title={AMS_LABEL[need]} aria-hidden>
                            {AMS_SHORT[need]}
                            <span hidden id={`ams-${f.id}`}>{AMS_LABEL[need]}</span>
                          </small>
                        )}
                      </a>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}

      {!tools.length && !models.length && <p className="muted create-empty">{noAms && !q ? "Nenhum modelo funciona sem AMS com esse filtro." : <>Nada com “{q}”{noAms && " sem AMS"}. Tente outra palavra ou peça à IA em Ideias.</>}</p>}
    </div>
  );
}
