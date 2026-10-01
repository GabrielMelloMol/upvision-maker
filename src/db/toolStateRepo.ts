import { z } from "zod";
import type { Db } from "./types";

/** Quantos projetos aparecem nos "Últimos projetos" de cada ferramenta (#85). */
export const PROJECTS_MAX = 10;
/** Teto por ferramenta na biblioteca Meus projetos (#161): os mais antigos sem favorito saem antes. */
export const LIBRARY_MAX = 500;
const DATA_MAX_CHARS = 6_000_000; // ~6 MB de JSON por registro (arquivos embutidos passam disso: não guarda)

/** Estado atual de uma ferramenta (rascunho que volta no "Continuar de onde parou"). id = id da ferramenta. */
export const ToolStateRow = z.object({ id: z.string().min(1), data: z.string().max(DATA_MAX_CHARS), updatedAt: z.string() });
export type ToolStateRow = z.infer<typeof ToolStateRow>;

/** Projeto exportado: o estado no momento em que a pessoa salvou o arquivo, com miniatura da prévia. */
export const ToolProjectInput = z.object({
  toolId: z.string().min(1),
  name: z.string().max(200),
  data: z.string().max(DATA_MAX_CHARS),
  thumb: z.string().nullable(),
  at: z.string(),
  // Meus projetos (#161); opcionais para backups de antes
  favorite: z.union([z.boolean(), z.number()]).optional(),
  tags: z.string().optional(),
  updatedAt: z.string().nullable().optional(),
  productId: z.number().int().positive().nullable().optional(),
  orderId: z.number().int().positive().nullable().optional(),
});
export type ToolProjectInput = z.infer<typeof ToolProjectInput>;
export type ToolProject = ToolProjectInput & { id: number };

/** O que a pessoa muda pela biblioteca (nada de dados, ferramenta ou datas de criação). */
export const ProjectPatch = z
  .object({
    name: z.string().trim().max(200),
    favorite: z.boolean(),
    tags: z.array(z.string().trim().min(1).max(30)).max(20),
    productId: z.number().int().positive().nullable(),
    orderId: z.number().int().positive().nullable(),
  })
  .partial();
export type ProjectPatch = z.infer<typeof ProjectPatch>;

export const projectTags = (p: Pick<ToolProject, "tags">): string[] => {
  try {
    const v = JSON.parse(p.tags ?? "[]");
    return Array.isArray(v) ? v.filter((t): t is string => typeof t === "string") : [];
  } catch {
    return [];
  }
};

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
    const r = await db.execute("INSERT INTO tool_projects (toolId, name, data, thumb, at, favorite, tags, updatedAt, productId, orderId) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [
      v.toolId,
      v.name,
      v.data,
      v.thumb,
      v.at,
      v.favorite ? 1 : 0,
      v.tags ?? "[]",
      v.updatedAt ?? v.at,
      v.productId ?? null,
      v.orderId ?? null,
    ]);
    // biblioteca (#161): guarda até LIBRARY_MAX por ferramenta; favoritos nunca saem
    await db.execute(`DELETE FROM tool_projects WHERE toolId = ? AND favorite = 0 AND id NOT IN (SELECT id FROM tool_projects WHERE toolId = ? ${NEWEST} LIMIT ?)`, [v.toolId, v.toolId, LIBRARY_MAX]);
    return Number(r.lastInsertId);
  },
  remove: (db: Db, id: number) => db.execute("DELETE FROM tool_projects WHERE id = ?", [id]),
  async get(db: Db, id: number): Promise<ToolProject | null> {
    const [row] = await db.select<ToolProject>("SELECT * FROM tool_projects WHERE id = ?", [id]);
    return row ?? null;
  },
  /** Os últimos projetos de todas as ferramentas (Início, #161). */
  recent: (db: Db, limit: number) => db.select<ToolProject>("SELECT * FROM tool_projects ORDER BY COALESCE(updatedAt, at) DESC, id DESC LIMIT ?", [limit]),
  /** Todos os projetos de todas as ferramentas, mais recentes primeiro (Meus projetos, #161). */
  all: (db: Db) => db.select<ToolProject>("SELECT * FROM tool_projects ORDER BY COALESCE(updatedAt, at) DESC, id DESC"),
  /** Muda só os campos da biblioteca (lista branca); marca a data de mudança. */
  async update(db: Db, id: number, patch: ProjectPatch): Promise<void> {
    const v = ProjectPatch.parse(patch);
    const sets: [string, unknown][] = [];
    if (v.name !== undefined) sets.push(["name", v.name]);
    if (v.favorite !== undefined) sets.push(["favorite", v.favorite ? 1 : 0]);
    if (v.tags !== undefined) sets.push(["tags", JSON.stringify([...new Set(v.tags)])]);
    if (v.productId !== undefined) sets.push(["productId", v.productId]);
    if (v.orderId !== undefined) sets.push(["orderId", v.orderId]);
    if (!sets.length) return;
    sets.push(["updatedAt", new Date().toISOString()]);
    await db.execute(`UPDATE tool_projects SET ${sets.map(([k]) => `${k} = ?`).join(", ")} WHERE id = ?`, [...sets.map(([, x]) => x), id]);
  },
  /** Miniatura que chega depois do projeto (render à parte, #161/#149); não conta como mudança da pessoa. */
  setThumb: (db: Db, id: number, thumb: string | null) => db.execute("UPDATE tool_projects SET thumb = ? WHERE id = ?", [thumb, id]),
  /** "Fazer de novo": cópia com o mesmo estado, nome com "(cópia)", sem favorito nem ligações. */
  async duplicate(db: Db, id: number): Promise<number> {
    const p = await toolProjects.get(db, id);
    if (!p) throw new Error("Projeto não encontrado.");
    const now = new Date().toISOString();
    return toolProjects.add(db, { toolId: p.toolId, name: `${p.name || "Projeto"} (cópia)`.slice(0, 200), data: p.data, thumb: p.thumb, at: now, tags: p.tags, updatedAt: now });
  },
};
