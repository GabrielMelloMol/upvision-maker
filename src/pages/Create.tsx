import { Search, Shapes } from "lucide-react";
import { useState } from "react";
import { PAGES, type Go } from "../pages";
import { openWith } from "../tools/intent";
import { CATEGORIES, MODELS } from "../tools/models/defs";
import { THUMBS } from "../tools/models/thumbs";
import Segmented from "../ui/Segmented";

const normalize = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** Tipos de ferramenta da galeria: o que a pessoa tem em mãos ou quer fazer, não como a ferramenta funciona. */
const KINDS = [
  ["all", "Tudo"],
  ["make", "Personalizar"],
  ["image", "De um desenho ou foto"],
  ["files", "Arquivos 3D"],
  ["ideas", "Ideias"],
] as const;
type Kind = (typeof KINDS)[number][0];
const KIND_OF: Record<string, Exclude<Kind, "all">> = {
  keychain: "make", medal: "make", qr: "make", spools: "make",
  svg: "image", cutter: "image", extrude: "image", lithophane: "image", pixel: "image",
  colorsplit: "files", scad: "files",
  search3d: "ideas", ai: "ideas",
};

/** Criar (#139): todas as ferramentas e os Modelos prontos numa galeria só, com busca. Novas ferramentas entram aqui, não na barra lateral. */
export default function Create({ go }: { go: Go }) {
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<Kind>("all");
  const term = normalize(q.trim());
  const hit = (text: string) => !term || normalize(text).includes(term);
  const tools = PAGES.filter((p) => p.section === "create" && p.id !== "create" && p.id !== "models")
    .filter((p) => kind === "all" || KIND_OF[p.id] === kind)
    .filter((p) => hit(`${p.label} ${p.blurb ?? ""}`));
  const models = kind === "all" || kind === "make" ? MODELS.filter((m) => hit(`${m.label} ${m.blurb}`)) : [];
  const open = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    go(id);
  };

  return (
    <div className="page create">
      <h1>Criar</h1>
      <div className="create-filters">
        <label className="affix has-prefix create-search">
          <Search aria-hidden className="prefix" />
          <input type="search" aria-label="Buscar ferramenta ou modelo" placeholder="Buscar ferramenta ou modelo" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <Segmented label="Tipo" value={kind} options={KINDS} onChange={setKind} />
      </div>

      {tools.length > 0 && (
        <section aria-labelledby="create-tools">
          <h2 id="create-tools">Ferramentas</h2>
          <ul className="create-tools">
            {tools.map((p) => (
              <li key={p.id}>
                <a href={`#${p.id}`} onClick={(e) => open(e, p.id)}>
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
          const list = models.filter((m) => m.category === cat);
          if (!list.length) return null;
          return (
            <section key={cat} aria-labelledby={`create-${cat}`}>
              <h2 id={`create-${cat}`}>
                {label} <span className="muted">· Modelos prontos</span>
              </h2>
              <ul className="create-models">
                {list.map((m) => (
                  <li key={m.id}>
                    <a
                      href={`#models/${m.id}`}
                      onClick={(e) => {
                        openWith("models", { id: m.id });
                        open(e, "models");
                      }}
                    >
                      <span className="model-thumb">{THUMBS[m.id] ? <img src={THUMBS[m.id]} alt="" loading="lazy" /> : <Shapes aria-hidden />}</span>
                      <strong>{m.label}</strong>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}

      {!tools.length && !models.length && <p className="muted create-empty">Nada com “{q}”. Tente outra palavra ou peça à IA em Ideias.</p>}
    </div>
  );
}
