// @vitest-environment happy-dom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";

const saved: { name: string; data: string | Uint8Array }[] = [];
vi.mock("../ui/saveFile", async (orig) => ({
  ...(await orig<typeof import("../ui/saveFile")>()),
  saveFile: vi.fn(async (name: string, data: string | Uint8Array) => (saved.push({ name, data }), `/saida/${name}`)),
}));
vi.mock("../db", () => ({ getDb: () => Promise.reject(new Error("sem banco")) }));
vi.mock("../pdf/fonts", async () => {
  const { readFileSync } = await import("node:fs");
  const { resolve } = await import("node:path");
  const f = (n: string) => new Uint8Array(readFileSync(resolve(__dirname, "../assets/pdf-fonts", n)));
  return { loadPdfFonts: async () => ({ regular: f("Inter-Regular.ttf"), semibold: f("Inter-SemiBold.ttf"), bold: f("Inter-Bold.ttf") }) };
});
vi.mock("./QrScanner", () => ({ default: () => null }));

import { ToastProvider } from "../ui/Toast";
import Protect from "./Protect";

const ABC = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
const file = (name: string, content: string) => new File([content], name);
const setup = () => render(<ToastProvider><Protect /></ToastProvider>);
const drop = () => [...document.querySelectorAll<HTMLInputElement>('input[type="file"]')];

beforeEach(() => {
  saved.length = 0;
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

test("escolher o arquivo mostra o nome, o tamanho e o SHA-256 (vetor 'abc'), e o título vem do nome", async () => {
  setup();
  await userEvent.setup({ applyAccept: false }).upload(drop()[0], file("gato.stl", "abc"));
  expect(await screen.findByLabelText("Hash SHA-256 do arquivo")).toHaveTextContent(ABC.slice(0, 8));
  expect(screen.getByText(/BA78-16BF-8F01/)).toBeInTheDocument();
  expect(screen.getByLabelText(/^Obra ou peça/)).toHaveValue("gato");
});

test("salva o certificado em PDF e o .json, que volta como certificado válido na conferência", async () => {
  setup();
  const user = userEvent.setup({ applyAccept: false });
  await user.upload(drop()[0], file("gato.stl", "abc"));
  await screen.findByLabelText("Hash SHA-256 do arquivo");
  await user.type(screen.getByLabelText(/^Autor ou loja/), "Loja da Ana");
  await user.click(screen.getByRole("button", { name: /Salvar certificado \(PDF\)/ }));
  await waitFor(() => expect(saved.some((s) => s.name === "certificado-gato-stl.pdf")).toBe(true));
  const pdf = saved.find((s) => s.name.endsWith(".pdf"))!.data as Uint8Array;
  expect(new TextDecoder().decode(pdf.slice(0, 5))).toBe("%PDF-");
  await user.click(screen.getByRole("button", { name: /Salvar dados para conferir depois/ }));
  const json = saved.find((s) => s.name.endsWith(".json"))!.data as string;
  expect(JSON.parse(json)).toMatchObject({ version: 1, sha256: ABC, name: "gato.stl", author: "Loja da Ana" });
});

test("conferir: mesmo arquivo confere (hash digitado com espaços e maiúsculas); outro arquivo não confere e explica", async () => {
  setup();
  const user = userEvent.setup({ applyAccept: false });
  await user.upload(drop()[1], file("gato.stl", "abc"));
  await user.type(screen.getByLabelText(/^Hash do certificado/), ABC.toUpperCase().match(/.{8}/g)!.join(" "));
  expect(await screen.findByText(/Confere\./)).toBeInTheDocument();
  await user.upload(drop()[1], file("gato-editado.stl", "abd"));
  expect(await screen.findByText(/Não confere\./)).toBeInTheDocument();
  expect(screen.getByText(/mudou depois da emissão ou é outro arquivo/)).toBeInTheDocument();
});

test("conferir pelo .json salvo: mostra quem emitiu; .json que não é certificado avisa; hash malformado avisa", async () => {
  setup();
  const user = userEvent.setup({ applyAccept: false });
  await user.upload(drop()[1], file("gato.stl", "abc"));
  const cert = JSON.stringify({ version: 1, sha256: ABC, name: "gato.stl", size: 3, at: "2026-10-15T17:30:00.000Z", author: "Loja da Ana", title: "Gato", contact: "", note: "" });
  await user.upload(drop()[2], file("c.json", cert));
  expect(await screen.findByText(/Emitido em .* por Loja da Ana/)).toBeInTheDocument();
  await user.upload(drop()[2], file("x.json", "{}"));
  expect(await screen.findByText(/não é um certificado do UpVision Maker/)).toBeInTheDocument();
  await user.type(screen.getByLabelText(/^Hash do certificado/), "123");
  expect(await screen.findByText(/64 letras e números/)).toBeInTheDocument();
});
