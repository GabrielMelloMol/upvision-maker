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

/** Chave e, para chave sem workspace próprio, o workspace onde rodar (#157). */
export type AiCred = { apiKey: string; workspaceId?: string | null };

/**
 * maxRetries: o SDK já tenta de novo sozinho (com espera crescente) em 429, 529/5xx e queda de conexão.
 * Chave de vários workspaces: o header anthropic-workspace-id escolhe onde o pedido roda (docs: manage-claude/workspaces).
 */
export const createClient = ({ apiKey, workspaceId }: AiCred) =>
  new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 2, ...(workspaceId ? { defaultHeaders: { "anthropic-workspace-id": workspaceId } } : {}) });

/** Verifica a chave consultando o modelo (não gera texto, não custa nada). */
export async function testKey(cred: AiCred, model: string): Promise<string> {
  const info = await createClient(cred).models.retrieve(model);
  return info.display_name;
}

/**
 * Uma volta da conversa. `history` inclui a nova mensagem do usuário.
 * O prompt de sistema é fixo e marcado para cache: as voltas seguintes pagam ~10% por ele.
 */
export async function ask(cred: AiCred, model: string, history: Anthropic.MessageParam[], onText: (chars: number) => void, signal: AbortSignal): Promise<AskResult> {
  const stream = createClient(cred).messages.stream(
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
export async function countInputTokens(cred: AiCred, model: string, history: Anthropic.MessageParam[]): Promise<number> {
  const r = await createClient(cred).messages.countTokens({ model, system: SYSTEM_PROMPT, messages: history });
  return r.input_tokens;
}

/** Erro explicado para a pessoa: o que houve, passos para resolver e o texto técnico (fica recolhido na tela). */
export type AiErrorInfo = { text: string; steps?: string[]; detail?: string };

const WORKSPACE_STEPS = [
  "Abra console.anthropic.com → Settings → Workspaces e escolha o workspace.",
  "Na aba API keys, clique em Create key e cole a chave nova em Preferências → Inteligência artificial.",
  "Ou, para continuar com esta chave, preencha ali o ID do workspace (começa com wrkspc_).",
];

const body = (e: InstanceType<typeof Anthropic.APIError>) => (e.error as { error?: { type?: unknown; message?: unknown } } | undefined)?.error;

/** Segundos do header retry-after (429), se veio. */
function retryAfter(e: InstanceType<typeof Anthropic.APIError>): number | null {
  const n = Number(e.headers?.get("retry-after"));
  return n > 0 ? Math.ceil(n) : null;
}

/**
 * Classifica pelo tipo do SDK (classe/status); dentro do 400, que a API usa para vários casos, o texto do corpo separa
 * workspace, saldo e imagem.
 */
export function aiError(e: unknown): AiErrorInfo {
  if (!(e instanceof Anthropic.APIError)) return { text: e instanceof Error ? e.message : String(e) };
  const b = body(e);
  const msg = typeof b?.message === "string" ? b.message : e.message;
  const detail = [e.message, e.requestID && `request-id: ${e.requestID}`].filter(Boolean).join("\n");
  const out = (text: string, steps?: string[]): AiErrorInfo => ({ text, ...(steps && { steps }), detail });
  if (e instanceof Anthropic.APIConnectionTimeoutError) return out("A Anthropic demorou demais para responder. Verifique a internet e tente de novo.");
  if (e instanceof Anthropic.APIConnectionError) return out("Sem conexão com a Anthropic. Verifique a internet e tente de novo.");
  if (e instanceof Anthropic.AuthenticationError) return out("Chave da API inválida ou apagada. Crie outra em console.anthropic.com → API keys e cole em Preferências.");
  if ((e.status === 400 || e.status === 403) && /workspace/i.test(msg)) return out("Esta chave não está ligada a um workspace, então a Anthropic recusou o pedido.", WORKSPACE_STEPS);
  if (e.status === 402 || b?.type === "billing_error" || (e.status === 400 && /credit balance/i.test(msg)))
    return out("Acabaram os créditos da conta da Anthropic. Adicione saldo em console.anthropic.com → Settings → Billing.");
  if (e.status === 413 || (e.status === 400 && /image/i.test(msg))) return out("Uma imagem é grande demais ou está num formato que a IA não lê. Tire a imagem ou use JPG/PNG menor.");
  if (e instanceof Anthropic.PermissionDeniedError) return out("Esta chave não tem permissão para este pedido. Confira em console.anthropic.com se ela pode usar o modelo e o workspace.");
  if (e instanceof Anthropic.NotFoundError) return out("Modelo não encontrado. Escolha outro em Preferências.");
  if (e instanceof Anthropic.RateLimitError) return out(`Muitos pedidos seguidos. Tente de novo em ${retryAfter(e) ?? 60} s.`);
  if ((e.status ?? 0) >= 500 || b?.type === "overloaded_error")
    return out("Os servidores da Anthropic estão sobrecarregados. O app já tentou de novo sozinho; espere alguns minutos e reenvie.");
  if (e instanceof Anthropic.BadRequestError) return out("A Anthropic recusou o pedido. Veja os detalhes abaixo.");
  return out(`Erro da API (${e.status ?? "?"}).`);
}

export const aiErrorText = (e: unknown) => aiError(e).text;
