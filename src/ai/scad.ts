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

/**
 * Pedido de "Virar modelo" (#97): o Claude reescreve o código com as medidas e textos como parâmetros no formato do
 * Customizer (lidos por src/scad/customizer.ts). Uma chamada; depois os ajustes pelo formulário não custam nada.
 */
export const parametrizePrompt = (code: string) => `Transforme este código OpenSCAD num modelo personalizável, no formato do Customizer do OpenSCAD.

Regras:
- Todas as medidas, quantidades, textos, fontes e opções que alguém gostaria de mudar viram variáveis no TOPO do arquivo, antes de qualquer module ou function, com valor literal (número, "texto", true/false).
- Na linha de cima de cada variável, um comentário curto em português que vira o rótulo (ex.: // Largura da placa (mm)).
- No fim da linha, o controle: // [min:passo:max] com limites realistas para impressão 3D (ex.: // [20:1:200]); lista de opções // [redondo, quadrado]; texto com tamanho máximo // 20; fonte com // font.
- Agrupe em abas com /* [Medidas] */, /* [Texto] */ etc. Valores calculados a partir de outros vão depois de /* [Hidden] */.
- Com os valores padrão, a peça tem de sair igual à de agora. Mantenha as linhas // @part e os módulos de cada parte.
- Garanta que a peça continua válida nos limites mínimo e máximo de cada variável.

Responda só com o código completo num bloco \`\`\`openscad.

\`\`\`openscad
${code}
\`\`\``;

/** Programa que renderiza só uma parte (o código define módulos e não tem chamadas de topo). */
export const partProgram = (code: string, module: string) => `${code}\n\n${module}();\n`;
