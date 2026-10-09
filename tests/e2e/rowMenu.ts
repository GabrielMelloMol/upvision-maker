import type { Locator, Page } from "@playwright/test";

/** Abre o menu ⋯ "Ações de <linha>" (#180) e escolhe a ação. `scope` limita à linha ou à página. */
export async function rowAction(page: Page, subject: string | RegExp, action: string, scope?: Locator) {
  const name = typeof subject === "string" ? `Ações de ${subject}` : new RegExp(`^Ações de ${subject.source}`);
  await (scope ?? page).getByRole("button", { name }).click();
  await page.getByRole("menuitem", { name: action, exact: true }).click();
}
