import { FolderClock, History, Redo2, Trash2, Undo2 } from "lucide-react";
import { useState } from "react";
import type { ToolProject } from "../db/toolStateRepo";
import Sheet from "../ui/Sheet";
import { modKey } from "../ui/shortcuts";
import type { ToolSession } from "./useToolState";

const when = (iso: string) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/** Topo das ferramentas (#85): "Continuar de onde parou", desfazer/refazer e os últimos projetos exportados. */
export default function ToolSessionBar({ tool }: { tool: Pick<ToolSession, "draft" | "undo" | "redo" | "canUndo" | "canRedo" | "projects" | "open" | "removeProject"> }) {
  const [projectsOpen, setProjectsOpen] = useState(false);
  const k = modKey();
  return (
    <>
      {tool.draft && (
        <div className="banner resume-banner" role="status">
          <History aria-hidden size={18} />
          <span>Você tem um trabalho guardado de {when(tool.draft.at)}.</span>
          <button type="button" className="primary sm" onClick={tool.draft.resume}>
            Continuar de onde parou
          </button>
          <button type="button" className="ghost sm" onClick={() => void tool.draft!.discard()}>
            Começar do zero
          </button>
        </div>
      )}
      <div className="session-bar" role="group" aria-label="Histórico da ferramenta">
        <button type="button" className="ghost icon-only" aria-label="Desfazer" title={`Desfazer (${k}Z)`} aria-keyshortcuts="Meta+Z Control+Z" disabled={!tool.canUndo} onClick={tool.undo}>
          <Undo2 aria-hidden />
        </button>
        <button type="button" className="ghost icon-only" aria-label="Refazer" title={`Refazer (⇧${k}Z)`} aria-keyshortcuts="Meta+Shift+Z Control+Shift+Z" disabled={!tool.canRedo} onClick={tool.redo}>
          <Redo2 aria-hidden />
        </button>
        {tool.projects.length > 0 && (
          <button type="button" className="ghost sm" onClick={() => setProjectsOpen(true)}>
            <FolderClock aria-hidden size={16} /> Últimos projetos ({tool.projects.length})
          </button>
        )}
      </div>
      {projectsOpen && (
        <Sheet title="Últimos projetos" icon={FolderClock} onClose={() => setProjectsOpen(false)} wide>
          <p className="hint">Os últimos arquivos que você salvou nesta ferramenta. Reabrir volta todos os campos; dá para desfazer.</p>
          <ul className="project-grid" aria-label="Projetos">
            {tool.projects.map((p) => (
              <ProjectCard
                key={p.id}
                p={p}
                onOpen={() => {
                  setProjectsOpen(false);
                  void tool.open(p);
                }}
                onRemove={() => void tool.removeProject(p)}
              />
            ))}
          </ul>
        </Sheet>
      )}
    </>
  );
}

function ProjectCard({ p, onOpen, onRemove }: { p: ToolProject; onOpen: () => void; onRemove: () => void }) {
  return (
    <li>
      <button type="button" className="project-open" onClick={onOpen} aria-label={`Reabrir ${p.name || "projeto"}`}>
        {p.thumb ? <img src={p.thumb} alt="" /> : <span className="project-nothumb" aria-hidden />}
        <strong>{p.name || "Sem nome"}</strong>
        <span className="muted">{when(p.at)}</span>
      </button>
      <button type="button" className="ghost icon-only danger" aria-label={`Excluir ${p.name || "projeto"} do histórico`} onClick={onRemove}>
        <Trash2 aria-hidden size={16} />
      </button>
    </li>
  );
}
