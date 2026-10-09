import type { Page } from "@playwright/test";
import { go } from "./tauri";

/** Abre a ferramenta "Foto em relevo" e passa pela escolha inicial (a primeira tela pergunta o que fazer). */
export async function openRelief(page: Page, mode: "Litofania" | "Colorida" | "Relevo" | "Quadro por camadas" | "Shadowbox" = "Litofania") {
  await go(page, "Foto em relevo");
  await page.getByRole("region", { name: "O que você quer fazer?" }).getByRole("button", { name: new RegExp(`^${mode}`) }).click();
}
