// @vitest-environment happy-dom
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { renderWithApp, setupTauri } from "../test/harness";
import CompanyPage from "./Company";

const logo = vi.hoisted(() => ({ fail: false }));
vi.mock("../ui/photo", () => ({
  logoToDataUrl: async () => {
    if (logo.fail) throw new Error("Foto maior que 25 MB.");
    return "data:image/png;base64,TE9HTw==";
  },
}));

const t = setupTauri();
const saved = async () => JSON.parse((await t.db.select<{ data: string }>("SELECT data FROM company"))[0].data);

describe("Dados da empresa", () => {
  test("Pix inválido avisa na hora; válido mostra o QR e salva normalizado", async () => {
    const user = userEvent.setup();
    renderWithApp(<CompanyPage />);
    await user.type(await screen.findByLabelText("Nome / razão social"), "UpVision 3D");
    await user.type(screen.getAllByLabelText("Cidade")[0], "Rio de Janeiro");
    const pix = screen.getByLabelText(/^Chave Pix/);
    await user.type(pix, "123.456.789-00");
    expect(screen.getByText("CPF da chave Pix inválido: confira os números.")).toBeInTheDocument();
    expect(pix).toHaveAttribute("aria-invalid", "true");
    expect(screen.queryByRole("img", { name: "Prévia do QR Pix" })).not.toBeInTheDocument();
    await user.clear(pix);
    await user.type(pix, "529.982.247-25");
    expect(screen.getByRole("img", { name: "Prévia do QR Pix" }).innerHTML).toContain("<svg");
    // placeholders do recebedor vêm do nome e da cidade da empresa
    expect(screen.getByLabelText("Nome de quem recebe")).toHaveAttribute("placeholder", "UpVision 3D");
    expect(screen.getAllByLabelText("Cidade")[1]).toHaveAttribute("placeholder", "Rio de Janeiro");
    await user.click(screen.getByRole("button", { name: "Salvar dados" }));
    expect(await screen.findByText("Dados da empresa salvos.")).toBeInTheDocument();
    expect(await saved()).toMatchObject({ name: "UpVision 3D", city: "Rio de Janeiro", pixKey: "52998224725", quoteValidityDays: 7 });
  });

  test("prefixo do número do orçamento (#36): prévia e salva; símbolo é recusado", async () => {
    const user = userEvent.setup();
    renderWithApp(<CompanyPage />);
    await user.type(await screen.findByLabelText("Nome / razão social"), "UpVision 3D");
    const prefix = screen.getByLabelText(/^Prefixo do número/);
    expect(prefix).toHaveValue("ORC");
    await user.clear(prefix);
    await user.type(prefix, "UPV");
    expect(screen.getByText(`Fica assim: UPV-${new Date().getFullYear()}-001`)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Salvar dados" }));
    expect(await screen.findByText("Dados da empresa salvos.")).toBeInTheDocument();
    expect((await saved()).quotePrefix).toBe("UPV");
    await user.type(prefix, "/");
    await user.click(screen.getByRole("button", { name: "Salvar dados" }));
    expect(await screen.findByText("Só letras e números.")).toBeInTheDocument();
  });

  test("Pix sem nome/cidade do recebedor explica o que falta", async () => {
    const user = userEvent.setup();
    renderWithApp(<CompanyPage />);
    await user.type(await screen.findByLabelText(/^Chave Pix/), "ana@exemplo.com");
    expect(screen.getByText("Informe o nome de quem recebe o Pix.")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Nome de quem recebe"), "Ana");
    expect(screen.getByText("Informe a cidade de quem recebe o Pix.")).toBeInTheDocument();
  });

  test("carrega o que já estava salvo e valida documento, e-mail e validade", async () => {
    t.raw.exec(`INSERT INTO company (id, data) VALUES (1, '{"name":"Loja","email":"a@b.co","quoteValidityDays":15}')`);
    const user = userEvent.setup();
    renderWithApp(<CompanyPage />);
    expect(await screen.findByLabelText("Nome / razão social")).toHaveValue("Loja");
    const validity = screen.getByLabelText(/^Validade padrão/);
    expect(validity).toHaveValue("15");
    await user.clear(validity);
    await user.type(validity, "400");
    await user.type(screen.getByLabelText(/^CPF ou CNPJ/), "11.111.111/1111-11");
    await user.clear(screen.getByLabelText(/^E-mail/));
    await user.type(screen.getByLabelText(/^E-mail/), "sem-arroba");
    await user.click(screen.getByRole("button", { name: "Salvar dados" }));
    expect(await screen.findByText("Use de 1 a 365 dias.")).toBeInTheDocument();
    expect(screen.getByText("CNPJ inválido: confira os números.")).toBeInTheDocument();
    expect(screen.getByText("E-mail inválido.")).toBeInTheDocument();
    expect(await saved()).toEqual({ name: "Loja", email: "a@b.co", quoteValidityDays: 15 }); // nada gravado
  });

  test("dados corrompidos no banco caem no padrão", async () => {
    t.raw.exec(`INSERT INTO company (id, data) VALUES (1, '{"quoteValidityDays":0}')`);
    renderWithApp(<CompanyPage />);
    expect(await screen.findByLabelText(/^Validade padrão/)).toHaveValue("7");
    await waitFor(() => expect(t.log.join("\n")).toContain("quoteValidityDays")); // o campo descartado vai para o registro (A3)
  });

  test("logo: envia, troca e remove; erro de imagem vira aviso", async () => {
    const user = userEvent.setup();
    const { container } = renderWithApp(<CompanyPage />);
    await screen.findByText("Sem logo");
    const input = () => container.querySelector<HTMLInputElement>('input[type="file"]')!;
    await user.upload(input(), new File(["x"], "logo.png", { type: "image/png" }));
    expect(await screen.findByAltText("Logo da empresa")).toHaveAttribute("src", "data:image/png;base64,TE9HTw==");
    expect(screen.getByText("Trocar logo")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Salvar dados" }));
    await screen.findByText("Dados da empresa salvos.");
    expect((await saved()).logo).toBe("data:image/png;base64,TE9HTw==");

    await user.click(screen.getByRole("button", { name: "Remover logo" }));
    expect(screen.getByText("Sem logo")).toBeInTheDocument();

    logo.fail = true;
    await user.upload(input(), new File(["x"], "grande.png", { type: "image/png" }));
    expect(await screen.findByText("Foto maior que 25 MB.")).toBeInTheDocument();
    logo.fail = false;
  });

  test("erro ao gravar aparece no formulário", async () => {
    const user = userEvent.setup();
    renderWithApp(<CompanyPage />);
    await screen.findByLabelText("Nome / razão social");
    t.handlers["plugin:sql|execute"] = () => {
      throw new Error("somente leitura");
    };
    await user.click(screen.getByRole("button", { name: "Salvar dados" }));
    await waitFor(() => expect(screen.getByText("somente leitura")).toBeInTheDocument());
  });
});
