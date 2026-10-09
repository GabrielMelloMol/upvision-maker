import { expect, go, openApp, prefsSection, test } from "./tauri";

test("computador: celular desligado por padrão; ligar mostra QR, endereço e código de 6 dígitos (#16)", async ({ page, tauri }) => {
  await openApp(page);
  await go(page, "Preferências");
  await prefsSection(page, "Seus dados");
  const card = page.getByRole("region", { name: "Celular na rede de casa" });
  const toggle = card.getByRole("switch", { name: /Deixar o celular ver/ });
  await expect(toggle).not.toBeChecked();
  await expect(card.getByText(/\d{3} \d{3}/)).toHaveCount(0);
  await toggle.click();
  await expect(card.getByText("http://192.168.0.10:51234/")).toBeVisible();
  await expect(card.getByText("123 456")).toBeVisible();
  await expect(card.getByRole("img", { name: /QR Code/ })).toBeVisible();
  await toggle.click();
  await expect(card.getByText("123 456")).toBeHidden();
  expect(tauri.lan.running).toBe(false);
});

test("celular: conecta pelo código do QR, marca pedido pronto e dá baixa de filamento (#16)", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let paired = false;
  const posts: string[] = [];
  await page.route("**/api/**", async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (req.method() === "POST") {
      posts.push(`${path} ${req.headers()["x-upvision"] ?? "-"}`);
    }
    if (path === "/api/pair") {
      paired = req.headers()["x-upvision-code"] === "123456" && req.postData() === null; // código no cabeçalho, sem corpo (B25)
      return route.fulfill({ status: paired ? 200 : 401, json: paired ? { ok: true } : { error: "Código errado." } });
    }
    if (!paired) return route.fulfill({ status: 401, json: { error: "Conecte." } });
    if (path === "/api/summary")
      return route.fulfill({
        json: {
          orders: [{ id: 3, customer: "Bia", dueDate: "2026-10-02", status: "Em produção", late: false, items: "1× Vaso", canFinish: true }],
          filaments: [{ id: 1, name: "PLA Branco", stockG: 900, minG: 200, low: false }],
        },
      });
    return route.fulfill({ json: path.endsWith("/consume") ? { stockG: 880 } : { ok: true } });
  });

  await page.goto("/phone.html#codigo=123456");
  await expect(page.getByText("#3 Bia")).toBeVisible();
  expect(new URL(page.url()).hash).toBe(""); // o código não fica no histórico
  const done = page.getByRole("button", { name: "Marcar pronto" });
  expect((await done.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await done.click();
  await expect(page.getByText("Pedido #3 marcado como pronto.")).toBeVisible();

  const tabs = page.getByRole("navigation", { name: "Seções" });
  const box = (await tabs.boundingBox())!;
  expect(box.y + box.height).toBeGreaterThan(830); // abas embaixo
  await tabs.getByRole("button", { name: /Baixa/ }).click();
  await page.getByLabel("Filamento").selectOption("1");
  await page.getByLabel("Quanto usou (g)").fill("20");
  await page.getByRole("button", { name: "Dar baixa" }).click();
  await expect(page.getByText("Baixa de 20 g em PLA Branco.")).toBeVisible();
  expect(posts).toEqual(["/api/pair 1", "/api/orders/3/done 1", "/api/filaments/1/consume 1"]);
});
