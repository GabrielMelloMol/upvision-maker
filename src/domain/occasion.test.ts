import { describe, expect, test } from "vitest";
import { occasionDate, upcomingOccasion } from "./occasion";

const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

describe("ocasiões do calendário", () => {
  test("datas móveis de 2026 e 2027", () => {
    expect(iso(occasionDate("maes", 2026))).toBe("2026-05-10");
    expect(iso(occasionDate("pais", 2026))).toBe("2026-08-09");
    expect(iso(occasionDate("pascoa", 2026))).toBe("2026-04-05");
    expect(iso(occasionDate("pascoa", 2027))).toBe("2027-03-28");
    expect(iso(occasionDate("maes", 2027))).toBe("2027-05-09");
  });

  test("destaca a ocasião mais próxima dentro da antecedência", () => {
    expect(upcomingOccasion(new Date(2026, 3, 20))).toEqual({ id: "maes", days: 20 });
    expect(upcomingOccasion(new Date(2026, 9, 8))).toEqual({ id: "criancas", days: 4 });
    expect(upcomingOccasion(new Date(2026, 11, 25))).toEqual({ id: "natal", days: 0 });
    expect(upcomingOccasion(new Date(2026, 4, 25))?.id).toBe("junina");
  });

  test("passou a data, some; fora da antecedência, não destaca", () => {
    expect(upcomingOccasion(new Date(2026, 11, 26))).toBeNull();
    expect(upcomingOccasion(new Date(2026, 0, 15))).toBeNull();
    expect(upcomingOccasion(new Date(2026, 5, 25))?.id).not.toBe("junina");
  });

  test("a Páscoa do ano seguinte aparece no fim do ano antes de março", () => {
    expect(upcomingOccasion(new Date(2027, 1, 20))).toEqual({ id: "pascoa", days: 36 });
  });
});
