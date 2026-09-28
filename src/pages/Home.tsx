import { PAGES, type Go } from "../pages";

function Cards({ group, go }: { group: string; go: Go }) {
  return (
    <div className="tool-grid">
      {PAGES.filter((p) => p.group === group).map((p) => (
        <button key={p.id} className="tool-card" onClick={() => go(p.id)}>
          <span className="icon"><p.icon aria-hidden /></span>
          <strong>{p.label}</strong>
          <span>{p.blurb}</span>
        </button>
      ))}
    </div>
  );
}

export default function Home({ go }: { go: Go }) {
  const hasTools = PAGES.some((p) => p.group === "Ferramentas");
  return (
    <div className="page">
      <h1>O que vamos criar hoje?</h1>
      <p className="lead">Tudo roda neste computador, sem internet e sem limite de uso. Faça backup pelo menu de vez em quando.</p>
      {hasTools && (
        <>
          <h2>Ferramentas</h2>
          <Cards group="Ferramentas" go={go} />
        </>
      )}
      <h2>Gestão</h2>
      <Cards group="Gestão" go={go} />
    </div>
  );
}
