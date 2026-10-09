// @vitest-environment happy-dom
import Anthropic from "@anthropic-ai/sdk";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { renderWithApp, setupTauri } from "../test/harness";
import AiSettingsCard from "./AiSettingsCard";
import Preferences from "./Preferences";
import { todayIso } from "../domain/orders";
import { openWith } from "../tools/intent";

const testKey = vi.hoisted(() => vi.fn());
vi.mock("../ai/claude", async (orig) => ({ ...(await orig<typeof import("../ai/claude")>()), testKey }));

const t = setupTauri();
const KEY = "sk-ant-api03-abcdefghijklmnopqrstuvwxyz";
const secret = async (k: string) => (await t.db.select<{ value: string }>("SELECT value FROM secrets WHERE key = ?", [k]))[0]?.value;
const settings = async () => JSON.parse((await t.db.select<{ data: string }>("SELECT data FROM settings"))[0].data);

beforeEach(() => {
  testKey.mockClear();
  localStorage.clear(); // a última seção aberta é lembrada (#179)
});
/** Abre uma seção das Preferências pela lista da esquerda. */
const open = (user: ReturnType<typeof userEvent.setup>, name: string | RegExp) => user.click(screen.getByRole("button", { name }));

describe("Preferences", () => {
  test("a manutenção fala em desgaste por hora, sem 'depreciação' (UX M1)", async () => {
    renderWithApp(<Preferences />);
    await screen.findByLabelText("Manutenção (%)");
    expect(screen.getByText("Só vale para impressora sem preço cadastrado; com preço, a calculadora usa o desgaste por hora.")).toBeInTheDocument();
    expect(screen.queryByText(/depreciação/)).not.toBeInTheDocument();
  });

  test("carrega os padrões, edita custos e canais e salva", async () => {
    const user = userEvent.setup();
    renderWithApp(<Preferences />);
    const kwh = await screen.findByLabelText("Preço do kWh");
    expect(kwh).toHaveValue("0,90");
    await user.clear(kwh);
    await user.type(kwh, "1,2");
    const maint = screen.getByLabelText("Manutenção (%)");
    await user.clear(maint);
    await user.type(maint, "7,5");

    await open(user, "Canais de venda");
    const shopee = screen.getByDisplayValue("Shopee").closest(".row")! as HTMLElement;
    await user.click(within(shopee).getByRole("button", { name: "Remover" }));
    await user.click(screen.getByRole("button", { name: "Adicionar canal" }));
    const names = screen.getAllByLabelText("Canal");
    await user.type(names[names.length - 1], "Feira");
    const feira = names[names.length - 1].closest(".row")! as HTMLElement;
    await user.clear(within(feira).getByLabelText("Comissão (%)"));
    await user.type(within(feira).getByLabelText("Comissão (%)"), "5");
    await user.clear(within(feira).getByLabelText("Taxa fixa por venda"));
    await user.type(within(feira).getByLabelText("Taxa fixa por venda"), "1,5");
    await user.click(screen.getByRole("button", { name: "Salvar preferências" }));

    expect(await screen.findByText("Preferências salvas.")).toBeInTheDocument();
    const s = await settings();
    expect(s).toMatchObject({ kwhPrice: 1.2, maintenancePct: 7.5 });
    expect(s.channels.map((c: { name: string }) => c.name)).toEqual(["Mercado Livre (clássico)", "TikTok Shop", "Feira"]);
    expect(s.channels[2]).toEqual({ name: "Feira", feePct: 5, feeFixed: 1.5, checkedAt: expect.any(String) }); // mexer na taxa confere hoje (#34)
  });

  test("falhas, impostos e custos fixos (#22): horas só com custos fixos ligados; jeito antigo do multiplicador", async () => {
    await t.db.execute("INSERT INTO materials (name, unit, unitPrice) VALUES ('Caixinha', 'un', 2)");
    const user = userEvent.setup();
    renderWithApp(<Preferences />);
    const fail = await screen.findByLabelText("Taxa de falha (%)");
    await open(user, "Falhas, impostos e custos fixos");
    expect(fail).toHaveValue("5");
    await user.clear(fail);
    await user.type(fail, "10");
    await user.clear(screen.getByLabelText("Impostos sobre a venda (%)"));
    await user.type(screen.getByLabelText("Impostos sobre a venda (%)"), "6");
    const hours = screen.getByLabelText("Horas de impressão por mês");
    expect(hours).toBeDisabled();
    await user.click(screen.getByRole("switch", { name: "Incluir custos fixos no preço" }));
    expect(hours).toBeEnabled();
    await user.clear(hours);
    await user.type(hours, "80");
    await user.click(screen.getByRole("switch", { name: /jeito antigo/ }));
    await user.selectOptions(screen.getByLabelText(/^Embalagem padrão/), "Caixinha");
    expect(screen.getByText(/loja, papelaria.*lucro de 200 % sobre o custo/)).toBeInTheDocument();
    // a explicação do "jeito antigo" fica na própria linha, e não num parágrafo de histórico de versão (UX B8)
    expect(screen.queryByText(/Desde a v0\.6/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Salvar preferências" }));
    expect(await screen.findByText("Preferências salvas.")).toBeInTheDocument();
    expect(await settings()).toMatchObject({ failurePct: 10, taxPct: 6, includeFixedCosts: true, productiveHoursMonth: 80, multiplyLabor: true, packagingMaterialId: 1 });
  });

  test("meta de lucro por hora (#30): dica em R$ por mês e salva", async () => {
    const user = userEvent.setup();
    renderWithApp(<Preferences />);
    const meta = await screen.findByLabelText("Meta de lucro por hora de máquina");
    await user.clear(meta);
    await user.type(meta, "5");
    expect(screen.getByText(/8 h por dia, R\$\s5,00\/h ≈ R\$\s1\.200,00 por mês/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Salvar preferências" }));
    expect(await screen.findByText("Preferências salvas.")).toBeInTheDocument();
    expect((await settings()).targetProfitPerHour).toBe(5);
  });

  test("faixas de preço do canal (#31): só o que foi preenchido é gravado", async () => {
    const user = userEvent.setup();
    renderWithApp(<Preferences />);
    await user.click((await screen.findAllByText(/^Faixas de preço/))[0]); // Shopee
    await user.type(screen.getByLabelText("Frete por sua conta a partir de (Shopee)"), "79");
    await user.type(screen.getByLabelText("Custo desse frete (Shopee)"), "20");
    await user.type(screen.getAllByLabelText(/^Custo extra por venda/)[0], "2,5"); // #33
    await user.click(screen.getByRole("button", { name: "Salvar preferências" }));
    expect(await screen.findByText("Preferências salvas.")).toBeInTheDocument();
    const shopee = (await settings()).channels[0];
    expect(shopee).toEqual({ name: "Shopee", feePct: 20, feeFixed: 4, extraPerSale: 2.5, freeShippingAbove: 79, shippingCost: 20, checkedAt: expect.any(String) });
    expect((await settings()).channels[1]).not.toHaveProperty("extraPerSale");
  });

  test("canais prontos e data de conferência (#34): adicionar, conferir hoje, mexer na taxa também confere", async () => {
    const user = userEvent.setup();
    renderWithApp(<Preferences />);
    await screen.findByLabelText("Adicionar canal pronto");
    await open(user, "Canais de venda");
    await user.selectOptions(screen.getByLabelText("Adicionar canal pronto"), "Shein");
    expect(screen.getByDisplayValue("Shein")).toBeInTheDocument();
    expect(screen.getAllByText("Taxas ainda não conferidas por você.").length).toBeGreaterThan(1);
    await user.click(screen.getByRole("button", { name: "Conferi hoje (Shopee)" }));
    const tiktok = screen.getByDisplayValue("TikTok Shop").closest(".row")! as HTMLElement;
    await user.clear(within(tiktok).getByLabelText("Comissão (%)"));
    await user.type(within(tiktok).getByLabelText("Comissão (%)"), "13");
    await user.click(screen.getByRole("button", { name: "Salvar preferências" }));
    expect(await screen.findByText("Preferências salvas.")).toBeInTheDocument();
    const byName = Object.fromEntries((await settings()).channels.map((c: { name: string }) => [c.name, c]));
    const today = todayIso();
    expect(byName.Shopee.checkedAt).toBe(today);
    expect(byName["TikTok Shop"]).toMatchObject({ feePct: 13, checkedAt: today });
    expect(byName.Shein).toEqual({ name: "Shein", feePct: 16, feeFixed: 0 });
    expect(byName["Mercado Livre (clássico)"]).not.toHaveProperty("checkedAt");
  });

  test("falha por material (#35): só os preenchidos são gravados", async () => {
    const user = userEvent.setup();
    renderWithApp(<Preferences />);
    await user.click(await screen.findByText(/^Taxa de falha por material/));
    await user.type(screen.getByLabelText("Falha TPU (%)"), "12");
    await user.click(screen.getByRole("button", { name: "Salvar preferências" }));
    expect(await screen.findByText("Preferências salvas.")).toBeInTheDocument();
    expect((await settings()).failureByMaterial).toEqual({ TPU: 12 });
  });

  test("calcular o kWh pela conta de luz (#2): total ÷ kWh + bandeira, usa, guarda histórico e salvar não apaga", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 8, 15, 12));
    const user = userEvent.setup();
    renderWithApp(<Preferences />);
    await user.click(await screen.findByRole("button", { name: "Calcular pela conta de luz" }));
    const sheet = await screen.findByRole("dialog", { name: "Calcular pela conta de luz" });
    expect(within(sheet).getByRole("button", { name: "Usar este valor" })).toBeDisabled();
    await user.type(within(sheet).getByLabelText("Valor total da conta"), "276");
    await user.type(within(sheet).getByLabelText(/^kWh consumidos/), "300");
    expect(within(sheet).getByText("R$ 0,92", { selector: ".big", normalizer: (x) => x.replace(/\u00a0/g, " ") })).toBeInTheDocument();
    await user.click(within(sheet).getByRole("button", { name: "Amarela" }));
    await user.click(within(sheet).getByRole("button", { name: /Usar R\$\s0,94\/kWh/ }));

    expect(await screen.findByText(/Preço do kWh atualizado: R\$\s0,94\./)).toBeInTheDocument();
    expect(screen.getByLabelText("Preço do kWh")).toHaveValue("0,94");
    expect(await settings()).toMatchObject({ kwhPrice: 0.94, kwhHistory: [{ month: "2026-09", total: 276, kwh: 300, flag: "amarela", price: 0.94 }] });

    // salvar o resto das preferências não apaga o histórico
    await user.click(screen.getByRole("button", { name: "Salvar preferências" }));
    expect(await screen.findByText("Preferências salvas.")).toBeInTheDocument();
    expect((await settings()).kwhHistory).toHaveLength(1);

    // histórico aparece no assistente, com a variação
    vi.setSystemTime(new Date(2026, 9, 15, 12));
    await user.click(screen.getByRole("button", { name: "Calcular pela conta de luz" }));
    const again = await screen.findByRole("dialog", { name: "Calcular pela conta de luz" });
    await user.type(within(again).getByLabelText("Valor total da conta"), "300");
    await user.type(within(again).getByLabelText(/^kWh consumidos/), "300");
    await user.click(within(again).getByRole("button", { name: /Usar/ }));
    await waitFor(async () => expect((await settings()).kwhHistory.map((h: { month: string }) => h.month)).toEqual(["2026-10", "2026-09"]));
    await user.click(screen.getByRole("button", { name: "Calcular pela conta de luz" }));
    const list = within(await screen.findByRole("dialog", { name: "Calcular pela conta de luz" })).getByRole("list", { name: "Cálculos anteriores" });
    expect(list.textContent!.replace(/\u00a0/g, " ")).toContain("out/2026 · VerdeR$ 1,00/kWh▲ R$ 0,06 vs. set/2026");
    vi.useRealTimers();
  });

  test("conta com números trocados: avisa e deixa conferir", async () => {
    const user = userEvent.setup();
    renderWithApp(<Preferences />);
    await user.click(await screen.findByRole("button", { name: "Calcular pela conta de luz" }));
    const sheet = await screen.findByRole("dialog", { name: "Calcular pela conta de luz" });
    await user.type(within(sheet).getByLabelText("Valor total da conta"), "30");
    await user.type(within(sheet).getByLabelText(/^kWh consumidos/), "276");
    expect(within(sheet).getByText(/Confira se o total e os kWh não foram trocados/)).toBeInTheDocument();
  });

  test("canal sem nome e número inválido mostram erros e não salvam", async () => {
    const user = userEvent.setup();
    renderWithApp(<Preferences />);
    const mult = await screen.findByLabelText("Multiplicador para lojista / revenda (×)");
    await user.clear(mult);
    await user.type(mult, "abc");
    await open(user, "Canais de venda");
    await user.click(screen.getByRole("button", { name: "Adicionar canal" }));
    await user.click(screen.getByRole("button", { name: "Salvar preferências" }));

    // erros em "Preço de venda" e em "Canais de venda": fica onde está (já tem erro) e a lista marca as duas seções
    await screen.findByText(/Confira os canais/);
    const flags = within(screen.getByRole("navigation", { name: "Seções das Preferências" })).getAllByText("Corrigir");
    expect(flags).toHaveLength(2);
    expect(within(flags[0].closest("button")!).getByText("Preço de venda")).toBeInTheDocument();
    await open(user, /Preço de venda/);
    expect(await screen.findByText("Digite um número.")).toBeVisible();
    expect(await t.db.select("SELECT * FROM settings")).toEqual([]);
  });

  test("canal inválido sozinho mostra a mensagem de canais", async () => {
    const user = userEvent.setup();
    renderWithApp(<Preferences />);
    await screen.findByLabelText("Preço do kWh");
    await open(user, "Canais de venda");
    await user.click(screen.getByRole("button", { name: "Adicionar canal" }));
    await user.click(screen.getByRole("button", { name: "Salvar preferências" }));
    expect(await screen.findByText(/Confira os canais/)).toBeInTheDocument();
  });

  test("erro inesperado ao gravar aparece no fim do formulário", async () => {
    const user = userEvent.setup();
    renderWithApp(<Preferences />);
    const btn = await screen.findByRole("button", { name: "Salvar preferências" });
    t.handlers["plugin:sql|execute"] = () => {
      throw new Error("disco cheio");
    };
    await user.click(btn);
    expect(await screen.findByText("disco cheio")).toBeInTheDocument();
  });
});

describe("Preferências em seções (#179)", () => {
  const nav = () => screen.getByRole("navigation", { name: "Seções das Preferências" });

  test("a lista tem as 7 seções e abre na primeira; cada clique mostra só o painel dela", async () => {
    const user = userEvent.setup();
    renderWithApp(<Preferences />);
    await screen.findByLabelText("Preço do kWh");
    expect(within(nav()).getAllByRole("button").map((b) => b.textContent)).toEqual(["Custos da produção", "Preço de venda", "Falhas, impostos e custos fixos", "Canais de venda", "Aparência", "Seus dados", "Ferramentas"]);
    expect(within(nav()).getByRole("button", { name: "Custos da produção" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("heading", { name: "Custos da produção" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Preço de venda" })).not.toBeInTheDocument(); // painel escondido
    await user.click(within(nav()).getByRole("button", { name: "Ferramentas" }));
    expect(screen.getByRole("region", { name: "Ferramentas" })).toBeVisible();
    expect(screen.getByRole("heading", { name: /Inteligência artificial/ })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Custos da produção" })).not.toBeInTheDocument();
    expect(within(nav()).getByRole("button", { name: "Ferramentas" })).toHaveAttribute("aria-current", "page");
    expect(within(nav()).getByRole("button", { name: "Custos da produção" })).not.toHaveAttribute("aria-current");
  });

  test("o que foi digitado numa seção continua ao passear pelas outras e salva tudo de uma vez", async () => {
    const user = userEvent.setup();
    renderWithApp(<Preferences />);
    const kwh = await screen.findByLabelText("Preço do kWh");
    await user.clear(kwh);
    await user.type(kwh, "1,3");
    await open(user, "Aparência");
    expect(screen.getByText("Alterações não salvas")).toBeVisible(); // a barra aparece até fora do formulário, enquanto há o que salvar
    await open(user, "Preço de venda");
    await user.click(screen.getByRole("button", { name: "Salvar preferências" }));
    expect(await screen.findByText("Preferências salvas.")).toBeInTheDocument();
    expect(await settings()).toMatchObject({ kwhPrice: 1.3 });
  });

  test("salvar com erro em outra seção leva até ela e marca na lista", async () => {
    const user = userEvent.setup();
    renderWithApp(<Preferences />);
    const mult = await screen.findByLabelText("Multiplicador para lojista / revenda (×)");
    await user.clear(mult);
    await user.type(mult, "abc");
    await open(user, "Ferramentas"); // a barra de salvar continua à mão enquanto houver alteração
    await user.click(screen.getByRole("button", { name: "Salvar preferências" }));
    expect(await screen.findByText("Digite um número.")).toBeVisible();
    expect(within(nav()).getByRole("button", { name: /Preço de venda/ })).toHaveAttribute("aria-current", "page");
    expect(within(nav()).getByText("Corrigir")).toBeInTheDocument();
    await user.clear(screen.getByLabelText("Multiplicador para lojista / revenda (×)"));
    await user.type(screen.getByLabelText("Multiplicador para lojista / revenda (×)"), "3");
    await user.click(screen.getByRole("button", { name: "Salvar preferências" }));
    expect(await screen.findByText("Preferências salvas.")).toBeInTheDocument();
    expect(within(nav()).queryByText("Corrigir")).not.toBeInTheDocument(); // salvou: a marca some
  });

  test("a última seção aberta é lembrada; seções com cartão próprio não mostram o botão de salvar", async () => {
    const user = userEvent.setup();
    const first = renderWithApp(<Preferences />);
    await screen.findByLabelText("Preço do kWh");
    await open(user, "Seus dados");
    expect(screen.queryByRole("button", { name: "Salvar preferências" })).not.toBeInTheDocument();
    first.unmount();
    renderWithApp(<Preferences />);
    await screen.findByLabelText("Preço do kWh");
    expect(within(nav()).getByRole("button", { name: "Seus dados" })).toHaveAttribute("aria-current", "page");
  });

  test("aberta por um atalho com a seção pedida (ex.: a IA leva às Ferramentas), vence a lembrada", async () => {
    localStorage.setItem("upvision.prefsSection", "price");
    openWith("preferences", { section: "tools" });
    renderWithApp(<Preferences />);
    await screen.findByLabelText("Preço do kWh");
    expect(within(nav()).getByRole("button", { name: "Ferramentas" })).toHaveAttribute("aria-current", "page");
  });
});

describe("AiSettingsCard", () => {
  test("a chave é explicada em português: onde criar (com os nomes do site traduzidos) e o que é a API (UX M1)", async () => {
    renderWithApp(<AiSettingsCard />);
    expect(await screen.findByText(/Settings \(Configurações\) → Workspaces → escolha o workspace → API keys \(chaves de API\) → Create key \(criar chave\)/)).toBeInTheDocument();
    expect(screen.getByText(/chave de acesso \(a "API"\)/)).toBeInTheDocument();
    expect(screen.queryByText(/usa a API da Anthropic/)).not.toBeInTheDocument();
  });

  test("chave com formato errado é recusada sem gravar", async () => {
    const user = userEvent.setup();
    renderWithApp(<AiSettingsCard />);
    await user.type(screen.getByLabelText(/Chave da API/), "abc");
    await user.click(screen.getByRole("button", { name: "Salvar" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Isso não parece uma chave da Anthropic");
    expect(t.keychain.has("anthropic_api_key")).toBe(false);
    expect(await secret("anthropic_api_key")).toBeUndefined();
  });

  test("salva a chave e o modelo; depois dá para remover", async () => {
    const user = userEvent.setup();
    renderWithApp(<AiSettingsCard />);
    await user.type(screen.getByLabelText(/Chave da API/), KEY);
    await user.selectOptions(screen.getByLabelText("Modelo"), "claude-haiku-4-5");
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    expect(await screen.findByText("Preferências de IA salvas neste computador.")).toBeInTheDocument();
    expect(t.keychain.get("anthropic_api_key")).toBe(KEY); // no cofre de senhas do sistema (B26)
    expect(await secret("anthropic_api_key")).toBeUndefined(); // e não no banco
    expect(await secret("ai_model")).toBe("claude-haiku-4-5");
    expect(screen.getByText("salva")).toBeInTheDocument();
    expect(screen.getByLabelText(/Chave da API/)).toHaveValue("");

    await user.click(screen.getByRole("button", { name: "Remover chave" }));
    expect(await screen.findByText("Chave removida deste computador.")).toBeInTheDocument();
    expect(t.keychain.has("anthropic_api_key")).toBe(false);
    expect(await secret("anthropic_api_key")).toBeUndefined();
    expect(screen.queryByRole("button", { name: "Remover chave" })).not.toBeInTheDocument();
  });

  test("salvar sem digitar mantém a chave já guardada e troca só o modelo", async () => {
    await t.db.execute("INSERT INTO secrets (key, value) VALUES ('anthropic_api_key', ?), ('ai_model', 'meu-modelo')", [KEY]);
    const user = userEvent.setup();
    renderWithApp(<AiSettingsCard />);
    const id = await screen.findByLabelText(/^ID do modelo/);
    expect(id).toHaveValue("meu-modelo");
    expect(screen.getByLabelText("Modelo")).toHaveValue("custom");
    await user.clear(id);
    await user.type(id, "claude-novo");
    await user.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(async () => expect(await secret("ai_model")).toBe("claude-novo"));
    expect(t.keychain.get("anthropic_api_key")).toBe(KEY); // a chave antiga do banco foi para o cofre e a troca de modelo não a perdeu
  });

  test("testar sem chave pede para colar; com chave mostra o modelo", async () => {
    const user = userEvent.setup();
    renderWithApp(<AiSettingsCard />);
    await user.click(screen.getByRole("button", { name: "Testar chave" }));
    expect(await screen.findByText("Cole a chave primeiro.")).toBeInTheDocument();
    expect(testKey).not.toHaveBeenCalled();

    testKey.mockResolvedValue("Claude Sonnet 5");
    await user.type(screen.getByLabelText(/Chave da API/), KEY);
    await user.click(screen.getByRole("button", { name: "Testar chave" }));
    expect(await screen.findByText("Chave funcionando com Claude Sonnet 5. O teste não gera custo.")).toBeInTheDocument();
    expect(testKey).toHaveBeenCalledWith({ apiKey: KEY, workspaceId: null }, "claude-sonnet-5");
    expect(screen.getByRole("button", { name: "Testar chave" })).toBeEnabled();
  });

  test("workspace: formato errado é recusado; o certo é salvo e vai no teste; chave sem workspace mostra os passos (#157)", async () => {
    const user = userEvent.setup();
    renderWithApp(<AiSettingsCard />);
    await user.type(screen.getByLabelText(/Chave da API/), KEY);
    await user.type(screen.getByLabelText(/ID do workspace/), "default");
    await user.click(screen.getByRole("button", { name: "Salvar" }));
    expect(await screen.findByText(/O ID do workspace começa com wrkspc_/)).toBeInTheDocument();
    expect(await secret("ai_workspace_id")).toBeUndefined();

    await user.clear(screen.getByLabelText(/ID do workspace/));
    testKey.mockRejectedValueOnce(
      Anthropic.APIError.generate(400, { type: "error", error: { type: "invalid_request_error", message: "This API key is not scoped to a workspace" } }, "400 not scoped", new Headers()),
    );
    await user.click(screen.getByRole("button", { name: "Testar chave" }));
    expect(await screen.findByText("Esta chave não está ligada a um workspace, então a Anthropic recusou o pedido.")).toBeInTheDocument();
    expect(screen.getByText(/Settings → Workspaces e escolha o workspace/)).toBeInTheDocument();
    expect(screen.getByText("Ver detalhes")).toBeInTheDocument();

    await user.type(screen.getByLabelText(/ID do workspace/), "wrkspc_01JwQvzr7rXLA5AGx3HKfFUJ");
    testKey.mockResolvedValueOnce("Claude Sonnet 5");
    await user.click(screen.getByRole("button", { name: "Testar chave" }));
    expect(await screen.findByText(/Chave funcionando/)).toBeInTheDocument();
    expect(testKey).toHaveBeenLastCalledWith({ apiKey: KEY, workspaceId: "wrkspc_01JwQvzr7rXLA5AGx3HKfFUJ" }, "claude-sonnet-5");
    await user.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(async () => expect(await secret("ai_workspace_id")).toBe("wrkspc_01JwQvzr7rXLA5AGx3HKfFUJ"));
  });

  test("escolher 'Outro' mostra o campo de ID; voltar para um da lista esconde", async () => {
    const user = userEvent.setup();
    renderWithApp(<AiSettingsCard />);
    await user.selectOptions(screen.getByLabelText("Modelo"), "custom");
    expect(screen.getByLabelText(/^ID do modelo/)).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Modelo"), "claude-opus-5");
    expect(screen.queryByLabelText(/^ID do modelo/)).not.toBeInTheDocument();
  });

  test("erro da API no teste vira mensagem clara", async () => {
    testKey.mockImplementation(async () => {
      throw new Error("rede caiu");
    });
    const user = userEvent.setup();
    renderWithApp(<AiSettingsCard />);
    await user.type(screen.getByLabelText(/Chave da API/), KEY);
    await user.click(screen.getByRole("button", { name: "Testar chave" }));
    expect(await screen.findByText("rede caiu")).toBeInTheDocument();
  });

  test("falha ao ler ou gravar as preferências é mostrada", async () => {
    t.handlers["plugin:sql|select"] = () => {
      throw new Error("sem banco");
    };
    const user = userEvent.setup();
    renderWithApp(<AiSettingsCard />);
    expect(await screen.findByText("Erro ao ler as preferências de IA: sem banco")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Salvar" }));
    expect(await screen.findByText("sem banco", { selector: ".alert div" })).toBeInTheDocument();
  });
});

describe("Preferências: alterações não salvas (UX A2)", () => {
  test("a barra de baixo avisa da alteração, volta a 'Tudo salvo' ao salvar", async () => {
    const user = userEvent.setup();
    renderWithApp(<Preferences />);
    const kwh = await screen.findByLabelText("Preço do kWh");
    expect(screen.getByText("Tudo salvo")).toBeInTheDocument();
    await user.clear(kwh);
    await user.type(kwh, "1,10");
    expect(screen.getByText("Alterações não salvas")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Salvar preferências" }));
    expect(await screen.findByText("Tudo salvo")).toBeInTheDocument();
  });

  test("sair da tela com alteração válida salva sozinho e avisa", async () => {
    const user = userEvent.setup();
    const view = renderWithApp(<Preferences />);
    const kwh = await screen.findByLabelText("Preço do kWh");
    await user.clear(kwh);
    await user.type(kwh, "1,35");
    view.unmount();
    await waitFor(async () => {
      const [row] = await t.db.select<{ data: string }>("SELECT data FROM settings");
      expect(JSON.parse(row.data).kwhPrice).toBe(1.35);
    });
  });
});
