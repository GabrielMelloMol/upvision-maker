// @vitest-environment happy-dom
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { renderWithApp, setupTauri } from "../test/harness";
import AiSettingsCard from "./AiSettingsCard";
import Preferences from "./Preferences";

const testKey = vi.hoisted(() => vi.fn());
vi.mock("../ai/claude", async (orig) => ({ ...(await orig<typeof import("../ai/claude")>()), testKey }));

const t = setupTauri();
const KEY = "sk-ant-api03-abcdefghijklmnopqrstuvwxyz";
const secret = async (k: string) => (await t.db.select<{ value: string }>("SELECT value FROM secrets WHERE key = ?", [k]))[0]?.value;
const settings = async () => JSON.parse((await t.db.select<{ data: string }>("SELECT data FROM settings"))[0].data);

beforeEach(() => void testKey.mockClear());

describe("Preferences", () => {
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
    expect(s.channels[2]).toEqual({ name: "Feira", feePct: 5, feeFixed: 1.5 });
  });

  test("falhas, impostos e custos fixos (#22): horas só com custos fixos ligados; jeito antigo do multiplicador", async () => {
    await t.db.execute("INSERT INTO materials (name, unit, unitPrice) VALUES ('Caixinha', 'un', 2)");
    const user = userEvent.setup();
    renderWithApp(<Preferences />);
    const fail = await screen.findByLabelText("Taxa de falha (%)");
    expect(fail).toHaveValue("5");
    await user.clear(fail);
    await user.type(fail, "10");
    await user.clear(screen.getByLabelText("Impostos sobre a venda (%)"));
    await user.type(screen.getByLabelText("Impostos sobre a venda (%)"), "6");
    const hours = screen.getByLabelText("Horas de impressão por mês");
    expect(hours).toBeDisabled();
    await user.click(screen.getByRole("checkbox", { name: "Incluir custos fixos no preço" }));
    expect(hours).toBeEnabled();
    await user.clear(hours);
    await user.type(hours, "80");
    await user.click(screen.getByRole("checkbox", { name: /jeito antigo/ }));
    await user.selectOptions(screen.getByLabelText(/^Embalagem padrão/), "Caixinha");
    expect(screen.getByText(/loja, papelaria.*markup 200 %/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Salvar preferências" }));
    expect(await screen.findByText("Preferências salvas.")).toBeInTheDocument();
    expect(await settings()).toMatchObject({ failurePct: 10, taxPct: 6, includeFixedCosts: true, productiveHoursMonth: 80, multiplyLabor: true, packagingMaterialId: 1 });
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
    await user.click(screen.getByRole("button", { name: "Adicionar canal" }));
    await user.click(screen.getByRole("button", { name: "Salvar preferências" }));

    expect(await screen.findByText("Digite um número.")).toBeInTheDocument();
    expect(await t.db.select("SELECT * FROM settings")).toEqual([]);
  });

  test("canal inválido sozinho mostra a mensagem de canais", async () => {
    const user = userEvent.setup();
    renderWithApp(<Preferences />);
    await user.click(await screen.findByRole("button", { name: "Adicionar canal" }));
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

describe("AiSettingsCard", () => {
  test("chave com formato errado é recusada sem gravar", async () => {
    const user = userEvent.setup();
    renderWithApp(<AiSettingsCard />);
    await user.type(screen.getByLabelText(/Chave da API/), "abc");
    await user.click(screen.getByRole("button", { name: "Salvar" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Isso não parece uma chave da Anthropic");
    expect(await secret("anthropic_api_key")).toBeUndefined();
  });

  test("salva a chave e o modelo; depois dá para remover", async () => {
    const user = userEvent.setup();
    renderWithApp(<AiSettingsCard />);
    await user.type(screen.getByLabelText(/Chave da API/), KEY);
    await user.selectOptions(screen.getByLabelText("Modelo"), "claude-haiku-4-5");
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    expect(await screen.findByText("Preferências de IA salvas neste computador.")).toBeInTheDocument();
    expect(await secret("anthropic_api_key")).toBe(KEY);
    expect(await secret("ai_model")).toBe("claude-haiku-4-5");
    expect(screen.getByText("salva")).toBeInTheDocument();
    expect(screen.getByLabelText(/Chave da API/)).toHaveValue("");

    await user.click(screen.getByRole("button", { name: "Remover chave" }));
    expect(await screen.findByText("Chave removida deste computador.")).toBeInTheDocument();
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
    expect(await secret("anthropic_api_key")).toBe(KEY);
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
    expect(testKey).toHaveBeenCalledWith(KEY, "claude-sonnet-5");
    expect(screen.getByRole("button", { name: "Testar chave" })).toBeEnabled();
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
