import { expect, test } from "vitest";
import { CONSUMER, RESALE } from "./orders";
import { PRICE_NAMES } from "./pricing";
import { itemFromCalc, orderChannelOf } from "./quotes";

test("item avulso da calculadora: peças da mesa, preço e custo por peça, minutos de máquina por peça", () => {
  expect(itemFromCalc({ description: " Chaveiro ", pieces: 4, unitPrice: 12.9, unitCost: 3.21, printMinutes: 90 })).toEqual({
    productId: null,
    custom: "",
    description: "Chaveiro",
    qty: 4,
    unitPrice: 12.9,
    discountPct: 0,
    unitCost: 3.21,
    printMinutes: 22.5,
  });
  expect(itemFromCalc({ description: "", pieces: 0, unitPrice: 10, unitCost: 2, printMinutes: 30 })).toMatchObject({ description: "Peça impressa em 3D", qty: 1, printMinutes: 30 });
});

test("preço escolhido na calculadora vira o canal do pedido", () => {
  expect(orderChannelOf(PRICE_NAMES.consumer.name)).toBe(CONSUMER);
  expect(orderChannelOf(PRICE_NAMES.resale.name)).toBe(RESALE);
  expect(orderChannelOf("Shopee")).toBe("Shopee");
});
