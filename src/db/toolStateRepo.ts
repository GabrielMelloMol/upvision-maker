import { z } from "zod";
import type { Db } from "./types";

/** Quantos projetos exportados cada ferramenta guarda (#85). */
export const PROJECTS_MAX = 10;
const DATA_MAX_CHARS = 6_000_000; // ~6 MB de JSON por registro (arquivos embutidos passam disso: não guarda)

/** Estado atual de uma ferramenta (rascunho que volta no "Continuar de onde parou"). id = id da ferramenta. */
export const ToolStateRow = z.object({ id: z.string().min(1), data: z.string().max(DATA_MAX_CHARS), updatedAt: z.string() });
export type ToolStateRow = z.infer<typeof ToolStateRow>;

/** Projeto exportado: o estado no momento em que a pessoa salvou o arquivo, com miniatura da prévia. */
export const ToolProjectInput = z.object({ toolId: z.string().min(1), name: z.string().max(200), data: z.string().max(DATA_MAX_CHARS), thumb: z.string().nullable(), at: z.string() });
export type ToolProjectInput = z.infer<typeof ToolProjectInput>;
export type ToolProject = ToolProjectInput & { id: number };

export const toolState = {
  async get(db: Db, id: string): Promise<ToolStateRow | null> {
    const [row] = await db.select<ToolStateRow>("SELECT * FROM tool_state WHERE id = ?", [id]);
    return row ?? null;
  },
  async save(db: Db, row: ToolStateRow): Promise<void> {
    const v = ToolStateRow.parse(row);
    await db.execute("INSERT INTO tool_state (id, data, updatedAt) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data, updatedAt = excluded.updatedAt", [v.id, v.data, v.updatedAt]);
  },
  remove: (db: Db, id: string) => db.execute("DELETE FROM tool_state WHERE id = ?", [id]),
  /** Rascunhos mais recentes primeiro (só id e data), para o "Continuar" do Início (#139). */
  recent: (db: Db, limit = 3) => db.select<{ id: string; updatedAt: string }>("SELECT id, updatedAt FROM tool_state ORDER BY updatedAt DESC LIMIT ?", [limit]),
};

const NEWEST = "ORDER BY at DESC, id DESC";

export const toolProjects = {
  list: (db: Db, toolId: string) => db.select<ToolProject>(`SELECT * FROM tool_projects WHERE toolId = ? ${NEWEST} LIMIT ?`, [toolId, PROJECTS_MAX]),
  /** Guarda o projeto e deixa só os PROJECTS_MAX mais recentes da ferramenta. Devolve o id. */
  async add(db: Db, input: ToolProjectInput): Promise<number> {
    const v = ToolProjectInput.parse(input);
    const r = await db.execute("INSERT INTO tool_projects (toolId, name, data, thumb, at) VALUES (?, ?, ?, ?, ?)", [v.toolId, v.name, v.data, v.thumb, v.at]);
    await db.execute(`DELETE FROM tool_projects WHERE toolId = ? AND id NOT IN (SELECT id FROM tool_projects WHERE toolId = ? ${NEWEST} LIMIT ?)`, [v.toolId, v.toolId, PROJECTS_MAX]);
    return Number(r.lastInsertId);
  },
  remove: (db: Db, id: number) => db.execute("DELETE FROM tool_projects WHERE id = ?", [id]),
};
