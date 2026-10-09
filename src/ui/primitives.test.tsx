// @vitest-environment happy-dom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Home, Plus, Printer } from "lucide-react";
import { useState } from "react";
import { describe, expect, test, vi } from "vitest";
import type { PageDef } from "../pages";
import Alert from "./Alert";
import Button from "./Button";
import Card from "./Card";
import ColorDots, { colorSwatch } from "./ColorDots";
import Dropzone from "./Dropzone";
import EmptyState from "./EmptyState";
import Field from "./Field";
import NumField, { inRange } from "./NumField";
import PageSkeleton from "./PageSkeleton";
import Segmented from "./Segmented";
import Sidebar from "./Sidebar";
import Slider from "./Slider";
import Toggle from "./Toggle";
import Toolbar from "./Toolbar";

describe("Button", () => {
  test("padrão é secundário, tipo button e sem classe", () => {
    render(<Button>Ok</Button>);
    const b = screen.getByRole("button", { name: "Ok" });
    expect(b).toHaveAttribute("type", "button");
    expect(b).not.toHaveAttribute("class");
  });

  test("variante, tamanho e classe extra viram classes; ícone é decorativo", async () => {
    const onClick = vi.fn();
    render(
      <Button variant="primary" size="lg" className="x" icon={Plus} type="submit" onClick={onClick}>
        Adicionar
      </Button>,
    );
    const b = screen.getByRole("button", { name: "Adicionar" });
    expect(b).toHaveClass("primary", "lg", "x");
    expect(b).toHaveAttribute("type", "submit");
    expect(b.querySelector("svg")).toHaveAttribute("aria-hidden");
    await userEvent.click(b);
    expect(onClick).toHaveBeenCalledOnce();
  });
});

describe("Card, Alert, EmptyState, PageSkeleton", () => {
  test("Card com título vira seção com cabeçalho; sem título não tem heading", () => {
    const { rerender } = render(
      <Card title="Custos" icon={Printer}>
        corpo
      </Card>,
    );
    expect(screen.getByRole("heading", { name: "Custos" })).toBeInTheDocument();
    rerender(<Card>só corpo</Card>);
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    expect(screen.getByText("só corpo")).toBeInTheDocument();
  });

  test("Alert de erro é anunciado como alert; os outros como status", () => {
    const { rerender } = render(<Alert kind="error">falhou</Alert>);
    expect(screen.getByRole("alert")).toHaveTextContent("falhou");
    rerender(<Alert kind="ok">deu certo</Alert>);
    expect(screen.getByRole("status")).toHaveTextContent("deu certo");
  });

  test("EmptyState mostra título, texto e ação", () => {
    render(
      <EmptyState icon={Home} title="Nada ainda." action={<button>Criar</button>}>
        Comece por aqui.
      </EmptyState>,
    );
    expect(screen.getByRole("heading", { name: "Nada ainda." })).toBeInTheDocument();
    expect(screen.getByText("Comece por aqui.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Criar" })).toBeInTheDocument();
  });

  test("PageSkeleton indica carregamento", () => {
    render(<PageSkeleton />);
    expect(screen.getByLabelText("Carregando")).toHaveAttribute("aria-busy", "true");
  });
});

describe("Field", () => {
  test("rótulo nomeia o controle; erro substitui a dica", () => {
    const { rerender } = render(
      <Field label="Nome" hint="Uma dica">
        <input />
      </Field>,
    );
    expect(screen.getByLabelText(/Nome/)).toBeInTheDocument();
    expect(screen.getByText("Uma dica")).toBeInTheDocument();
    rerender(
      <Field label="Nome" hint="Uma dica" error="Obrigatório.">
        <input />
      </Field>,
    );
    expect(screen.getByText("Obrigatório.")).toBeInTheDocument();
    expect(screen.queryByText("Uma dica")).not.toBeInTheDocument();
  });
});

describe("Toggle e Segmented", () => {
  test("Toggle é um switch que avisa o novo estado", async () => {
    const onChange = vi.fn();
    render(<Toggle label="Base" checked={false} onChange={onChange} />);
    await userEvent.click(screen.getByRole("switch", { name: "Base" }));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  test("Segmented marca a opção atual e troca ao clicar", async () => {
    function Demo() {
      const [v, setV] = useState<"a" | "b">("a");
      return <Segmented label="Modo" value={v} onChange={setV} options={[["a", "Logo"], ["b", "Silhueta"]]} full />;
    }
    render(<Demo />);
    expect(screen.getByRole("group", { name: "Modo" })).toHaveClass("full");
    expect(screen.getByRole("button", { name: "Logo" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByRole("button", { name: "Silhueta" }));
    expect(screen.getByRole("button", { name: "Silhueta" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Logo" })).toHaveAttribute("aria-pressed", "false");
  });
});

describe("Slider", () => {
  test("mostra o valor formatado, preenche o trilho e devolve número", () => {
    const onChange = vi.fn();
    render(<Slider label="Detalhe" min={0} max={200} value={50} onChange={onChange} display={(v) => `${v}%`} hint="dica" />);
    const input = screen.getByRole("slider", { name: /Detalhe/ });
    expect(screen.getByText("50%")).toBeInTheDocument();
    expect(input.style.getPropertyValue("--fill")).toBe("25%");
    fireEvent.change(input, { target: { value: "120" } });
    expect(onChange).toHaveBeenCalledWith(120);
    expect(screen.getByText("dica")).toBeInTheDocument();
  });
});

describe("NumField", () => {
  test("valor dentro da faixa mostra a dica; fora da faixa marca inválido com a faixa", () => {
    const { rerender } = render(<NumField label="Altura" value={2} onChange={() => {}} min={1} max={5} hint="em mm" />);
    const input = screen.getByRole("spinbutton", { name: /Altura \(mm\)/ });
    expect(input).toHaveAttribute("aria-invalid", "false");
    expect(screen.getByText("em mm")).toBeInTheDocument();
    rerender(<NumField label="Altura" value={9} onChange={() => {}} min={1} max={5} hint="em mm" />);
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Use entre 1 e 5.")).toBeInTheDocument();
  });

  test("NaN deixa o campo vazio e inválido; digitar devolve número", () => {
    const onChange = vi.fn();
    render(<NumField label="Raio" value={NaN} onChange={onChange} unit="" />);
    const input = screen.getByRole("spinbutton", { name: /^Raio/ });
    expect(input).toHaveValue(null);
    expect(input).toHaveAttribute("aria-invalid", "true");
    fireEvent.change(input, { target: { value: "3.5" } });
    expect(onChange).toHaveBeenCalledWith(3.5);
  });

  test("mensagem de erro sem buracos quando falta limite", () => {
    const { rerender } = render(<NumField label="Raio" value={NaN} onChange={() => {}} unit="" />);
    expect(screen.getByText("Digite um número.")).toBeInTheDocument();
    rerender(<NumField label="Raio" value={0} onChange={() => {}} unit="" min={1} />);
    expect(screen.getByText("No mínimo 1.")).toBeInTheDocument();
    rerender(<NumField label="Raio" value={9} onChange={() => {}} unit="" max={5} />);
    expect(screen.getByText("No máximo 5.")).toBeInTheDocument();
    rerender(<NumField label="Raio" value={0.5} onChange={() => {}} unit="" min={1} max={5} />);
    expect(screen.getByText("Use entre 1 e 5.")).toBeInTheDocument();
  });

  test("medida em cm digitada por engano: mostra o equivalente, a faixa em mm e cm e sugere ×10 (#194)", () => {
    const onChange = vi.fn();
    const { rerender } = render(<NumField label="Largura" value={350} onChange={onChange} min={50} max={1000} cm />);
    expect(screen.getByText(/= 35 cm/)).toBeInTheDocument();
    expect(screen.queryByText(/Você quis dizer/)).not.toBeInTheDocument();
    rerender(<NumField label="Largura" value={35} onChange={onChange} min={50} max={1000} cm />);
    expect(screen.getByText("Use entre 50 e 1.000 mm (5 e 100 cm).")).toBeInTheDocument();
    expect(screen.getByText(/Você quis dizer 35 cm \(350 mm\)\?/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Usar 350 mm" }));
    expect(onChange).toHaveBeenCalledWith(350);
    // o nome do campo não ganha o texto da sugestão nem o "= cm"
    expect(screen.getByRole("spinbutton", { name: "Largura (mm) Use entre 50 e 1.000 mm (5 e 100 cm)." })).toBeInTheDocument();
  });

  test("sem cm o campo continua como antes; sugestão só quando ×10 cabe na faixa", () => {
    const { rerender } = render(<NumField label="Altura" value={3} onChange={() => {}} min={50} max={1000} />);
    expect(screen.queryByText(/Você quis dizer/)).not.toBeInTheDocument();
    expect(screen.getByText("Use entre 50 e 1.000.")).toBeInTheDocument();
    rerender(<NumField label="Altura" value={3} onChange={() => {}} min={50} max={1000} cm />);
    expect(screen.queryByText(/Você quis dizer/)).not.toBeInTheDocument(); // 30 mm ainda abaixo do mínimo
    rerender(<NumField label="Altura" value={4000} onChange={() => {}} min={50} max={1000} cm />);
    expect(screen.queryByText(/Você quis dizer/)).not.toBeInTheDocument();
    expect(screen.getByText("Use entre 50 e 1.000 mm (5 e 100 cm).")).toBeInTheDocument();
  });

  test("inRange respeita limites e rejeita NaN", () => {
    expect(inRange(1, 1, 2)).toBe(true);
    expect(inRange(2.1, 1, 2)).toBe(false);
    expect(inRange(NaN, 0, 9)).toBe(false);
  });
});

describe("ColorDots", () => {
  test("colorSwatch resolve nome, hex e desconhecido", () => {
    expect(colorSwatch(" azul ")).toBe("#2563eb");
    expect(colorSwatch("#12AB34")).toBe("#12AB34");
    expect(colorSwatch("Furta-cor")).toBeNull();
  });

  test("marca a cor escolhida e troca ao clicar em outra", async () => {
    const onChange = vi.fn();
    render(<ColorDots label="Cor" value="Preto" onChange={onChange} error="Escolha uma cor." />);
    expect(screen.getByRole("radio", { name: "Preto" })).toHaveAttribute("aria-checked", "true");
    await userEvent.click(screen.getByRole("radio", { name: "Vermelho" }));
    expect(onChange).toHaveBeenCalledWith("Vermelho");
    expect(screen.getByText("Escolha uma cor.")).toBeInTheDocument();
  });

  test("hex personalizado aparece como 'Personalizada' e no seletor; texto livre aparece como digitado", () => {
    const { rerender } = render(<ColorDots label="Cor" value="#ff0000" onChange={() => {}} />);
    expect(screen.getByText("Personalizada")).toBeInTheDocument();
    expect(screen.getByLabelText("Outra cor")).toHaveValue("#ff0000");
    rerender(<ColorDots label="Cor" value="Furta-cor" onChange={() => {}} />);
    expect(screen.getByText("Furta-cor")).toBeInTheDocument();
  });

  test("seletor 'Outra cor' grava o hex", () => {
    const onChange = vi.fn();
    render(<ColorDots label="Cor" value="" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Outra cor"), { target: { value: "#00ff00" } });
    expect(onChange).toHaveBeenCalledWith("#00ff00");
  });
});

describe("Dropzone", () => {
  const file = new File(["x"], "logo.png", { type: "image/png" });

  test("soltar um arquivo entrega o arquivo e tira o destaque", () => {
    const onFile = vi.fn();
    render(<Dropzone accept="image/*" label="Arraste" hint="PNG" onFile={onFile} />);
    const zone = screen.getByRole("button", { name: /Arraste/ });
    fireEvent.dragOver(zone);
    expect(zone).toHaveClass("over");
    fireEvent.dragLeave(zone);
    expect(zone).not.toHaveClass("over");
    fireEvent.drop(zone, { dataTransfer: { files: [file] } });
    expect(onFile).toHaveBeenCalledWith(file);
    expect(screen.getByText("PNG")).toBeInTheDocument();
  });

  test("soltar sem arquivo não chama onFile", () => {
    const onFile = vi.fn();
    render(<Dropzone accept="image/*" label="Arraste" onFile={onFile} />);
    fireEvent.drop(screen.getByRole("button"), { dataTransfer: { files: [] } });
    expect(onFile).not.toHaveBeenCalled();
  });

  test("clique, Enter e Espaço abrem o seletor; escolher entrega o arquivo", async () => {
    const onFile = vi.fn();
    const { container } = render(<Dropzone accept="image/*" label="Arraste" onFile={onFile} />);
    const input = container.querySelector<HTMLInputElement>("input[type=file]")!;
    // o navegador ignora click() reentrante (o evento sobe até a zona); o happy-dom não, então só contamos.
    const click = vi.spyOn(input, "click").mockImplementation(() => {});
    const zone = screen.getByRole("button");
    await userEvent.click(zone);
    fireEvent.keyDown(zone, { key: "Enter" });
    fireEvent.keyDown(zone, { key: " " });
    fireEvent.keyDown(zone, { key: "a" });
    expect(click).toHaveBeenCalledTimes(3);
    await userEvent.upload(input, file);
    expect(onFile).toHaveBeenCalledWith(file);
  });
});

describe("Toolbar", () => {
  test("título pequeno só é anunciado quando rolou; ações aparecem", () => {
    const { rerender, container } = render(
      <Toolbar title="Filamentos" icon={Printer} scrolled={false}>
        <button>Buscar</button>
      </Toolbar>,
    );
    expect(container.querySelector(".title")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByRole("button", { name: "Buscar" })).toBeInTheDocument();
    rerender(<Toolbar title="Filamentos" scrolled />);
    expect(container.querySelector(".toolbar")).toHaveClass("scrolled");
    expect(container.querySelector(".title")).toHaveAttribute("aria-hidden", "false");
    expect(container.querySelector(".actions")).toBeNull();
  });
});

describe("Sidebar (#139)", () => {
  const pages: PageDef[] = [
    { id: "home", section: "home", label: "Início", group: "", icon: Home, render: () => null },
    { id: "create", section: "create", label: "Criar", group: "", icon: Plus, render: () => null },
    { id: "keychain", section: "create", label: "Chaveiros", group: "Ferramentas", icon: Plus, render: () => null },
    { id: "orders", section: "sell", label: "Pedidos", group: "Gestão", icon: Plus, render: () => null },
    { id: "calculator", section: "sell", label: "Calculadora", group: "Gestão", icon: Plus, render: () => null },
    { id: "filaments", section: "stock", label: "Filamentos", group: "Gestão", icon: Plus, render: () => null },
    { id: "preferences", section: "settings", label: "Preferências", group: "Preferências", icon: Plus, render: () => null },
  ];
  const noop = { onNavigate: () => {}, onNews: () => {}, onSuggest: () => {}, onBackup: () => {}, onRestore: () => {} };

  test("seções sempre à vista; só a aberta mostra as telas dela, com a atual marcada", () => {
    render(<Sidebar pages={pages} current="calculator" {...noop} />);
    for (const s of ["Início", "Criar", "Vender", "Estoque", "Resultados", "Ajustes"]) expect(screen.getByRole("button", { name: s })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Calculadora" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "Pedidos" })).not.toHaveAttribute("aria-current");
    expect(screen.queryByRole("button", { name: "Filamentos" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Chaveiros" })).not.toBeInTheDocument(); // ferramentas ficam na galeria
  });

  test("recolher: o botão alterna e diz o atalho; recolhida, o ícone mostra a dica ao lado sem abrir a barra (#167)", async () => {
    const onToggle = vi.fn();
    const { rerender } = render(<Sidebar pages={pages} current="home" {...noop} onToggle={onToggle} />);
    const user = userEvent.setup();
    const btn = screen.getByRole("button", { name: "Recolher barra lateral" });
    expect(btn).toHaveAttribute("aria-keyshortcuts", "Meta+Alt+S Control+Alt+S");
    await user.click(btn);
    expect(onToggle).toHaveBeenCalledOnce();
    await user.hover(screen.getByRole("button", { name: "Vender" }));
    expect(document.querySelector(".rail-tip")).toBeNull(); // aberta: sem dica
    rerender(<Sidebar pages={pages} current="home" {...noop} onToggle={onToggle} rail />);
    expect(screen.getByRole("button", { name: "Expandir barra lateral" })).toBeInTheDocument();
    await user.unhover(screen.getByRole("button", { name: "Vender" }));
    await user.hover(screen.getByRole("button", { name: "Vender" }));
    await waitFor(() => expect(document.querySelector(".rail-tip")).toHaveTextContent("Vender"));
    await user.unhover(screen.getByRole("button", { name: "Vender" }));
    await user.hover(screen.getByRole("navigation"));
    await user.unhover(screen.getByRole("navigation"));
    expect(document.querySelector(".rail-tip")).toBeNull();
    expect(onToggle).toHaveBeenCalledOnce(); // passar o mouse nunca abre a barra
  });

  test("a ferramenta aberta aparece embaixo de Criar", () => {
    render(<Sidebar pages={pages} current="keychain" {...noop} />);
    expect(screen.getByRole("button", { name: "Chaveiros" })).toHaveAttribute("aria-current", "page");
  });

  test("seção abre a tela dela; Ajustes traz backup, novidades e sugestão; a marca volta ao início", async () => {
    const h = { onNavigate: vi.fn(), onNews: vi.fn(), onSuggest: vi.fn(), onBackup: vi.fn(), onRestore: vi.fn() };
    render(<Sidebar pages={pages} current="preferences" {...h} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "UpVision Maker" }));
    await user.click(screen.getByRole("button", { name: "Estoque" }));
    await user.click(screen.getByRole("button", { name: "Sugerir ferramenta" }));
    await user.click(screen.getByRole("button", { name: "O que há de novo" }));
    await user.click(screen.getByRole("button", { name: "Fazer backup" }));
    await user.click(screen.getByRole("button", { name: "Restaurar backup" }));
    expect(h.onNavigate.mock.calls).toEqual([["home"], ["filaments"]]);
    expect(h.onSuggest).toHaveBeenCalledOnce();
    expect(h.onNews).toHaveBeenCalledOnce();
    expect(h.onBackup).toHaveBeenCalledOnce();
    expect(h.onRestore).toHaveBeenCalledOnce();
  });
});
