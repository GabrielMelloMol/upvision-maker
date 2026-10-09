import { Boxes, Camera, Ruler } from "lucide-react";
import { lazy, Suspense, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { setHelpTopic } from "../help/helpStore";
import PageSkeleton from "../ui/PageSkeleton";
import { openWith, takeIntent } from "./intent";

const Models = lazy(() => import("./Models"));
const DrawerOrganizer = lazy(() => import("./DrawerOrganizer"));
const ToolFit = lazy(() => import("./ToolFit"));

export type OrganizerTab = "drawer" | "photo" | "bins";
/** Os modelos Gridfinity avulsos da aba "Caixinhas" (continuam também nos Modelos prontos). */
export const BIN_MODELS = ["gridBin", "gridBase", "gridDrawerBase", "gridTest"] as const;

const WAYS = [
  { id: "drawer", tab: "Pela medida da gaveta", choice: "Tenho a medida da gaveta", blurb: "Meça a gaveta, desenhe as caixinhas na grade e imprima a base e os módulos.", icon: Ruler },
  { id: "photo", tab: "Pela foto das ferramentas", choice: "Tenho as ferramentas para fotografar", blurb: "Fotografe numa folha A4 branca e cada ferramenta ganha um encaixe exato, num bloco, numa caixa ou na gaveta.", icon: Camera },
  { id: "bins", tab: "Caixinhas avulsas", choice: "Quero caixinhas avulsas", blurb: "Caixinha, base, base pela gaveta e teste de encaixe do Gridfinity, uma de cada vez.", icon: Boxes },
] as const satisfies readonly { id: OrganizerTab; tab: string; choice: string; blurb: string; icon: unknown }[];

const TAB_KEY = "upvision.organizers.tab";
const isTab = (v: unknown): v is OrganizerTab => WAYS.some((w) => w.id === v);

function lastTab(): OrganizerTab | null {
  try {
    const v = localStorage.getItem(TAB_KEY);
    return isTab(v) ? v : null;
  } catch {
    return null; // sem armazenamento local: sempre começa pela escolha
  }
}
function rememberTab(tab: OrganizerTab | null) {
  try {
    if (tab) localStorage.setItem(TAB_KEY, tab);
    else localStorage.removeItem(TAB_KEY);
  } catch {
    // modo privado: a aba vale só nesta sessão
  }
}

/**
 * Organizadores: a escolha entre medir a gaveta, fotografar as ferramentas ou fazer caixinhas avulsas, numa ferramenta só.
 * Abre na aba pedida por quem chegou (atalhos, "Veja também", Meus projetos, rascunhos), na última usada, ou na escolha.
 */
export default function Organizers() {
  const [tab, setTab] = useState<OrganizerTab | null>(() => {
    const intent = takeIntent<{ tab?: OrganizerTab; model?: string }>("organizers");
    if (intent?.tab && isTab(intent.tab)) {
      if (intent.tab === "bins" && intent.model) openWith("models", { id: intent.model });
      // o pedido vale uma vez só; guarda a aba para a tela refeita logo depois (remontagem, render repetido) abrir na mesma
      rememberTab(intent.tab);
      return intent.tab;
    }
    return lastTab();
  });
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  // a ajuda (?) é a da aba aberta: o tutorial de medir a gaveta na da gaveta, o do encaixe na da foto
  useEffect(() => {
    setHelpTopic("organizers", tab === "drawer" ? "drawer" : tab === "photo" ? "toolfit" : null);
    return () => setHelpTopic("organizers", null);
  }, [tab]);

  function choose(next: OrganizerTab | null) {
    setTab(next);
    rememberTab(next);
  }
  function onKeyDown(e: KeyboardEvent, index: number) {
    const to = e.key === "ArrowRight" ? (index + 1) % WAYS.length : e.key === "ArrowLeft" ? (index + WAYS.length - 1) % WAYS.length : e.key === "Home" ? 0 : e.key === "End" ? WAYS.length - 1 : -1;
    if (to < 0) return;
    e.preventDefault();
    choose(WAYS[to].id);
    refs.current[WAYS[to].id]?.focus();
  }

  return (
    <div className="page organizers">
      <h1>Organizadores</h1>
      <p className="lead">{tab ? "Troque de jeito quando quiser: o que você já fez em cada um fica guardado." : "Como você quer organizar? Escolha o ponto de partida."}</p>

      {tab === null ? (
        <ul className="org-choices" aria-label="Como organizar">
          {WAYS.map((w) => (
            <li key={w.id}>
              <button type="button" onClick={() => choose(w.id)}>
                <w.icon aria-hidden />
                <span>
                  <strong>{w.choice}</strong>
                  <small>{w.blurb}</small>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <>
          <div className="org-tabbar">
            <div role="tablist" aria-label="Jeito de organizar" className="org-tabs">
              {WAYS.map((w, i) => (
                <button
                  key={w.id}
                  ref={(el) => void (refs.current[w.id] = el)}
                  type="button"
                  role="tab"
                  id={`org-tab-${w.id}`}
                  aria-selected={tab === w.id}
                  aria-controls="org-panel"
                  tabIndex={tab === w.id ? 0 : -1}
                  onClick={() => choose(w.id)}
                  onKeyDown={(e) => onKeyDown(e, i)}
                >
                  <w.icon aria-hidden />
                  {w.tab}
                </button>
              ))}
            </div>
            <button type="button" className="link" onClick={() => choose(null)}>
              Ver as opções
            </button>
          </div>
          <div role="tabpanel" id="org-panel" aria-labelledby={`org-tab-${tab}`}>
            <Suspense fallback={<PageSkeleton />}>
              {tab === "drawer" && <DrawerOrganizer embedded />}
              {tab === "photo" && <ToolFit embedded />}
              {tab === "bins" && <Models embedded={{ ids: BIN_MODELS }} />}
            </Suspense>
          </div>
        </>
      )}
    </div>
  );
}
