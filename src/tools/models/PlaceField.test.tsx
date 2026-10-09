// @vitest-environment happy-dom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { resetGeocode } from "../../domain/geocode";
import type { Params } from "./fields";
import PlaceField, { placeText, zoneSummary } from "./PlaceField";

const BASE: Params = { city: "custom", lat: -23.55, lon: -46.63, placeName: "São Paulo, SP", tz: "America/Sao_Paulo", tzAuto: true, utcOffset: -3, year: 2010, month: 1, day: 15, hour: 22, minute: 0 };

beforeEach(() => {
  resetGeocode();
  vi.unstubAllGlobals();
});

describe("campo de lugar do mapa estelar (#196)", () => {
  test("mostra o lugar atual, o fuso e o horário de verão da data", () => {
    render(<PlaceField label="Cidade ou endereço" params={BASE} patch={() => {}} />);
    expect(screen.getByLabelText("Cidade ou endereço")).toHaveValue("São Paulo, SP");
    expect(screen.getByText(/fuso America\/Sao_Paulo · UTC−2 \(horário de verão\), automático pela localização e pela data/)).toBeInTheDocument();
    expect(screen.getByText(/IBGE.*GeoNames \(CC-BY 4.0\)/)).toBeInTheDocument();
  });

  test("digitar acha a cidade pelo nome e escolher preenche nome, coordenadas e fuso de uma vez", async () => {
    const user = userEvent.setup();
    const patch = vi.fn();
    render(<PlaceField label="Cidade ou endereço" params={BASE} patch={patch} />);
    const input = screen.getByLabelText("Cidade ou endereço");
    await user.clear(input);
    await user.type(input, "Santa Rita do Passa Quatro");
    const option = await screen.findByRole("button", { name: /Santa Rita do Passa Quatro, SP/ }, { timeout: 15_000 });
    await user.click(option);
    expect(patch).toHaveBeenCalledWith({ city: "custom", placeName: "Santa Rita do Passa Quatro, SP", lat: -21.7083, lon: -47.478, tz: "America/Sao_Paulo" });
    expect(screen.queryByRole("group", { name: "Lugares encontrados" })).not.toBeInTheDocument();
  }, 30_000);

  test("endereço pela internet só é buscado ao clicar; escolher deixa o fuso para a localização", async () => {
    const user = userEvent.setup();
    const patch = vi.fn();
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => [{ lat: "-22.9056", lon: "-47.0608", display_name: "Rua X, 10, Campinas, São Paulo, Brasil", address: { city: "Campinas", "ISO3166-2-lvl4": "BR-SP" } }] }) as Response);
    vi.stubGlobal("fetch", fetchMock);
    render(<PlaceField label="Cidade ou endereço" params={BASE} patch={patch} />);
    const input = screen.getByLabelText("Cidade ou endereço");
    await user.clear(input);
    await user.type(input, "Rua X 10 Campinas");
    expect(fetchMock).not.toHaveBeenCalled(); // digitar não manda nada para a internet
    await user.click(screen.getByRole("button", { name: "Buscar endereço pela internet" }));
    await user.click(await screen.findByRole("button", { name: /Rua X, 10, Campinas/ }));
    expect(patch).toHaveBeenCalledWith({ city: "custom", placeName: "Campinas, SP", lat: -22.9056, lon: -47.0608, tz: "" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  }, 30_000);

  test("sem internet mostra o aviso e a cidade da lista continua valendo", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }));
    render(<PlaceField label="Cidade ou endereço" params={BASE} patch={() => {}} />);
    await user.click(screen.getByRole("button", { name: "Buscar endereço pela internet" }));
    await waitFor(() => expect(screen.getByText(/Use a cidade da lista/)).toBeInTheDocument());
  });

  test("zoneSummary: rascunho antigo com cidade da lista e fuso manual", () => {
    expect(placeText({ ...BASE, city: "belem" })).toBe("Belém");
    expect(zoneSummary({ ...BASE, city: "belem", tzAuto: false, utcOffset: -3 })?.text).toBe("fuso manual UTC−3");
    expect(zoneSummary({ ...BASE, city: "belem" })).toMatchObject({ tz: "America/Belem", lat: -1.46 });
  });
});
