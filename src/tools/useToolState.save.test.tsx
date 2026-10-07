// @vitest-environment happy-dom
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { expect, test } from "vitest";
import { toolState } from "../db/toolStateRepo";
import { renderWithApp, setupTauri } from "../test/harness";
import { flushPendingSaves } from "./pendingSaves";
import { useToolState } from "./useToolState";

/** Auditoria 2026-10, M14: o "seu trabalho ficou guardado" só vale se o rascunho foi mesmo gravado. */
const t = setupTauri();

/** A ferramenta e um botão "sair" no mesmo app (mesmo ToastProvider): trocar de tela desmonta só a ferramenta. */
function Probe() {
  const [show, setShow] = useState(true);
  return (
    <>
      <button onClick={() => setShow(false)}>sair da tela</button>
      {show ? <Tool /> : <p>outra tela</p>}
    </>
  );
}
function Tool() {
  const tool = useToolState("probe", { text: "" }, { label: "Chaveiro" });
  return <input aria-label="texto" value={tool.state.text} onChange={(e) => tool.field("text")(e.target.value)} />;
}
const saved = async () => (await toolState.get(t.db, "probe"))?.data;

test("trocar de tela antes de 0,8 s grava a última edição, em vez de descartar", async () => {
  renderWithApp(<Probe />);
  await screen.findByLabelText("texto");
  fireEvent.change(screen.getByLabelText("texto"), { target: { value: "Ana" } });
  fireEvent.click(screen.getByText("sair da tela")); // sai da tela logo depois de digitar
  await waitFor(async () => expect(await saved()).toContain("Ana"));
});

test("o aviso 'ficou guardado' só aparece depois da gravação", async () => {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  t.handlers["plugin:sql|execute"] = (args) => {
    // segura a gravação do rascunho até a gente liberar
    if (String(args.query).includes("tool_state")) return gate.then(() => [1, 1]);
    return [1, 1];
  };
  renderWithApp(<Probe />);
  await screen.findByLabelText("texto");
  fireEvent.change(screen.getByLabelText("texto"), { target: { value: "Ana" } });
  fireEvent.click(screen.getByText("sair da tela"));
  await act(async () => {
    await new Promise((r) => setTimeout(r, 50));
  });
  expect(screen.queryByText(/ficou guardado/)).toBeNull(); // ainda gravando: não diz que guardou
  await act(async () => release());
  expect(await screen.findByText(/Chaveiro: seu trabalho ficou guardado/)).toBeInTheDocument();
});

test("falha ao gravar o rascunho: avisa que não guardou, em vez de dizer que guardou", async () => {
  t.handlers["plugin:sql|execute"] = (args) => {
    if (String(args.query).includes("tool_state")) throw new Error("disco cheio");
    return [1, 1];
  };
  renderWithApp(<Probe />);
  await screen.findByLabelText("texto");
  fireEvent.change(screen.getByLabelText("texto"), { target: { value: "Ana" } });
  fireEvent.click(screen.getByText("sair da tela"));
  expect(await screen.findByText(/Chaveiro: não deu para guardar o seu trabalho/)).toBeInTheDocument();
  expect(screen.queryByText(/ficou guardado/)).toBeNull();
});

test("flushPendingSaves ao fechar a janela grava o que ainda esperava", async () => {
  renderWithApp(<Probe />);
  await screen.findByLabelText("texto");
  fireEvent.change(screen.getByLabelText("texto"), { target: { value: "Bia" } });
  await flushPendingSaves();
  expect(await saved()).toContain("Bia");
});

test("Ctrl+Y refaz fora do Mac, além de Ctrl+Shift+Z (B21)", async () => {
  const { useToolState: use } = await import("./useToolState");
  function Undoable() {
    const tool = use("probe2", { n: 0 }, { label: "Probe" });
    return (
      <>
        <output aria-label="n">{tool.state.n}</output>
        <button onClick={() => tool.field("n")(tool.state.n + 1)}>soma</button>
      </>
    );
  }
  const { getByText } = renderWithApp(<Undoable />);
  await screen.findByLabelText("n");
  fireEvent.click(getByText("soma"));
  expect(screen.getByLabelText("n")).toHaveTextContent("1");
  fireEvent.keyDown(window, { key: "z", ctrlKey: true }); // desfaz
  expect(screen.getByLabelText("n")).toHaveTextContent("0");
  fireEvent.keyDown(window, { key: "y", ctrlKey: true }); // refaz
  expect(screen.getByLabelText("n")).toHaveTextContent("1");
});
