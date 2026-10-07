import { strFromU8 } from "fflate";
import { safeUnzip, ZipTooBig } from "../domain/safeUnzip";
import type { Mesh } from "./types";

/**
 * Leitor de 3MF (padrão + extensões do Bambu Studio / OrcaSlicer / PrusaSlicer): objetos com malha própria ou
 * componentes (inclusive em arquivos separados, `p:path`), transformações, extrusora por parte e pintura por
 * triângulo. As coordenadas saem já transformadas (posição na mesa).
 */
export type ReadPart = { id: string; name: string; extruder: number; mesh: Mesh; paint: string[] | null };
export type ReadObject = { name: string; parts: ReadPart[] };
export type Read3mf = { objects: ReadObject[]; filamentColors: string[] };

type Mat = number[]; // 3MF: 12 números, linha a linha (m00 m01 m02 m10 … m30 m31 m32), ponto como vetor-linha
const IDENTITY: Mat = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];
const MAX_UNZIPPED = 400 * 1024 * 1024;

const attr = (tag: string, name: string) => new RegExp(`\\s${name}\\s*=\\s*"([^"]*)"`).exec(tag)?.[1];
const parseMat = (s: string | undefined): Mat => {
  const v = (s ?? "").trim().split(/\s+/).map(Number);
  return v.length === 12 && v.every(Number.isFinite) ? v : IDENTITY;
};
/** a depois b (aplica a, depois b). */
const mul = (a: Mat, b: Mat): Mat => {
  const r = (i: number, j: number) => a[i * 3 + j];
  const out: number[] = [];
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 3; j++) out.push(r(i, 0) * b[j] + r(i, 1) * b[3 + j] + r(i, 2) * b[6 + j] + (i === 3 ? b[9 + j] : 0));
  return out;
};

type RawObject = { id: string; name: string; mesh?: { positions: Float32Array; indices: Uint32Array; paint: string[] | null }; components: { objectid: string; path?: string; transform: Mat }[] };

/** Objetos de um arquivo .model (malhas e componentes). */
function parseModelFile(xml: string): Map<string, RawObject> {
  const out = new Map<string, RawObject>();
  for (const m of xml.matchAll(/<object\b([^>]*)>([\s\S]*?)<\/object>/g)) {
    const [, head, body] = m;
    const id = attr(head, "id")!;
    const obj: RawObject = { id, name: attr(head, "name") ?? `Objeto ${id}`, components: [] };
    const vs = /<vertices>([\s\S]*?)<\/vertices>/.exec(body);
    if (vs) {
      const pos: number[] = [];
      for (const v of vs[1].matchAll(/<vertex\b([^>]*)\/?>/g)) pos.push(Number(attr(v[1], "x")), Number(attr(v[1], "y")), Number(attr(v[1], "z")));
      const idx: number[] = [];
      const paint: string[] = [];
      let painted = false;
      for (const t of body.matchAll(/<triangle\b([^>]*)\/?>/g)) {
        idx.push(Number(attr(t[1], "v1")), Number(attr(t[1], "v2")), Number(attr(t[1], "v3")));
        const p = attr(t[1], "paint_color") ?? attr(t[1], "slic3rpe:mmu_segmentation") ?? "";
        if (p) painted = true;
        paint.push(p);
      }
      obj.mesh = { positions: Float32Array.from(pos), indices: Uint32Array.from(idx), paint: painted ? paint : null };
    }
    for (const c of body.matchAll(/<component\b([^>]*)\/?>/g)) obj.components.push({ objectid: attr(c[1], "objectid")!, path: attr(c[1], "p:path"), transform: parseMat(attr(c[1], "transform")) });
    out.set(id, obj);
  }
  return out;
}

function transform(positions: Float32Array, m: Mat): Float32Array {
  const out = new Float32Array(positions.length);
  for (let i = 0; i < positions.length; i += 3) {
    const [x, y, z] = [positions[i], positions[i + 1], positions[i + 2]];
    out[i] = x * m[0] + y * m[3] + z * m[6] + m[9];
    out[i + 1] = x * m[1] + y * m[4] + z * m[7] + m[10];
    out[i + 2] = x * m[2] + y * m[5] + z * m[8] + m[11];
  }
  return out;
}

/** Extrusora por objeto e por parte, do Metadata/model_settings.config (Bambu/Orca). */
function extruders(config: string | undefined): { object: Map<string, number>; part: Map<string, number>; partName: Map<string, string> } {
  const object = new Map<string, number>(), part = new Map<string, number>(), partName = new Map<string, string>();
  if (!config) return { object, part, partName };
  for (const o of config.matchAll(/<object\s+id="([^"]+)"[^>]*>([\s\S]*?)<\/object>/g)) {
    const [, oid, body] = o;
    const own = /^\s*(?:<metadata[^>]*\/>\s*)*/.exec(body)?.[0] ?? "";
    const oe = /key="extruder"\s+value="(\d+)"/.exec(own);
    if (oe) object.set(oid, Number(oe[1]));
    for (const p of body.matchAll(/<part\s+id="([^"]+)"[^>]*>([\s\S]*?)<\/part>/g)) {
      const e = /key="extruder"\s+value="(\d+)"/.exec(p[2]);
      if (e) part.set(p[1], Number(e[1]));
      const n = /key="name"\s+value="([^"]*)"/.exec(p[2]);
      if (n) partName.set(p[1], n[1]);
    }
  }
  return { object, part, partName };
}

function filamentColors(settings: string | undefined): string[] {
  try {
    const c = settings ? (JSON.parse(settings) as Record<string, unknown>).filament_colour : null;
    return Array.isArray(c) ? c.map((x) => String(x).slice(0, 7).toLowerCase()) : [];
  } catch {
    return [];
  }
}

/** Lê um 3MF. STL não serve: a pintura por cor só existe no 3MF. */
export function read3mf(bytes: Uint8Array): Read3mf {
  let files: Record<string, Uint8Array>;
  try {
    files = safeUnzip(bytes, (f) => f.originalSize < MAX_UNZIPPED);
  } catch (e) {
    if (e instanceof ZipTooBig) throw e;
    throw new Error("Não é um arquivo 3MF válido (precisa ser o .3mf do Bambu Studio, OrcaSlicer ou PrusaSlicer).", { cause: e });
  }
  const text = (name: string) => {
    const key = Object.keys(files).find((k) => k.replace(/^\//, "").toLowerCase() === name.replace(/^\//, "").toLowerCase());
    return key ? strFromU8(files[key]) : undefined;
  };
  const root = text("3D/3dmodel.model");
  if (!root) throw new Error("3MF sem modelo 3D (3D/3dmodel.model).");
  const cache = new Map<string, Map<string, RawObject>>();
  const fileObjects = (path: string) => {
    if (!cache.has(path)) cache.set(path, parseModelFile(path === "3D/3dmodel.model" ? root : (text(path) ?? "")));
    return cache.get(path)!;
  };
  const ex = extruders(text("Metadata/model_settings.config"));
  const objects: ReadObject[] = [];
  for (const it of root.matchAll(/<item\b([^>]*)\/?>/g)) {
    const oid = attr(it[1], "objectid")!;
    const top = fileObjects("3D/3dmodel.model").get(oid);
    if (!top) continue;
    const baseExtruder = ex.object.get(oid) ?? 1;
    const parts: ReadPart[] = [];
    const walk = (o: RawObject, file: string, m: Mat, depth: number) => {
      if (depth > 8) return;
      if (o.mesh) {
        parts.push({
          id: o.id,
          name: ex.partName.get(o.id) ?? o.name,
          extruder: ex.part.get(o.id) ?? baseExtruder,
          mesh: { positions: transform(o.mesh.positions, m), indices: o.mesh.indices },
          paint: o.mesh.paint,
        });
      }
      for (const c of o.components) {
        const f = c.path ? c.path.replace(/^\//, "") : file;
        const child = fileObjects(f).get(c.objectid);
        if (child) walk(child, f, mul(c.transform, m), depth + 1);
      }
    };
    walk(top, "3D/3dmodel.model", parseMat(attr(it[1], "transform")), 0);
    if (parts.length) objects.push({ name: top.name, parts });
  }
  if (!objects.length) throw new Error("O 3MF não tem nenhum objeto com malha.");
  return { objects, filamentColors: filamentColors(text("Metadata/project_settings.config")) };
}
