import { describe, expect, test } from "vitest";
import { altAz, CATALOG_SIZE, CITIES, julianDay, localSiderealDeg, momentJd, precess, skyStars, type Moment } from "./starSky";

/** Noite de Natal de 2024, 22h em São Paulo (UTC-3): conferido à mão com o tempo sideral (LST ≈ 62°). */
const NATAL: Moment = { year: 2024, month: 12, day: 24, hour: 22, minute: 0, utcOffset: -3 };
const SAO_PAULO = { lat: -23.55, lon: -46.63 };

describe("céu de um lugar e momento (#106)", () => {
  test("dia juliano e tempo sideral nas referências do J2000", () => {
    expect(julianDay(2000, 1, 1, 12)).toBe(2451545);
    expect(julianDay(1987, 4, 10, 0)).toBeCloseTo(2446895.5, 6); // exemplo clássico
    expect(localSiderealDeg(2451545, 0)).toBeCloseTo(280.4606, 3);
    expect(localSiderealDeg(2451545, 15)).toBeCloseTo(295.4606, 3);
  });

  test("o fuso converte a hora local em UTC", () => {
    expect(momentJd(NATAL)).toBeCloseTo(julianDay(2024, 12, 25, 1), 9);
  });

  test("altura e azimute: zênite, norte e leste", () => {
    expect(altAz(120, -30, 120, -30).alt).toBeCloseTo(90, 6); // HA = 0 e dec = latitude
    const south = altAz(100, 10, 100, 40); // meridiano, ao sul do zênite
    expect(south.az).toBeCloseTo(180, 6);
    expect(south.alt).toBeCloseTo(60, 6);
    expect(altAz(90, 0, 0, 0).az).toBeCloseTo(90, 6); // equador, HA = -90°: nascendo no leste
  });

  test("precessão: nada em J2000 e cerca de 0,28° em 25 anos para a Sirius", () => {
    expect(precess(101.287, -16.716, 2451545)).toEqual([101.287, -16.716]);
    const [ra, dec] = precess(101.287, -16.716, momentJd(NATAL));
    expect(ra - 101.287).toBeGreaterThan(0.25); // (1,281° + 0,557° · sen α · tg δ) por século × 0,25 século
    expect(ra - 101.287).toBeLessThan(0.31);
    expect(Math.abs(dec + 16.716)).toBeLessThan(0.1);
  });

  test("Sirius, Betelgeuse e o Cruzeiro do Sul na noite de Natal em São Paulo", () => {
    const sirius = altOf(101.287, -16.716);
    expect(sirius.alt).toBeCloseTo(52.7, 0);
    expect(sirius.az).toBeCloseTo(86.9, 0); // a leste
    const betelgeuse = altOf(88.793, 7.407);
    expect(betelgeuse.alt).toBeCloseTo(49.5, 0);
    expect(betelgeuse.az).toBeCloseTo(43.4, 0); // a nordeste
    const acrux = altOf(186.65, -63.1);
    expect(acrux.alt).toBeCloseTo(7, 0); // Cruzeiro baixo no sul-sudeste
    expect(acrux.az).toBeCloseTo(158, 0);
  });

  test("projeção: o norte fica em cima, o leste à esquerda, o horizonte no raio 1 e o zênite no centro", () => {
    const stars = skyStars(SAO_PAULO, NATAL, 5);
    expect(stars.length).toBeGreaterThan(300);
    expect(stars.every((s) => Math.hypot(s.x, s.y) < 1)).toBe(true);
    // Sirius (mag -1,46) é a 1ª: a leste (x < 0) e a meia altura (raio ≈ tan(18,6°) ≈ 0,34)
    expect(stars[0].mag).toBeCloseTo(-1.46, 2);
    expect(stars[0].x).toBeCloseTo(-0.336, 2);
    expect(Math.hypot(stars[0].x, stars[0].y)).toBeCloseTo(Math.tan((37.3 * Math.PI) / 360), 2);
    // Betelgeuse a nordeste: x < 0 e y > 0
    const bet = stars.find((s) => Math.abs(s.mag - 0.5) < 0.001)!;
    expect(bet.x).toBeLessThan(0);
    expect(bet.y).toBeGreaterThan(0);
  });

  test("a Polar fica a cerca de 38° do zênite em Londres e some no hemisfério sul", () => {
    const londres = CITIES.find((c) => c[0] === "londres")!;
    // a Polar (mag 2,02) é a única de magnitude 2,02 quase no meio do eixo norte-sul
    const polar = skyStars({ lat: londres[2], lon: londres[3] }, NATAL, 2.1).find((s) => Math.abs(s.mag - 2.02) < 0.001 && Math.abs(s.x) < 0.03 && s.y > 0.2);
    expect(polar).toBeDefined();
    expect(Math.abs(polar!.x)).toBeLessThan(0.03);
    expect(polar!.y).toBeCloseTo(Math.tan(((90 - 51.5) * Math.PI) / 360), 1);
    expect(skyStars(SAO_PAULO, NATAL, 2.1).some((s) => Math.abs(s.mag - 2.02) < 0.001 && Math.abs(s.x) < 0.03 && Math.abs(s.y) > 0.2)).toBe(false);
  });

  test("menos estrelas com magnitude menor; catálogo completo até 5,0", () => {
    const n = (m: number) => skyStars(SAO_PAULO, NATAL, m).length;
    expect(n(3)).toBeLessThan(n(4));
    expect(n(4)).toBeLessThan(n(5));
    expect(n(5)).toBeLessThan(CATALOG_SIZE);
    expect(CATALOG_SIZE).toBeGreaterThan(1500);
  });
});

function altOf(ra: number, dec: number) {
  const jd = momentJd(NATAL);
  const [r, d] = precess(ra, dec, jd);
  return altAz(r, d, localSiderealDeg(jd, SAO_PAULO.lon), SAO_PAULO.lat);
}
