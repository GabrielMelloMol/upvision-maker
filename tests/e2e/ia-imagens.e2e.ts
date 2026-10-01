import { readFileSync } from "node:fs";
import { expect, go, openApp, test } from "./tauri";

const PHOTO = readFileSync(new URL("../fixtures/foto.jpg", import.meta.url));

function sse(text: string): string {
  const ev = (type: string, data: object) => `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`;
  const usage = { input_tokens: 10, output_tokens: 20, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };
  return [
    ev("message_start", { message: { id: "msg_1", type: "message", role: "assistant", model: "claude-sonnet-5", content: [], stop_reason: null, stop_sequence: null, usage } }),
    ev("content_block_start", { index: 0, content_block: { type: "text", text: "" } }),
    ev("content_block_delta", { index: 0, delta: { type: "text_delta", text } }),
    ev("content_block_stop", { index: 0 }),
    ev("message_delta", { delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 20 } }),
    ev("message_stop", {}),
  ].join("");
}

type Block = { type: string; text?: string; source?: { media_type: string; data: string } };

test("Pedir à IA: foto + esboço à mão com legenda, custo com as imagens e imagens no pedido (#89)", async ({ page, tauri }) => {
  const bodies: { messages: { content: string | Block[] }[] }[] = [];
  // API simulada: contagem de tokens e resposta em streaming
  await page.route("https://api.anthropic.com/v1/messages/count_tokens**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ input_tokens: 3210 }) }));
  await page.route("https://api.anthropic.com/v1/messages", async (route) => {
    bodies.push(route.request().postDataJSON());
    await route.fulfill({ status: 200, headers: { "content-type": "text/event-stream" }, body: sse("Fiz como na foto, com 90 mm (diga a medida certa).") });
  });
  await openApp(page);
  await go(page, "Impressoras"); // cria o banco
  tauri.db.prepare("INSERT INTO secrets (key, value) VALUES ('anthropic_api_key', ?)").run(`sk-ant-${"x".repeat(30)}`);
  await go(page, "Pedir à IA");

  await page.getByLabel("Arquivo de imagem de referência").setInputFiles({ name: "peca.jpg", mimeType: "image/jpeg", buffer: PHOTO });
  await expect(page.getByRole("img", { name: "Imagem 1: peca.jpg" })).toBeVisible();
  await page.getByLabel("Legenda da imagem 1").fill("vista de cima");

  // esboço: risca a área de desenho e anexa
  await page.getByRole("button", { name: "Esboço" }).click();
  const canvas = page.getByLabel("Área de desenho");
  const b = (await canvas.boundingBox())!;
  await page.mouse.move(b.x + 40, b.y + 40);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width - 40, b.y + b.height - 40, { steps: 10 });
  await page.mouse.up();
  await page.getByRole("button", { name: "Anexar esboço" }).click();
  await expect(page.getByRole("img", { name: "Imagem 2: esboco.png" })).toBeVisible();

  await page.getByPlaceholder(/Descreva a peça/).fill("porta-copos igual à foto");
  await expect(page.getByText(/próximo pedido: 3\.210 tokens de entrada com as imagens/)).toBeVisible();
  await page.getByRole("button", { name: "Criar peça" }).click();
  await expect(page.getByText(/Fiz como na foto/)).toBeVisible();

  const content = bodies[0].messages.at(-1)!.content as Block[];
  expect(content.map((c) => (c.type === "text" ? c.text : c.source!.media_type))).toEqual(["Imagem 1: vista de cima", "image/jpeg", "Imagem 2", "image/png", "porta-copos igual à foto"]);
  expect(content[1].source!.data.length).toBeGreaterThan(100); // base64 de verdade, sem o prefixo data:
  expect(content[1].source!.data.startsWith("data:")).toBe(false);
  await expect(page.getByRole("img", { name: /enviada/ })).toHaveCount(2);
});
