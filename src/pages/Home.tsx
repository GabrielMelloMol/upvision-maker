import { ArrowUpRight } from "lucide-react";
import { PAGES, type Go } from "../pages";

function greeting(h = new Date().getHours()) {
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}

function Cards({ group, go, start, tint }: { group: string; go: Go; start: number; tint?: "blue" }) {
  return (
    <div className="tool-grid">
      {PAGES.filter((p) => p.group === group).map((p, i) => (
        <button key={p.id} className="tool-card" style={{ "--i": start + i } as React.CSSProperties} onClick={() => go(p.id)}>
          <ArrowUpRight className="go" aria-hidden />
          <span className={`icon ${tint ?? ""}`}>
            <p.icon aria-hidden />
          </span>
          <strong>{p.label}</strong>
          <span>{p.blurb}</span>
        </button>
      ))}
    </div>
  );
}

export default function Home({ go }: { go: Go }) {
  const tools = PAGES.filter((p) => p.group === "Ferramentas").length;
  return (
    <div className="page">
      <p className="muted" style={{ margin: "0 0 4px", fontWeight: 500 }}>
        {greeting()}!
      </p>
      <h1>O que vamos criar hoje?</h1>
      <p className="lead">Tudo roda neste computador, sem internet e sem limite de uso. Faça backup pelo menu de vez em quando.</p>
      {tools > 0 && (
        <>
          <div className="section-title">
            <h2>Ferramentas</h2>
          </div>
          <Cards group="Ferramentas" go={go} start={0} />
        </>
      )}
      <div className="section-title">
        <h2>Gestão</h2>
      </div>
      <Cards group="Gestão" go={go} start={tools} tint="blue" />
    </div>
  );
}
