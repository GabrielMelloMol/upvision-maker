// @vitest-environment happy-dom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { useEffect, useState } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { DEFAULT_MUSIC_CARD } from "../../geometry/models/musicCard";
import type { Params } from "./fields";
import MusicCodeField from "./MusicCodeField";

const SAMPLE = readFileSync("tests/fixtures/spotify/scannable-track.svg", "utf8");
const LINK = "https://open.spotify.com/track/11dFghVXANMlKmJXsNCbNl";
const URI = "spotify:track:11dFghVXANMlKmJXsNCbNl";
const YT = "https://youtu.be/dQw4w9WgXcQ";

/** Segura os valores como o formulário dos Modelos prontos e deixa ver o que o campo gravou. */
const seen: { value: Params } = { value: {} };
const cur = () => seen.value;
function Host({ start }: { start: Params }) {
  const [p, setP] = useState<Params>({ ...(DEFAULT_MUSIC_CARD as unknown as Params), ...start });
  useEffect(() => {
    seen.value = p;
  });
  return <MusicCodeField label="Código" params={p} patch={(next) => setP((o) => ({ ...o, ...next }))} />;
}
const setup = (start: Params = {}) => {
  const user = userEvent.setup();
  render(<Host start={start} />);
  return user;
};
const pressed = () => screen.getAllByRole("button").filter((b) => b.getAttribute("aria-pressed") === "true").map((b) => b.textContent);
const paste = async (user: ReturnType<typeof userEvent.setup>, text: string) => {
  const box = screen.getByLabelText(/^Link da música/);
  await user.clear(box);
  await user.click(box);
  await user.paste(text);
};
const stubFetch = (impl: () => Promise<Response>) => vi.stubGlobal("fetch", vi.fn(impl));
afterEach(() => vi.unstubAllGlobals());

describe("campo do código da música", () => {
  test("três opções lado a lado: Spotify, QR Code e Nenhum; o QR é o padrão enquanto não há link do Spotify", () => {
    setup();
    expect(screen.getAllByRole("button").filter((b) => b.closest('[role="group"]')?.getAttribute("aria-label") === "Código").map((b) => b.textContent)).toEqual(["Spotify", "QR Code", "Nenhum"]);
    expect(pressed()).toEqual(["QR Code"]);
  });

  test("colar um link do Spotify já seleciona o Spotify; o QR fica para links de outros serviços", async () => {
    const user = setup();
    await paste(user, YT);
    expect(cur().code).toBe("qr");
    await paste(user, LINK);
    expect(cur().code).toBe("spotify");
    expect(pressed()).toContain("Spotify");
    await paste(user, YT); // saiu do Spotify: volta ao QR
    expect(cur().code).toBe("qr");
  });

  test("trocar de código leva a largura padrão dele: 70 mm no Spotify e 44 mm no QR; a que a pessoa mexeu não muda", async () => {
    const user = setup();
    expect(cur().codeSize).toBe(44);
    await user.click(screen.getByRole("button", { name: "Spotify" }));
    expect(cur().codeSize).toBe(70);
    await user.click(screen.getByRole("button", { name: "QR Code" }));
    expect(cur().codeSize).toBe(44);
  });

  test("a largura que a pessoa escolheu fica como está ao trocar de código ou colar um link do Spotify", async () => {
    const user = setup({ codeSize: 52 });
    await paste(user, LINK);
    expect(cur().code).toBe("spotify");
    expect(cur().codeSize).toBe(52);
  });

  test("quem escolheu o QR para um link do Spotify continua com o QR enquanto edita o mesmo link", async () => {
    const user = setup({ code: "spotify", codeLink: LINK });
    await user.click(screen.getByRole("button", { name: "QR Code" }));
    expect(cur().code).toBe("qr");
    const box = screen.getByLabelText(/^Link da música/);
    await user.click(box);
    await user.keyboard("?si=abc"); // mesmo link do Spotify, com o rastreio
    expect(cur().codeLink).toBe(`${LINK}?si=abc`);
    expect(cur().code).toBe("qr");
  });

  test("'Nenhum' é respeitado: esconde o link e colar um link do Spotify não reabre o código", async () => {
    const user = setup();
    await user.click(screen.getByRole("button", { name: "Nenhum" }));
    expect(screen.queryByLabelText(/^Link da música/)).not.toBeInTheDocument();
    expect(cur().code).toBe("none");
  });

  test("Buscar o código: grava o SVG e a música no projeto e passa a dizer que não precisa mais de internet", async () => {
    stubFetch(async () => new Response(SAMPLE));
    const user = setup({ code: "spotify", codeLink: LINK });
    expect(screen.getByText(/Falta buscar o código/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Buscar o código" }));
    await waitFor(() => expect(cur().spotifyUri).toBe(URI));
    expect(cur().spotifySvg).toBe(SAMPLE);
    expect(cur().code).toBe("spotify");
    expect(await screen.findByText(/Código guardado neste projeto: não precisa mais de internet/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Buscar de novo" })).toBeInTheDocument();
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe(`https://scannables.scdn.co/uri/plain/svg/ffffff/black/640/${URI}`);
  });

  test("sem internet: mensagem clara e volta ao QR com o link", async () => {
    stubFetch(async () => {
      throw new TypeError("Failed to fetch");
    });
    const user = setup({ code: "spotify", codeLink: LINK });
    await user.click(screen.getByRole("button", { name: "Buscar o código" }));
    expect(await screen.findByText(/sem internet.*Voltei para o QR code com o link/s)).toBeInTheDocument();
    expect(cur().code).toBe("qr");
    expect(cur().codeLink).toBe(LINK); // o link continua: o QR leva à mesma música
    expect(cur().spotifySvg).toBe("");
  });

  test("música que o Spotify não acha e resposta estranha também voltam ao QR, cada uma com a sua mensagem", async () => {
    stubFetch(async () => new Response("nada", { status: 404 }));
    const user = setup({ code: "spotify", codeLink: LINK });
    await user.click(screen.getByRole("button", { name: "Buscar o código" }));
    expect(await screen.findByText(/não achou essa música/)).toBeInTheDocument();
    expect(cur().code).toBe("qr");
  });

  test("link que não é do Spotify (ou curto) pede o link certo, sem chamar a internet", async () => {
    stubFetch(async () => new Response(SAMPLE));
    const user = setup({ code: "spotify", codeLink: "https://spotify.link/AbCdEf" });
    await user.click(screen.getByRole("button", { name: "Buscar o código" }));
    expect(await screen.findByText(/Links curtos \(spotify\.link\) não servem/)).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
    expect(cur().code).toBe("spotify"); // a pessoa corrige o link: nada trocou
  });

  test("o aviso de marca é uma linha pequena e informativa, não um alerta, e o logo é opcional", async () => {
    const user = setup({ code: "spotify", codeLink: LINK });
    const note = screen.getByText(/traz o logo do Spotify: vender peças com marca de terceiros pode violar direitos de marca/);
    expect(note).toHaveClass("hint");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    const logo = screen.getByRole("switch", { name: "Incluir o logo do Spotify" });
    expect(logo).toBeChecked();
    await user.click(logo);
    expect(cur().spotifyLogo).toBe(false);
  });

  test("QR: testar a leitura da vista de cima lê o mesmo link; o resultado some se o link muda", async () => {
    const user = setup({ code: "qr", codeLink: LINK, codeSize: 44 });
    await user.click(screen.getByRole("button", { name: "Testar a leitura da vista de cima" }));
    expect(await screen.findByText(/Leitura ok: a vista de cima do código lê o mesmo link/)).toBeInTheDocument();
    await user.click(screen.getByLabelText(/^Link da música/));
    await user.keyboard("x");
    expect(screen.queryByText(/Leitura ok/)).not.toBeInTheDocument();
  });

  test("o botão de testar a leitura só existe no QR e fica desligado sem link", () => {
    setup({ code: "qr", codeLink: "" });
    expect(screen.getByRole("button", { name: "Testar a leitura da vista de cima" })).toBeDisabled();
  });

  test("no Spotify não há teste de leitura (o app do Spotify é que lê)", () => {
    setup({ code: "spotify", codeLink: LINK });
    expect(screen.queryByRole("button", { name: "Testar a leitura da vista de cima" })).not.toBeInTheDocument();
  });
});
