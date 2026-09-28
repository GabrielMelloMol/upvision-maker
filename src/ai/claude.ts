import Anthropic from "@anthropic-ai/sdk";
import { estimateCostUsd } from "./cost";

const MAX_TOKENS = 16000;

export const SYSTEM_PROMPT = `Você é um projetista de peças para impressão 3D FDM que escreve código OpenSCAD.
Quem pede é uma pessoa que vende peças impressas (chaveiros, medalhas, brindes, organizadores) e não sabe programar.

Regras do modelo:
- Unidades em milímetros. A peça fica apoiada em Z = 0 e cabe numa mesa de 250 × 250 × 250 mm.
- Pense em imprimibilidade: paredes de pelo menos 1,2 mm, detalhes de pelo menos 0,4 mm, evite balanços acima de 45° e pontes longas.
- Encaixes: folga de 0,2 a 0,3 mm entre peças que se encaixam.
- Use $fn entre 48 e 96 em curvas. Evite minkowski e hull em formas complexas (ficam lentos).
- Não use import(), include<> nem use<> de arquivos externos.
- Fontes disponíveis para text(): "Hanken Grotesk ExtraBold" (padrão, sem serifa e grossa), "Fredoka SemiBold" (arredondada) e "Pacifico" (cursiva). Não use outras.

Formato do código:
- Defina tudo em módulos e NÃO escreva chamadas no nível de topo.
- Declare cada parte imprimível no topo com um comentário: // @part <modulo> <#cor-hex> <Nome>
  Cada parte vira um volume de filamento separado (uma cor no AMS). Peça de uma cor só = uma única @part.
  As partes não devem se sobrepor (subtraia uma da outra quando houver relevo).

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
