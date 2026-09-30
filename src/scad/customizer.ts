/**
 * Parâmetros de um .scad no formato do Customizer do OpenSCAD (#96), também usado pelo Parametric Model Maker:
 * variáveis de topo com valor literal, antes do 1º `module`/`function`. `/* [Aba] *\/` abre uma aba ([Hidden] esconde),
 * o comentário da linha de cima vira o rótulo e o comentário no fim da linha escolhe o campo:
 * `// [min:max]` ou `// [min:passo:max]` = número com limites, `// [a, b]` ou `// [1:Rótulo, 2:Outro]` = lista,
 * `// .5` = passo, `// 12` (texto) = tamanho máximo, `// color` = cor, `// font` = fonte.
 * Os valores vão ao OpenSCAD como `-D nome=valor`: o arquivo não é reescrito.
 */
export type ScadValue = number | string | boolean | number[];
type Base = { name: string; label: string; tab: string };
export type ScadParam = Base &
  (
    | { kind: "num"; value: number; min?: number; max?: number; step?: number }
    | { kind: "choice"; value: number | string; options: [number | string, string][] }
    | { kind: "bool"; value: boolean }
    | { kind: "text"; value: string; maxLength?: number }
    | { kind: "color"; value: string }
    | { kind: "font"; value: string }
    | { kind: "vector"; value: number[] }
  );

const DEFAULT_TAB = "Parâmetros";
const TAB = /^\s*\/\*\s*\[([^\]]+)\]\s*\*\/\s*$/;
const ASSIGN = /^\s*([A-Za-z_]\w*)\s*=\s*(.+?)\s*;\s*(?:\/\/\s*(.*?))?\s*$/;
const DECL = /^\s*(module|function)\s/;
const LINE_COMMENT = /^\s*\/\/\s*(.*?)\s*$/;

/** Literal do OpenSCAD (número, "texto", true/false, [n, n…]) ou undefined se for expressão. */
export function parseLiteral(src: string): ScadValue | undefined {
  const s = src.trim();
  if (/^-?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s)) return Number(s);
  if (s === "true" || s === "false") return s === "true";
  if (/^"(?:[^"\\]|\\.)*"$/.test(s)) return s.slice(1, -1).replace(/\\(.)/g, "$1");
  const v = /^\[(.*)\]$/.exec(s);
  if (v) {
    const items = v[1].split(",").map((x) => x.trim());
    if (items.length && items.every((x) => /^-?(\d+\.?\d*|\.\d+)$/.test(x))) return items.map(Number);
  }
  return undefined;
}

/** "a" ou "2:Rótulo" → [valor, rótulo]; números viram number quando o valor da variável é número. */
function option(item: string, numeric: boolean): [number | string, string] {
  const [raw, ...rest] = item.split(":");
  const v = raw.trim().replace(/^"(.*)"$/, "$1");
  const label = rest.length ? rest.join(":").trim() : v;
  return [numeric && v !== "" && !Number.isNaN(Number(v)) ? Number(v) : v, label];
}

function widget(base: Base, value: ScadValue, hint: string | undefined): ScadParam {
  const h = hint?.trim() ?? "";
  if (typeof value === "boolean") return { ...base, kind: "bool", value };
  if (Array.isArray(value)) return { ...base, kind: "vector", value };
  if (typeof value === "string" && /^colou?r$/i.test(h)) return { ...base, kind: "color", value };
  if (typeof value === "string" && /^font$/i.test(h)) return { ...base, kind: "font", value };
  const list = /^\[(.*)\]$/.exec(h);
  if (list) {
    const inner = list[1].trim();
    const range = /^(-?[\d.]+)\s*:\s*(-?[\d.]+)(?:\s*:\s*(-?[\d.]+))?$/.exec(inner);
    if (typeof value === "number" && range) {
      const [a, b, c] = [range[1], range[2], range[3]].map((x) => (x === undefined ? undefined : Number(x)));
      return c === undefined ? { ...base, kind: "num", value, min: a, max: b, step: 1 } : { ...base, kind: "num", value, min: a, step: b, max: c };
    }
    if (typeof value === "number" && /^-?[\d.]+$/.test(inner)) return { ...base, kind: "num", value, min: 0, max: Number(inner), step: 1 };
    const options = inner.split(",").filter((x) => x.trim()).map((x) => option(x, typeof value === "number"));
    if (options.length) return { ...base, kind: "choice", value, options };
  }
  if (typeof value === "number") return { ...base, kind: "num", value, ...(/^[\d.]+$/.test(h) && Number(h) > 0 ? { step: Number(h) } : {}) };
  return { ...base, kind: "text", value, ...(/^\d+$/.test(h) ? { maxLength: Number(h) } : {}) };
}

export function parseCustomizer(source: string): ScadParam[] {
  const out: ScadParam[] = [];
  let tab = DEFAULT_TAB;
  let prevComment: string | null = null;
  for (const line of source.split(/\r?\n/)) {
    if (DECL.test(line)) break;
    const t = TAB.exec(line);
    if (t) {
      tab = t[1].trim();
      prevComment = null;
      continue;
    }
    const a = ASSIGN.exec(line);
    if (a) {
      const [, name, rawValue, hint] = a;
      const value = parseLiteral(rawValue);
      if (value !== undefined && !/^hidden$/i.test(tab) && !name.startsWith("$")) out.push(widget({ name, label: prevComment || name, tab }, value, hint));
      prevComment = null;
      continue;
    }
    const c = LINE_COMMENT.exec(line);
    prevComment = c ? c[1] : null;
  }
  return out;
}

const literal = (v: ScadValue): string => (Array.isArray(v) ? `[${v.join(",")}]` : typeof v === "string" ? `"${v.replace(/(["\\])/g, "\\$1")}"` : String(v));
const same = (a: ScadValue, b: ScadValue) => literal(a) === literal(b);

/** Argumentos `-D` para os valores que mudaram (na ordem dos parâmetros). */
export function defineArgs(params: ScadParam[], values: Record<string, ScadValue>): string[] {
  return params.flatMap((p) => (p.name in values && !same(values[p.name], p.value) ? ["-D", `${p.name}=${literal(values[p.name])}`] : []));
}

/** Arquivos lidos pelo .scad (`import("x")`, `surface(file="x")`): a pessoa envia cada um. */
export function scadImports(source: string): string[] {
  const names = [...source.matchAll(/\b(?:import|surface)\s*\(\s*(?:file\s*=\s*)?"([^"]+)"/g)].map((m) => m[1]);
  return [...new Set(names)];
}

/** Mesas do Parametric Model Maker (`module mw_plate_1()`…), em ordem: cada uma vira um objeto no 3MF. */
export function plateModules(source: string): string[] {
  return [...source.matchAll(/\bmodule\s+(mw_plate_(\d+))\s*\(/g)].sort((a, b) => Number(a[2]) - Number(b[2])).map((m) => m[1]);
}
