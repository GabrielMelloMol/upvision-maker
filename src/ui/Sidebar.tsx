import { DatabaseBackup, History, Lightbulb, Sparkles } from "lucide-react";
import { Fragment } from "react";
import logo from "../assets/logo.png";
import type { PageDef } from "../pages";

type Props = {
  pages: PageDef[];
  current: string;
  onNavigate: (id: string) => void;
  onNews: () => void;
  onSuggest: () => void;
  onBackup: () => void;
  onRestore: () => void;
};

/** Barra lateral translúcida: marca, páginas por grupo (rolagem própria) e rodapé fixo com backup. */
export default function Sidebar({ pages, current, onNavigate, onNews, onSuggest, onBackup, onRestore }: Props) {
  return (
    <nav className="sidebar" aria-label="Navegação principal">
      <div className="drag" data-tauri-drag-region />
      <button className="brand" onClick={() => onNavigate("home")}>
        <img src={logo} alt="" />
        <span>
          UpVision Maker
          <small>Ferramentas para makers 3D</small>
        </span>
      </button>
      <div className="scroll">
        {pages.map((p, i) => (
          <Fragment key={p.id}>
            {p.group && p.group !== pages[i - 1]?.group && <div className="group">{p.group}</div>}
            <button className={`nav ${p.id === current ? "active" : ""}`} aria-current={p.id === current ? "page" : undefined} onClick={() => onNavigate(p.id)}>
              <p.icon aria-hidden />
              {p.label}
            </button>
          </Fragment>
        ))}
      </div>
      <div className="footer">
        <button className="nav accent" onClick={onSuggest}>
          <Lightbulb aria-hidden /> Sugerir ferramenta
        </button>
        <button className="nav" onClick={onNews}>
          <Sparkles aria-hidden /> O que há de novo
        </button>
        <button className="nav" onClick={onBackup}>
          <DatabaseBackup aria-hidden /> Fazer backup
        </button>
        <button className="nav" onClick={onRestore}>
          <History aria-hidden /> Restaurar backup
        </button>
      </div>
    </nav>
  );
}
