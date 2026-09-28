/** Resposta do Claude: explicação em texto + um bloco de código OpenSCAD. */
export function extractReply(text: string): { explanation: string; code: string | null } {
  const m = /```(?:openscad|scad)?[^\S\n]*\n([\s\S]*?)```/i.exec(text);
  if (!m) return { explanation: text.trim(), code: null };
  const explanation = (text.slice(0, m.index) + text.slice(m.index + m[0].length)).replace(/\n{3,}/g, "\n\n").trim();
  return { explanation, code: m[1].trim() };
}

export type ScadPart = { module: string; color: string; name: string };

const PART = /^\s*\/\/\s*@part\s+([A-Za-z_]\w*)\s+(#[0-9a-fA-F]{6})\s+(.+?)\s*$/gm;

/** Partes declaradas com `// @part <módulo> <#cor> <Nome>` cujo módulo existe no código. */
export function parseParts(code: string): ScadPart[] {
  const out: ScadPart[] = [];
  for (const [, module, color, name] of code.matchAll(PART)) {
    if (new RegExp(`\\bmodule\\s+${module}\\s*\\(`).test(code)) out.push({ module, color: color.toLowerCase(), name });
  }
  return out;
}

/** Programa que renderiza só uma parte (o código define módulos e não tem chamadas de topo). */
export const partProgram = (code: string, module: string) => `${code}\n\n${module}();\n`;
