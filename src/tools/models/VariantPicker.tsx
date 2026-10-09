import { ArrowUpRight } from "lucide-react";
import { requestNavigate } from "../../ui/navigate";
import { familyOf, modelOf, type FamilyVariant } from "./families";
import { THUMBS } from "./thumbs";

type Props = { id: string; onPick: (id: string) => void };

/** Nome da ferramenta (no menu) para o aviso "abre a ferramenta X" do atalho; o rótulo do botão é o da variante. */
const TOOL_NAMES: Record<string, string> = { medal: "Medalhas", keychain: "Chaveiros", drawer: "Organizador de gaveta", qr: "QR Code", toolfit: "Organizador pela foto", pixel: "Pixel art", lithophane: "Foto em relevo" };

/**
 * Seletor de variação da família (#141): miniatura pequena + rótulo, agrupado quando a família tem grupos
 * ("Com arte" / "Com função"). Ferramentas com tela própria (Chaveiros, Medalhas…) aparecem como atalho.
 */
export default function VariantPicker({ id, onPick }: Props) {
  const f = familyOf(id);
  const tools = f.tools ?? [];
  if (f.variants.length < 2 && !tools.length) return null;
  const groups = [...new Set(f.variants.map((v) => v.group ?? ""))];
  const item = (v: FamilyVariant) => {
    const Icon = modelOf(v.id).icon;
    return (
      <button key={v.id} type="button" aria-pressed={v.id === id} onClick={() => v.id !== id && onPick(v.id)} title={`${modelOf(v.id).label}: ${modelOf(v.id).blurb}`}>
        <span className="model-variant-thumb">{THUMBS[v.id] ? <img src={THUMBS[v.id]} alt="" loading="lazy" /> : <Icon aria-hidden />}</span>
        <span className="model-variant-label">{v.label}</span>
      </button>
    );
  };
  const tool = (t: (typeof tools)[number]) => (
    <button key={t.page} type="button" className="model-variant-tool" title={`Abre a ferramenta ${TOOL_NAMES[t.page] ?? t.label}, em outra tela`} onClick={() => requestNavigate(t.page)}>
      <span className="model-variant-thumb">
        <ArrowUpRight aria-hidden />
      </span>
      <span className="model-variant-label">{t.label}</span>
    </button>
  );
  return (
    <div className="model-variants" role="group" aria-label="Variação">
      {groups.map((g) => (
        <div key={g} className="model-variant-group">
          {g && <span className="model-variant-title">{g}</span>}
          <div className="model-variant-row">
            {g === groups[0] && tools.filter((t) => t.first).map(tool)}
            {f.variants.filter((v) => (v.group ?? "") === g).map(item)}
            {g === groups[groups.length - 1] && tools.filter((t) => !t.first).map(tool)}
          </div>
        </div>
      ))}
    </div>
  );
}
