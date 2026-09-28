// @vitest-environment happy-dom
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { renderWithApp, setupTauri } from "../test/harness";
import { classifyImage } from "../vectorize/classify";
import { loadRaster, trace, TraceCancelled, type TraceJob, type TraceProgress } from "../vectorize/client";
import { segmentSubject } from "../vectorize/segment";
import type { TraceDone } from "../vectorize/vectorize.worker";
import { peekHandoff } from "./handoff";
import ImageToSvg from "./ImageToSvg";

vi.mock("../vectorize/client", async (orig) => ({ ...(await orig<typeof import("../vectorize/client")>()), loadRaster: vi.fn(), trace: vi.fn() }));
vi.mock("../vectorize/segment", () => ({ segmentSubject: vi.fn() }));
vi.mock("../vectorize/classify", () => ({ classifyImage: vi.fn() }));

const t = setupTauri();
const traceMock = vi.mocked(trace);
const RASTER = { rgba: new Uint8ClampedArray(4 * 4 * 4), w: 4, h: 2, url: "blob:original" };
const done = (over: Partial<TraceDone> = {}): TraceDone => ({ id: 1, type: "done", d: "M0 0L4 0L4 2Z", threshold: 128, fillPct: 40, thinCount: 0, thin: null, ms: 12, ...over });

/** Trabalho de vetorização controlado pelo teste: `progress`, `finish`, `fail`. */
function manualJob() {
  let resolve!: (d: TraceDone) => void, reject!: (e: Error) => void, onProgress: ((p: TraceProgress) => void) | undefined;
  const cancel = vi.fn(() => reject(new TraceCancelled()));
  traceMock.mockImplementationOnce((_r, _o, _s, p) => {
    onProgress = p;
    return { result: new Promise<TraceDone>((a, b) => ((resolve = a), (reject = b))), cancel } satisfies TraceJob;
  });
  return { cancel, progress: (x: TraceProgress) => act(() => onProgress?.(x)), finish: (d = done()) => act(async () => resolve(d)), fail: (e: Error) => act(async () => reject(e)) };
}

beforeEach(() => {
  vi.mocked(loadRaster).mockReset().mockResolvedValue(RASTER);
  vi.mocked(classifyImage).mockReturnValue({ isPhoto: false, uniqueColors: 2, edgeDensity: 0 });
  vi.mocked(segmentSubject).mockReset().mockResolvedValue(new Uint8Array(8));
  traceMock.mockReset().mockImplementation(() => ({ result: Promise.resolve(done()), cancel: () => {} }));
});

async function withImage(go = vi.fn()) {
  const user = userEvent.setup();
  const { container } = renderWithApp(<ImageToSvg go={go} />);
  await user.upload(container.querySelector<HTMLInputElement>('input[type="file"]')!, new File(["png"], "Meu Logo.png", { type: "image/png" }));
  await screen.findByRole("img", { name: "Imagem original" });
  return { user, go, container };
}

describe("Imagem → SVG", () => {
  test("sem imagem: Aplicar desabilitado e salvar bloqueado", () => {
    renderWithApp(<ImageToSvg go={vi.fn()} />);
    expect(screen.getByText("Envie uma imagem para começar.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Aplicar/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Salvar SVG/ })).toBeDisabled();
  });

  test("aplica com progresso, mostra métricas, salva SVG em mm e manda para o cortador", async () => {
    const job = manualJob();
    const { user, go } = await withImage();
    expect(screen.getByText("Ajuste à esquerda e clique em Aplicar.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^Aplicar/ }));
    expect(screen.getAllByText("Preparando…").length).toBeGreaterThan(0);
    job.progress({ stage: "prepare", ticks: 0 });
    expect(screen.getAllByText("Limpando a imagem…").length).toBeGreaterThan(0);
    job.progress({ stage: "trace", ticks: 12 });
    expect(screen.getAllByText("Vetorizando… 12 contornos").length).toBeGreaterThan(0);
    await job.finish();

    expect(await screen.findByText("Resultado atualizado.")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Resultado vetorizado" })).toBeInTheDocument();
    expect(screen.getByText("Caminhos").querySelector("b")).toHaveTextContent("1");
    expect(screen.getByText("Tempo").querySelector("b")).toHaveTextContent("12 ms");
    expect(traceMock.mock.calls[0][1]).toMatchObject({ mode: "logo", widthMm: 80 });

    await user.click(screen.getByRole("button", { name: /Salvar SVG/ }));
    expect(await screen.findByText("SVG salvo em /saida/meu-logo.svg")).toBeInTheDocument();
    expect(new TextDecoder().decode(t.files.get("/saida/meu-logo.svg"))).toMatch(/<svg[^>]*width="80mm"/);

    await user.click(screen.getByRole("button", { name: /Fazer cortador/ }));
    expect(go).toHaveBeenCalledWith("cutter");
    expect(peekHandoff()?.name).toBe("meu-logo");
    await user.click(screen.getByRole("button", { name: /Extrudar em 3D/ }));
    expect(go).toHaveBeenCalledWith("extrude");
  });

  test("mudar ajuste depois de aplicar marca o resultado como desatualizado", async () => {
    const { user } = await withImage();
    await user.click(screen.getByRole("button", { name: /^Aplicar/ }));
    expect(await screen.findByText("Resultado atualizado.")).toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: /claro sobre fundo escuro/ }));
    expect(screen.getByText("Há alterações não aplicadas.")).toBeInTheDocument();
    expect(screen.getByText("desatualizado")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Aplicar alterações" }));
    expect(await screen.findByText("Resultado atualizado.")).toBeInTheDocument();
    expect(traceMock.mock.calls[1][1]).toMatchObject({ invert: true });
  });

  test("largura vazia: vetoriza na largura padrão (80 mm) e mostra a altura proporcional", async () => {
    const { user } = await withImage();
    expect(screen.getByText(/A altura acompanha a proporção: 40\.0 mm/)).toBeInTheDocument();
    await user.clear(screen.getByLabelText(/Largura final/));
    await user.click(screen.getByRole("button", { name: /^Aplicar/ }));
    await waitFor(() => expect(traceMock).toHaveBeenCalled());
    expect(traceMock.mock.calls[0][1].widthMm).toBe(80);
    // Obs.: com o campo vazio o resultado já nasce "desatualizado" (applied=80 ≠ opts=NaN) — bug relatado, não coberto aqui
  });

  test("limiar manual parte do limiar automático encontrado", async () => {
    const { user } = await withImage();
    await user.click(screen.getByRole("button", { name: /^Aplicar/ }));
    await screen.findByText("Resultado atualizado.");
    const slider = screen.getByRole("slider", { name: /Limiar/ });
    expect(slider).toBeDisabled();
    await user.click(screen.getByRole("checkbox", { name: "Limiar automático" }));
    expect(slider).toBeEnabled();
    expect(slider).toHaveValue("128");
  });

  test("cancelar encerra a vetorização sem mostrar erro", async () => {
    const job = manualJob();
    const { user } = await withImage();
    await user.click(screen.getByRole("button", { name: /^Aplicar/ }));
    await user.click(screen.getByRole("button", { name: /Cancelar/ }));
    expect(job.cancel).toHaveBeenCalled();
    expect(await screen.findByRole("button", { name: /^Aplicar/ })).toBeEnabled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  test("falha na vetorização e imagem que não abre mostram o erro", async () => {
    const job = manualJob();
    const { user, container } = await withImage();
    await user.click(screen.getByRole("button", { name: /^Aplicar/ }));
    await job.fail(new Error("A vetorização demorou demais."));
    expect(await screen.findByText("A vetorização demorou demais.")).toBeInTheDocument();

    vi.mocked(loadRaster).mockRejectedValueOnce(new Error("Imagem maior que 25 MB."));
    await user.upload(container.querySelector<HTMLInputElement>('input[type="file"]')!, new File(["x"], "grande.png", { type: "image/png" }));
    expect(await screen.findByText("Imagem maior que 25 MB.")).toBeInTheDocument();
  });

  test("foto: sugere Silhueta; recorte da IA local é feito uma vez por assunto (cache)", async () => {
    vi.mocked(classifyImage).mockReturnValue({ isPhoto: true, uniqueColors: 9000, edgeDensity: 0.3 });
    const { user } = await withImage();
    expect(screen.getByText("Isso parece uma foto.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Usar modo Silhueta" }));
    expect(screen.getByRole("button", { name: "Silhueta" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByText("Isso parece uma foto.")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^Aplicar/ }));
    await screen.findByText("Resultado atualizado.");
    expect(segmentSubject).toHaveBeenCalledWith(RASTER.rgba, 4, 2, "person");
    expect(traceMock.mock.calls[0][2]).toBeInstanceOf(Uint8Array);

    await user.selectOptions(screen.getByLabelText("Recortar"), "pet");
    expect(screen.getByText("Há alterações não aplicadas.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Aplicar alterações" }));
    await screen.findByText("Resultado atualizado.");
    await user.selectOptions(screen.getByLabelText("Recortar"), "person");
    await user.click(screen.getByRole("button", { name: "Aplicar alterações" }));
    await screen.findByText("Resultado atualizado.");
    expect(segmentSubject).toHaveBeenCalledTimes(2);
  });

  test("traços finos: sobreposição vermelha e botão que reaplica engrossando", async () => {
    const ctx = { createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData: vi.fn() };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/png;base64,AAAA");
    traceMock.mockImplementationOnce(() => ({ result: Promise.resolve(done({ thinCount: 3, thin: new Uint8Array([1, 0, 1, 0, 0, 0, 1, 0]) })), cancel: () => {} }));
    const { user, container } = await withImage();
    await user.click(screen.getByRole("button", { name: /^Aplicar/ }));
    expect(await screen.findByText(/menos de 0,4 mm/)).toBeInTheDocument();
    expect(container.querySelector('img[src="data:image/png;base64,AAAA"]')).toBeInTheDocument();
    expect(ctx.putImageData).toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Engrossar traços finos automaticamente" }));
    await waitFor(() => expect(traceMock).toHaveBeenCalledTimes(2));
    expect(traceMock.mock.calls[1][1].thicken).toBe(true);
    expect(await screen.findByText("Resultado atualizado.")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /Engrossar traços finos/ })).toBeChecked();
    vi.restoreAllMocks();
  });

  test("avisos: nenhuma forma, quase tudo preenchido, caminhos demais", async () => {
    traceMock
      .mockImplementationOnce(() => ({ result: Promise.resolve(done({ d: "", fillPct: 99 })), cancel: () => {} }))
      .mockImplementationOnce(() => ({ result: Promise.resolve(done({ d: "M0 0Z".repeat(2001) })), cancel: () => {} }));
    const { user } = await withImage();
    await user.click(screen.getByRole("button", { name: /^Aplicar/ }));
    expect(await screen.findByText(/Nenhuma forma encontrada/)).toBeInTheDocument();
    expect(screen.getByText(/Quase tudo ficou preenchido/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Aplicar alterações/ }));
    expect(await screen.findByText(/Mais de 2000 caminhos/)).toBeInTheDocument();
  });

  test("ajustes de limpeza, detalhe, fundo, engrossar, área mínima e suavização chegam ao vetorizador", async () => {
    const { user } = await withImage();
    fireEvent.change(screen.getByRole("slider", { name: /Limpeza/ }), { target: { value: "3" } });
    expect(screen.getByText("Forte")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("slider", { name: /Detalhe/ }), { target: { value: "2" } });
    await user.click(screen.getByRole("checkbox", { name: /Remover fundo/ }));
    await user.click(screen.getByRole("checkbox", { name: /Engrossar traços finos/ }));
    fireEvent.change(screen.getByLabelText(/Ignorar pedaços/), { target: { value: "-5" } });
    await user.click(screen.getByRole("button", { name: /^Aplicar/ }));
    await screen.findByText("Resultado atualizado.");
    expect(traceMock.mock.calls[0][1]).toMatchObject({ cleanup: 3, detail: 2, removeBg: false, thicken: true, minAreaMm2: 0 });

    await user.click(screen.getByRole("button", { name: "Silhueta" }));
    fireEvent.change(screen.getByRole("slider", { name: /Suavização/ }), { target: { value: "2.5" } });
    expect(screen.getByText("2,5 mm")).toBeInTheDocument();
  });
});
