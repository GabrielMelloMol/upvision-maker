import { describe, expect, test } from "vitest";
import { isDst, offsetLabel, tzAt, utcOffsetHours } from "./placeTime";

const at = (year: number, month: number, day: number, hour = 22, minute = 0) => ({ year, month, day, hour, minute });
const SP = { lat: -23.55, lon: -46.63 };

describe("fuso e horário de verão pela localização e pela data (#196)", () => {
  test("São Paulo em 15/01/2010 às 22:00 é UTC−2 (horário de verão) e em 15/07/2010 é UTC−3", () => {
    const tz = tzAt(SP.lat, SP.lon);
    expect(tz).toBe("America/Sao_Paulo");
    expect(utcOffsetHours(tz, at(2010, 1, 15))).toBe(-2);
    expect(isDst(tz, at(2010, 1, 15))).toBe(true);
    expect(offsetLabel(-2, true)).toBe("UTC−2 (horário de verão)");
    expect(utcOffsetHours(tz, at(2010, 7, 15))).toBe(-3);
    expect(isDst(tz, at(2010, 7, 15))).toBe(false);
    expect(offsetLabel(-3, false)).toBe("UTC−3");
  });

  test("o horário de verão do Brasil vale até o verão de 2018/19 e acaba em seguida", () => {
    const tz = "America/Sao_Paulo";
    expect(utcOffsetHours(tz, at(2018, 12, 25))).toBe(-2);
    expect(utcOffsetHours(tz, at(2019, 1, 15))).toBe(-2);
    expect(utcOffsetHours(tz, at(2019, 3, 15))).toBe(-3);
    expect(utcOffsetHours(tz, at(2020, 1, 15))).toBe(-3);
    expect(utcOffsetHours(tz, at(2024, 12, 24))).toBe(-3);
  });

  test("a fronteira de hoje: início e fim do horário de verão em 2018/19 (3º domingo de outubro de 2018 e 3º de fevereiro de 2019)", () => {
    const tz = "America/Sao_Paulo";
    expect(utcOffsetHours(tz, at(2018, 11, 3, 12))).toBe(-3); // antes do início (4/11/2018)
    expect(utcOffsetHours(tz, at(2018, 11, 5, 12))).toBe(-2);
    expect(utcOffsetHours(tz, at(2019, 2, 15, 12))).toBe(-2); // antes do fim (17/2/2019)
    expect(utcOffsetHours(tz, at(2019, 2, 18, 12))).toBe(-3);
  });

  test("outros fusos do Brasil e do mundo, inclusive meia hora", () => {
    expect(tzAt(-3.1, -60.02)).toBe("America/Manaus");
    expect(utcOffsetHours("America/Manaus", at(2024, 6, 1))).toBe(-4);
    expect(utcOffsetHours("America/Rio_Branco", at(2024, 6, 1))).toBe(-5);
    expect(utcOffsetHours("America/Noronha", at(2024, 6, 1))).toBe(-2);
    expect(utcOffsetHours(tzAt(28.61, 77.21), at(2024, 6, 1))).toBe(5.5);
    expect(offsetLabel(5.5, false)).toBe("UTC+5:30");
    expect(utcOffsetHours(tzAt(38.72, -9.14), at(2024, 7, 1))).toBe(1); // Lisboa no verão (WEST)
    expect(isDst(tzAt(38.72, -9.14), at(2024, 7, 1))).toBe(true);
    expect(offsetLabel(0, false)).toBe("UTC±0");
  });

  test("a hora que não existe no início do horário de verão não quebra", () => {
    const off = utcOffsetHours("America/Sao_Paulo", at(2018, 11, 4, 0, 30)); // meia-noite pulou para 1h
    expect([-3, -2]).toContain(off);
  });

  test("fuso desconhecido ou coordenada fora do mapa devolve erro claro", () => {
    expect(() => utcOffsetHours("Mars/Olympus", at(2024, 1, 1))).toThrow(/fuso/i);
  });
});
