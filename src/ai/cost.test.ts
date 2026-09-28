import { expect, test } from "vitest";
import { estimateCostUsd } from "./cost";

test("custo usa preço por milhão e conta cache (escrita 1,25×, leitura 0,1×)", () => {
  const usd = estimateCostUsd("claude-sonnet-5", {
    input_tokens: 1_000_000,
    output_tokens: 100_000,
    cache_creation_input_tokens: 1_000_000,
    cache_read_input_tokens: 1_000_000,
  });
  // 2 + 1 + 2×1,25 + 2×0,1
  expect(usd).toBeCloseTo(2 + 1 + 2.5 + 0.2, 6);
});

test("modelo desconhecido: custo nulo (não inventa preço)", () => {
  expect(estimateCostUsd("modelo-x", { input_tokens: 10, output_tokens: 10 })).toBeNull();
});
