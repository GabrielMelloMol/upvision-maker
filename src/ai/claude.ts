import Anthropic from "@anthropic-ai/sdk";
import { estimateCostUsd } from "./cost";
import { scadFontList } from "./scadFonts";

const MAX_TOKENS = 16000;

export const SYSTEM_PROMPT = `Você é um projetista de peças para impressão 3D FDM que escreve código OpenSCAD.
Quem pede é uma pessoa que vende peças impressas (chaveiros, medalhas, brindes, organizadores) e não sabe programar.

Regras do modelo:
- Unidades em milímetros. A peça fica apoiada em Z = 0 e cabe numa mesa de 250 × 250 × 250 mm.
- Pense em imprimibilidade: paredes de pelo menos 1,2 mm, detalhes de pelo menos 0,4 mm, evite balanços acima de 45° e pontes longas.
- Encaixes: folga de 0,2 a 0,3 mm entre peças que se encaixam.
- Use $fn entre 48 e 96 em curvas. Evite minkowski e hull em formas complexas (ficam lentos).
- Não use import(), include<> nem use<> de arquivos externos.
- Fontes disponíveis para text(font="…"), com o nome exatamente assim (padrão: "Hanken Grotesk", sem serifa e grossa). Não use outras.
  ${scadFontList()}
  Para nomes em uma peça só, prefira cursivas que unem as letras ("Pacifico", "Lobster", "Norican"); evite as finas ("Great Vibes", "Allura", "Parisienne", "Alex Brush") abaixo de 15 mm de altura.

Formato do código:
- Defina tudo em módulos e NÃO escreva chamadas no nível de topo.
- Declare cada parte imprimível no topo com um comentário: // @part <modulo> <#cor-hex> <Nome>
  Cada parte vira um volume de filamento separado (uma cor no AMS). Peça de uma cor só = uma única @part.
  As partes não devem se sobrepor (subtraia uma da outra quando houver relevo).

Imagens de referência (quando a pessoa mandar fotos, prints ou esboços, cada uma com "Imagem N" e uma legenda opcional):
- Use as imagens só como referência de forma, proporção e disposição dos elementos; o modelo é sempre desenhado do zero.
- Foto ou esboço não tem escala: se faltar alguma medida e ela não estiver no texto nem numa legenda, faça uma versão com uma medida razoável e diga qual usou, pedindo a medida certa.
- Nunca reproduza logotipos, marcas, personagens ou desenhos de terceiros que apareçam nas imagens: descreva e substitua por uma forma genérica.

Formato da resposta:
- Explique em 1 a 3 frases curtas, em português, o que você fez ou mudou.
- Depois, um único bloco \`\`\`openscad com o código COMPLETO (nunca só um trecho), mesmo em ajustes.
- Se o pedido estiver ambíguo, faça uma versão razoável e diga qual suposição fez.`;

export type AskResult = { message: Anthropic.Message; text: string; costUsd: number | null };

export const createClient = (apiKey: string) => new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 2 });

/** Verifica a chave consultando o modelo (não gera texto, não custa nada). */
export async function testKey(apiKey: string, model: string): Promise<string> {
  const info = await createClient(apiKey).models.retrieve(model);
  return info.display_name;
}

/**
 * Uma volta da conversa. `history` inclui a nova mensagem do usuário.
 * O prompt de sistema é fixo e marcado para cache: as voltas seguintes pagam ~10% por ele.
 */
export async function ask(apiKey: string, model: string, history: Anthropic.MessageParam[], onText: (chars: number) => void, signal: AbortSignal): Promise<AskResult> {
  const stream = createClient(apiKey).messages.stream(
    {
      model,
      max_tokens: MAX_TOKENS,
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      // marca também o fim da conversa: as imagens e voltas anteriores ficam em cache nos ajustes seguintes (#89)
      cache_control: { type: "ephemeral" },
      messages: history,
    },
    { signal },
  );
  let chars = 0;
  stream.on("text", (delta) => onText((chars += delta.length)));
  const message = await stream.finalMessage();
  if (message.stop_reason === "refusal") throw new Error("O Claude recusou este pedido. Tente descrever a peça de outra forma.");
  const text = message.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n");
  if (message.stop_reason === "max_tokens") throw new Error("A resposta ficou grande demais e foi cortada. Peça uma peça mais simples ou em etapas.");
  return { message, text, costUsd: estimateCostUsd(model, message.usage) };
}

/**
 * Tokens de entrada do próximo pedido (texto + imagens + histórico), contados pela própria API antes de enviar
 * (gratuito). Serve para mostrar o custo estimado incluindo as imagens (#89).
 */
export async function countInputTokens(apiKey: string, model: string, history: Anthropic.MessageParam[]): Promise<number> {
  const r = await createClient(apiKey).messages.countTokens({ model, system: SYSTEM_PROMPT, messages: history });
  return r.input_tokens;
}

/** Mensagem clara para cada tipo de erro da API. */
export function aiErrorText(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError) return "Chave da API inválida. Confira em Preferências.";
  if (e instanceof Anthropic.PermissionDeniedError) return "Esta chave não tem permissão para usar o modelo escolhido.";
  if (e instanceof Anthropic.NotFoundError) return "Modelo não encontrado. Escolha outro em Preferências.";
  if (e instanceof Anthropic.RateLimitError) return "Muitos pedidos seguidos. Espere um minuto e tente de novo.";
  if (e instanceof Anthropic.BadRequestError) return `A API recusou o pedido: ${e.message}. Se for saldo, adicione créditos em console.anthropic.com.`;
  if (e instanceof Anthropic.APIConnectionError) return "Sem conexão com a Anthropic. Verifique a internet.";
  if (e instanceof Anthropic.APIError) return `Erro da API (${e.status ?? "?"}): ${e.message}`;
  return e instanceof Error ? e.message : String(e);
}
