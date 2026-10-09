import { screen, within } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";

const triggerName = (subject: string | RegExp) => (typeof subject === "string" ? `Ações de ${subject}` : new RegExp(`^Ações de ${subject.source}`));

/** Abre o menu ⋯ "Ações de <linha>" (#180) e escolhe a ação ("Editar", "Duplicar", "Excluir"…). `scope` limita a busca à linha; `nth` escolhe entre várias. */
export async function rowAction(user: UserEvent, subject: string | RegExp, action: string, scope?: HTMLElement, nth = 0) {
  const q = scope ? within(scope) : screen;
  const all = await q.findAllByRole("button", { name: triggerName(subject) });
  await user.click(all[nth]);
  await user.click(await screen.findByRole("menuitem", { name: action }));
}

/** Abre o menu da linha e devolve os nomes das ações (para conferir o que está disponível). */
export async function rowActionNames(user: UserEvent, subject: string | RegExp, scope?: HTMLElement): Promise<string[]> {
  const q = scope ? within(scope) : screen;
  await user.click(await q.findByRole("button", { name: triggerName(subject) }));
  const names = (await screen.findAllByRole("menuitem")).map((i) => i.textContent ?? "");
  await user.keyboard("{Escape}");
  return names;
}
