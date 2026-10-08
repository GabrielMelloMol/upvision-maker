import { pathWithoutArcs } from "./svgArc";

/**
 * SVG como o navegador desenha, antes de o leitor do three.js ver (#183). O leitor deixa de fora o que os programas de
 * desenho mais exportam, e a arte entra torta, na escala errada ou some:
 * - `transform` escrito em CSS (`style="transform: rotate(30deg)"` ou numa regra de `<style>`) era ignorado;
 * - `<use href="#id">` (sem `xlink:`) não achava a forma;
 * - `<symbol viewBox>` mostrado por `<use width height>` ficava sem escala;
 * - arcos, círculos, elipses e retângulos arredondados saíam com a proporção errada quando o grupo girava e escalava
 *   desigual: viram Béziers, que as transformações tratam exatamente.
 * Se o texto não for XML válido, devolve como veio (o leitor dá o erro de sempre).
 */
const SVG_NS = "http://www.w3.org/2000/svg";
const XLINK_NS = "http://www.w3.org/1999/xlink";

export function normalizeSvg(svg: string): string {
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  const root = doc.documentElement;
  if (!root || doc.querySelector("parsererror") || root.localName !== "svg") return svg;
  cssTransforms(doc);
  inlineUses(doc);
  roundShapesToPaths(doc);
  for (const p of Array.from(doc.querySelectorAll("path"))) {
    const d = p.getAttribute("d");
    if (d && /[Aa]/.test(d)) p.setAttribute("d", pathWithoutArcs(d));
  }
  return new XMLSerializer().serializeToString(doc);
}

const fmt = (n: number) => String(Number(n.toFixed(5)));
const num = (s: string | null | undefined, fallback = 0) => {
  const n = parseFloat(s ?? "");
  return Number.isFinite(n) ? n : fallback;
};

// ---- transform em CSS → atributo transform -------------------------------------------------------------------------

type Decls = Record<string, string>;

function parseDecls(text: string): Decls {
  const out: Decls = {};
  for (const part of text.split(";")) {
    const i = part.indexOf(":");
    if (i > 0) out[part.slice(0, i).trim().toLowerCase()] = part.slice(i + 1).trim();
  }
  return out;
}

const ANGLE = /^(-?[\d.]+(?:e-?\d+)?)\s*(deg|rad|turn|grad)?$/i;
function degrees(s: string): number {
  const m = ANGLE.exec(s.trim());
  if (!m) return 0;
  const v = Number(m[1]);
  switch ((m[2] ?? "deg").toLowerCase()) {
    case "rad": return (v * 180) / Math.PI;
    case "turn": return v * 360;
    case "grad": return v * 0.9;
    default: return v;
  }
}
const length = (s: string) => num(s.replace(/px$/i, "")); // % precisa da caixa do desenho: fora do que se lê aqui

/** "rotate(30deg) translate(10px, 5px)" → "rotate(30) translate(10 5)"; null se não houver nada que se entenda. */
function cssToSvgTransform(value: string, origin?: string): string | null {
  if (!value || value === "none") return null;
  const fns: string[] = [];
  for (const [, name, args] of value.matchAll(/([a-zA-Z]+)\(([^)]*)\)/g)) {
    const a = args.split(/[\s,]+/).filter(Boolean);
    switch (name.toLowerCase()) {
      case "translate": fns.push(`translate(${fmt(length(a[0] ?? "0"))} ${fmt(length(a[1] ?? "0"))})`); break;
      case "translatex": fns.push(`translate(${fmt(length(a[0] ?? "0"))} 0)`); break;
      case "translatey": fns.push(`translate(0 ${fmt(length(a[0] ?? "0"))})`); break;
      case "rotate": fns.push(`rotate(${fmt(degrees(a[0] ?? "0"))})`); break;
      case "scale": fns.push(`scale(${fmt(num(a[0], 1))} ${fmt(num(a[1] ?? a[0], 1))})`); break;
      case "scalex": fns.push(`scale(${fmt(num(a[0], 1))} 1)`); break;
      case "scaley": fns.push(`scale(1 ${fmt(num(a[0], 1))})`); break;
      case "skewx": fns.push(`skewX(${fmt(degrees(a[0] ?? "0"))})`); break;
      case "skewy": fns.push(`skewY(${fmt(degrees(a[0] ?? "0"))})`); break;
      case "matrix": if (a.length === 6) fns.push(`matrix(${a.map((v) => fmt(num(v))).join(" ")})`); break;
    }
  }
  if (!fns.length) return null;
  const [ox, oy] = (origin ?? "").split(/\s+/).filter(Boolean).map(length); // sem origem: 0 0, como o navegador em SVG
  const chain = fns.join(" ");
  return ox || oy ? `translate(${fmt(ox || 0)} ${fmt(oy || 0)}) ${chain} translate(${fmt(-(ox || 0))} ${fmt(-(oy || 0))})` : chain;
}

function cssTransforms(doc: Document): void {
  const rules: { selector: string; decls: Decls }[] = [];
  for (const style of Array.from(doc.querySelectorAll("style"))) {
    const text = (style.textContent ?? "").replace(/\/\*[\s\S]*?\*\//g, "");
    for (const [, sel, body] of text.matchAll(/([^{}@]+)\{([^{}]*)\}/g)) {
      const decls = parseDecls(body);
      if (decls.transform || decls["transform-origin"]) for (const s of sel.split(",")) rules.push({ selector: s.trim(), decls });
    }
  }
  const inline = (el: Element) => parseDecls(el.getAttribute("style") ?? "");
  for (const el of Array.from(doc.querySelectorAll("*"))) {
    const merged: Decls = {};
    for (const r of rules) {
      try {
        if (el.matches(r.selector)) Object.assign(merged, r.decls);
      } catch {
        // seletor que o navegador entenderia e este não: segue sem ele
      }
    }
    Object.assign(merged, inline(el));
    const t = cssToSvgTransform(merged.transform, merged["transform-origin"]);
    if (t) el.setAttribute("transform", t);
  }
}

// ---- <use href> e <symbol viewBox> ---------------------------------------------------------------------------------

function byId(doc: Document, id: string): Element | null {
  for (const el of Array.from(doc.querySelectorAll("[id]"))) if (el.getAttribute("id") === id) return el;
  return null;
}

/** viewBox → transformação para mostrar o conteúdo em w × h (preserveAspectRatio; padrão xMidYMid meet). */
function viewBoxTransform(viewBox: string, par: string | null, w: number, h: number): string {
  const [minX, minY, vw, vh] = viewBox.split(/[\s,]+/).map(Number);
  if (![minX, minY, vw, vh].every(Number.isFinite) || !(vw > 0) || !(vh > 0)) return "";
  const [align, mode] = (par ?? "xMidYMid meet").trim().split(/\s+/);
  if (align === "none") return `scale(${fmt(w / vw)} ${fmt(h / vh)}) translate(${fmt(-minX)} ${fmt(-minY)})`;
  const s = mode === "slice" ? Math.max(w / vw, h / vh) : Math.min(w / vw, h / vh);
  const ax = align.includes("xMid") ? 0.5 : align.includes("xMax") ? 1 : 0;
  const ay = align.includes("YMid") ? 0.5 : align.includes("YMax") ? 1 : 0;
  return `translate(${fmt(ax * (w - vw * s))} ${fmt(ay * (h - vh * s))}) scale(${fmt(s)}) translate(${fmt(-minX)} ${fmt(-minY)})`;
}

function inlineUses(doc: Document): void {
  for (const use of Array.from(doc.querySelectorAll("use"))) {
    const href = use.getAttribute("href") ?? use.getAttributeNS(XLINK_NS, "href");
    if (!href?.startsWith("#")) continue;
    const target = byId(doc, href.slice(1));
    if (!target) continue;
    if (target.localName !== "symbol") {
      use.setAttributeNS(XLINK_NS, "xlink:href", href); // o leitor só procura com o prefixo
      continue;
    }
    const g = doc.createElementNS(SVG_NS, "g");
    for (const a of Array.from(use.attributes)) if (!["href", "x", "y", "width", "height", "transform"].includes(a.localName) && a.prefix !== "xlink") g.setAttribute(a.name, a.value);
    const vb = target.getAttribute("viewBox");
    const [, , vw, vh] = vb ? vb.split(/[\s,]+/).map(Number) : [0, 0, 0, 0];
    const w = num(use.getAttribute("width"), vw || 0), h = num(use.getAttribute("height"), vh || 0);
    const parts = [use.getAttribute("transform"), `translate(${fmt(num(use.getAttribute("x")))} ${fmt(num(use.getAttribute("y")))})`, vb && w > 0 && h > 0 ? viewBoxTransform(vb, target.getAttribute("preserveAspectRatio"), w, h) : ""];
    g.setAttribute("transform", parts.filter(Boolean).join(" "));
    for (const child of Array.from(target.childNodes)) g.appendChild(child.cloneNode(true));
    use.replaceWith(g);
  }
  // <symbol> só aparece pelos <use>; o leitor o desenharia também solto, em cima do original
  for (const sym of Array.from(doc.querySelectorAll("symbol"))) sym.remove();
}

// ---- círculo, elipse e retângulo arredondado → caminho --------------------------------------------------------------

const GEOMETRY = ["cx", "cy", "r", "rx", "ry", "x", "y", "width", "height"];

function roundShapesToPaths(doc: Document): void {
  for (const el of Array.from(doc.querySelectorAll("circle, ellipse, rect"))) {
    let d: string | null = null;
    if (el.localName === "circle" || el.localName === "ellipse") {
      const cx = num(el.getAttribute("cx")), cy = num(el.getAttribute("cy"));
      const rx = num(el.getAttribute(el.localName === "circle" ? "r" : "rx")), ry = el.localName === "circle" ? rx : num(el.getAttribute("ry"), num(el.getAttribute("rx")));
      if (rx > 0 && ry > 0) d = `M${cx + rx} ${cy} A${rx} ${ry} 0 1 1 ${cx - rx} ${cy} A${rx} ${ry} 0 1 1 ${cx + rx} ${cy}Z`;
    } else {
      const x = num(el.getAttribute("x")), y = num(el.getAttribute("y")), w = num(el.getAttribute("width")), h = num(el.getAttribute("height"));
      const rxA = el.getAttribute("rx"), ryA = el.getAttribute("ry");
      let rx = num(rxA, rxA === null ? num(ryA) : 0), ry = num(ryA, ryA === null ? rx : 0);
      rx = Math.min(rx, w / 2);
      ry = Math.min(ry, h / 2);
      if (w > 0 && h > 0 && rx > 0 && ry > 0) {
        d = `M${x + rx} ${y} H${x + w - rx} A${rx} ${ry} 0 0 1 ${x + w} ${y + ry} V${y + h - ry} A${rx} ${ry} 0 0 1 ${x + w - rx} ${y + h} H${x + rx} A${rx} ${ry} 0 0 1 ${x} ${y + h - ry} V${y + ry} A${rx} ${ry} 0 0 1 ${x + rx} ${y}Z`;
      }
    }
    if (!d) continue;
    const path = doc.createElementNS(SVG_NS, "path");
    for (const a of Array.from(el.attributes)) if (!GEOMETRY.includes(a.name)) path.setAttribute(a.name, a.value);
    path.setAttribute("d", d);
    el.replaceWith(path);
  }
}
