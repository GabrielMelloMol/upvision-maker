import type { Page } from "@playwright/test";
import { expect, openApp, pickModel, test } from "./tauri";

const idle = (page: Page) => expect(page.locator(".viewer .overlay.busy")).toHaveCount(0, { timeout: 90_000 });
test("canopla de microfone (#274, #293): bolinha, duas placas, microfone pronto, tema, largura mínima, anel de teste e Como usar", async ({ page }) => {
  await openApp(page);
  await pickModel(page, "canopla microfone", "Canopla de microfone", { exact: true });
  await idle(page);
  await expect(page.getByText(/Placa 1: a caixinha deitada/)).toBeVisible();
  // #293: bolinha de cima em 3 opções; a espuma comprada mostra o furo e esconde o anel
  await page.getByRole("button", { name: "Grade de microfone, com anel" }).click();
  await idle(page);
  await expect(page.getByText(/Placa 2: bolinha, anel, cabo e pecinha/)).toBeVisible();
  await page.getByRole("button", { name: "Espuma comprada (furo)" }).click();
  await idle(page);
  await expect(page.getByLabel(/^Furo da espuma/)).toBeVisible();
  await expect(page.getByText(/Placa 2: o cabo, em pé/)).toBeVisible();
  await page.getByRole("button", { name: "Espuma impressa (lisa)" }).click();
  await idle(page);
  await expect(page.getByLabel(/^Furo da espuma/)).toHaveCount(0);
  await page.getByRole("button", { name: "Placas", exact: true }).click();
  await idle(page);
  await expect(page.getByText(/Duas placas, como a referência/)).toBeVisible();
  // #291: o transmissor entra por trás, deitado: fora, entrando e dentro
  for (const [view, note] of [["1. Fora", /na frente da abertura/], ["2. Entrando", /O cabo não sai do lugar/], ["3. Dentro", /o clipe abraça a travessa e a luz/]] as const) {
    await page.getByRole("button", { name: view, exact: true }).click();
    await idle(page);
    await expect(page.getByText(note)).toBeVisible();
  }
  await page.getByRole("button", { name: "Hollyland Lark A1" }).click();
  await idle(page);
  await expect(page.getByLabel(/^Largura do transmissor/)).toHaveValue("30");
  await page.getByRole("button", { name: "Halter (academia)" }).click();
  await idle(page);
  await expect(page.getByLabel(/^Largura \(mm\)/)).toHaveValue("84");
  await expect(page.getByLabel(/^Largura do transmissor/)).toHaveValue("30"); // o tema não desfaz o microfone escolhido
  await page.getByLabel(/^Largura \(mm\)/).fill("34");
  await idle(page);
  await expect(page.getByText(/ficou estreito para o microfone/)).toBeVisible();
  await page.getByRole("button", { name: "Só o anel de teste" }).click();
  await idle(page);
  await expect(page.getByText(/Anel de teste: é o mesmo encaixe das costas/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Salvar 3MF" })).toBeEnabled();
  await page.getByText("Como usar").click();
  await expect(page.getByText(/Como tiro o microfone para carregar/)).toBeVisible();
});
