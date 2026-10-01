import { BookOpen, CircleHelp, Lightbulb, MousePointerClick, Sparkles } from "lucide-react";
import Sheet from "../ui/Sheet";
import { articleFor, type HelpArticle } from "./articles";
import { GLOSSARY } from "./glossary";
import { closeHelp, openHelp, requestExample, useHasExample, useOpenHelp } from "./helpStore";
import HelpImages from "./HelpImages";
import { startTour, tourFor } from "./tours";


/** Ajuda aberta (botão "?", tecla ?, busca ⌘K): artigo da tela ou o glossário. */
export default function HelpSheet() {
  const id = useOpenHelp();
  if (!id) return null;
  if (id.startsWith("term:")) return <Glossary highlight={id.slice(5)} />;
  const a = articleFor(id);
  return a ? <Article a={a} /> : null;
}

function Article({ a }: { a: HelpArticle }) {
  const canExample = useHasExample(a.id) && !!a.example;
  return (
    <Sheet
      title={a.title}
      icon={CircleHelp}
      onClose={closeHelp}
      footer={
        <>
          <button type="button" className="ghost" onClick={() => openGlossary()}>
            <BookOpen aria-hidden size={16} /> Termos técnicos
          </button>
          {tourFor(a.id) && (
            <button
              type="button"
              onClick={() => {
                closeHelp();
                startTour(a.id);
              }}
            >
              <MousePointerClick aria-hidden size={16} /> Rever o tour
            </button>
          )}
          {canExample && (
            <button
              type="button"
              onClick={() => {
                closeHelp();
                requestExample(a.id);
              }}
            >
              <Sparkles aria-hidden size={16} /> {a.example}
            </button>
          )}
          <button type="button" className="primary" onClick={closeHelp}>
            Entendi
          </button>
        </>
      }
    >
      <div className="help-article">
        <p className="lead">{a.intro}</p>
        <ol className="help-steps">
          {a.steps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
        {a.images?.length ? <HelpImages images={a.images} title={a.title} /> : null}
        {a.tips?.length ? (
          <div className="help-tips">
            <Lightbulb aria-hidden size={16} />
            <ul>
              {a.tips.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </Sheet>
  );
}

const openGlossary = (term = "") => openHelp(`term:${term}`);

function Glossary({ highlight }: { highlight: string }) {
  return (
    <Sheet title="Termos técnicos" icon={BookOpen} onClose={closeHelp} footer={<button type="button" className="primary" onClick={closeHelp}>Entendi</button>}>
      <dl className="help-glossary">
        {GLOSSARY.map((t) => (
          <div key={t.id} data-highlight={t.id === highlight || undefined}>
            <dt>{t.term}</dt>
            <dd>{t.text}</dd>
          </div>
        ))}
      </dl>
    </Sheet>
  );
}
