import { describe, expect, test } from "vitest";
import { takeIntent } from "./intent";
import { openModel, placeOf } from "./modelPlaces";

describe("modelos que viraram aba de ferramenta (Foto em relevo)", () => {
  test("o Shadowbox abre na aba da Foto em relevo, os outros modelos nos Modelos prontos", () => {
    expect(openModel("shadowbox")).toBe("lithophane");
    expect(takeIntent("lithophane")).toEqual({ mode: "shadowbox" });
    expect(openModel("tableLamp")).toBe("models");
    expect(takeIntent("models")).toEqual({ id: "tableLamp" });
  });

  test("busca e atalhos antigos (#models/shadowbox) são redirecionados; o resto passa direto", () => {
    expect(placeOf("models", { id: "shadowbox" })).toEqual({ pageId: "lithophane", intent: { mode: "shadowbox" } });
    expect(placeOf("models", { id: "nfc" })).toEqual({ pageId: "models", intent: { id: "nfc" } });
    expect(placeOf("lithophane", undefined)).toEqual({ pageId: "lithophane", intent: undefined });
    expect(placeOf("models", undefined)).toEqual({ pageId: "models", intent: undefined });
  });
});
