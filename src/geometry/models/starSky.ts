import lines from "./constellationLines.json";
import catalog from "./starCatalog.json";

/**
 * Cálculo do céu de um lugar e momento, tudo offline: estrelas do Yale Bright Star Catalogue (domínio público, J2000),
 * precessão simples até a data, tempo sideral, altura/azimute e projeção estereográfica centrada no zênite.
 */
export type Star = readonly [raDeg: number, decDeg: number, mag: number];
const STARS = catalog as unknown as Star[];
/** Linhas das constelações (sigla IAU → linhas de [ascensão reta, declinação] em graus, J2000). */
export const CONSTELLATION_LINES = lines as unknown as Record<string, [number, number][][]>;

const DEG = Math.PI / 180;
const J2000_JD = 2451545;
const DAYS_PER_CENTURY = 36525;

export type Place = { lat: number; lon: number };
export type Moment = { year: number; month: number; day: number; hour: number; minute: number; utcOffset: number };

/** Cidades (nome, latitude, longitude em graus; leste e norte positivos). Fuso e horário de verão ficam por conta de quem preenche. */
export const CITIES: readonly (readonly [id: string, name: string, lat: number, lon: number])[] = [
  ["aracaju", "Aracaju", -10.91, -37.07], ["belem", "Belém", -1.46, -48.5], ["belohorizonte", "Belo Horizonte", -19.92, -43.94],
  ["boavista", "Boa Vista", 2.82, -60.67], ["brasilia", "Brasília", -15.79, -47.88], ["campogrande", "Campo Grande", -20.47, -54.62],
  ["cuiaba", "Cuiabá", -15.6, -56.1], ["curitiba", "Curitiba", -25.43, -49.27], ["florianopolis", "Florianópolis", -27.6, -48.55],
  ["fortaleza", "Fortaleza", -3.73, -38.52], ["goiania", "Goiânia", -16.68, -49.25], ["joaopessoa", "João Pessoa", -7.12, -34.86],
  ["macapa", "Macapá", 0.03, -51.07], ["maceio", "Maceió", -9.67, -35.74], ["manaus", "Manaus", -3.12, -60.02],
  ["natal", "Natal", -5.79, -35.21], ["palmas", "Palmas", -10.18, -48.33], ["portoalegre", "Porto Alegre", -30.03, -51.23],
  ["portovelho", "Porto Velho", -8.76, -63.9], ["recife", "Recife", -8.05, -34.88], ["riobranco", "Rio Branco", -9.97, -67.81],
  ["riodejaneiro", "Rio de Janeiro", -22.91, -43.17], ["salvador", "Salvador", -12.97, -38.5], ["saoluis", "São Luís", -2.53, -44.3],
  ["saopaulo", "São Paulo", -23.55, -46.63], ["teresina", "Teresina", -5.09, -42.8], ["vitoria", "Vitória", -20.32, -40.34],
  ["lisboa", "Lisboa", 38.72, -9.14], ["porto", "Porto", 41.15, -8.61], ["buenosaires", "Buenos Aires", -34.6, -58.38],
  ["novayork", "Nova York", 40.71, -74.01], ["miami", "Miami", 25.76, -80.19], ["londres", "Londres", 51.51, -0.13],
  ["paris", "Paris", 48.86, 2.35], ["madri", "Madri", 40.42, -3.7], ["roma", "Roma", 41.9, 12.5], ["toquio", "Tóquio", 35.68, 139.69],
];

/** Dia juliano de uma data e hora UTC (calendário gregoriano). */
export function julianDay(year: number, month: number, day: number, hourUtc: number): number {
  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  const jdn = day + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) - 32045;
  return jdn - 0.5 + hourUtc / 24;
}

/** Instante local → dia juliano UTC. */
export const momentJd = (t: Moment): number => julianDay(t.year, t.month, t.day, t.hour + t.minute / 60 - t.utcOffset);

/** Tempo sideral local em graus, 0 a 360. */
export function localSiderealDeg(jd: number, lonDeg: number): number {
  const gmst = 280.46061837 + 360.98564736629 * (jd - J2000_JD);
  return (((gmst + lonDeg) % 360) + 360) % 360;
}

/** Posição de J2000 para a data (precessão de primeira ordem; erro abaixo de 0,1° em ±50 anos). */
export function precess(raDeg: number, decDeg: number, jd: number): [number, number] {
  const T = (jd - J2000_JD) / DAYS_PER_CENTURY;
  const m = 1.2812323 * T, n = 0.5567530 * T; // graus
  const ra = raDeg * DEG, dec = decDeg * DEG;
  return [raDeg + m + n * Math.sin(ra) * Math.tan(dec), decDeg + n * Math.cos(ra)];
}

/** Altura e azimute (graus; azimute de 0 = norte, 90 = leste) de uma posição no céu para um lugar e um tempo sideral. */
export function altAz(raDeg: number, decDeg: number, lstDeg: number, latDeg: number): { alt: number; az: number } {
  const ha = (lstDeg - raDeg) * DEG, dec = decDeg * DEG, lat = latDeg * DEG;
  const sinAlt = Math.sin(dec) * Math.sin(lat) + Math.cos(dec) * Math.cos(lat) * Math.cos(ha);
  const alt = Math.asin(Math.max(-1, Math.min(1, sinAlt)));
  const az = Math.atan2(-Math.cos(dec) * Math.sin(ha), Math.sin(dec) * Math.cos(lat) - Math.cos(dec) * Math.sin(lat) * Math.cos(ha));
  return { alt: alt / DEG, az: (((az / DEG) % 360) + 360) % 360 };
}

export type SkyStar = { x: number; y: number; mag: number };

/**
 * Estrelas acima do horizonte, na projeção estereográfica olhando para cima: o zênite é o centro (0, 0), o horizonte é o
 * círculo de raio 1, o norte fica em cima e o leste à esquerda (como no céu visto de baixo). Das mais brilhantes às mais fracas.
 */
export function skyStars(place: Place, when: Moment, maxMag: number): SkyStar[] {
  const jd = momentJd(when);
  const lst = localSiderealDeg(jd, place.lon);
  const out: SkyStar[] = [];
  for (const [ra0, dec0, mag] of STARS) {
    if (mag > maxMag) break; // ordenadas por brilho
    const [ra, dec] = precess(ra0, dec0, jd);
    const { alt, az } = altAz(ra, dec, lst, place.lat);
    if (alt <= 0) continue;
    const r = Math.tan(((90 - alt) * DEG) / 2); // 0 no zênite, 1 no horizonte
    out.push({ x: -r * Math.sin(az * DEG), y: r * Math.cos(az * DEG), mag });
  }
  return out;
}

export type SkyLine = { id: string; points: [number, number][] };

/**
 * Linhas das constelações que aparecem acima do horizonte, na mesma projeção de `skyStars`. A linha que cruza o horizonte
 * é cortada nele; os pontos abaixo do horizonte não entram.
 */
export function skyLines(place: Place, when: Moment): SkyLine[] {
  const jd = momentJd(when);
  const lst = localSiderealDeg(jd, place.lon);
  const project = ([ra0, dec0]: [number, number]): Dir => {
    const [ra, dec] = precess(ra0, dec0, jd);
    const { alt, az } = altAz(ra, dec, lst, place.lat);
    const r = Math.tan(((90 - alt) * DEG) / 2);
    const c = Math.cos(alt * DEG);
    return { alt, x: -r * Math.sin(az * DEG), y: r * Math.cos(az * DEG), e: c * Math.sin(az * DEG), n: c * Math.cos(az * DEG), z: Math.sin(alt * DEG) };
  };
  const out: SkyLine[] = [];
  for (const [id, polylines] of Object.entries(CONSTELLATION_LINES)) {
    for (const line of polylines) {
      const pts = line.map(project);
      let run: [number, number][] = [];
      const flush = () => {
        if (run.length > 1) out.push({ id, points: run });
        run = [];
      };
      pts.forEach((p, i) => {
        const prev = pts[i - 1];
        if (p.alt > 0) {
          if (prev && prev.alt <= 0) run.push(horizon(prev, p));
          run.push([p.x, p.y]);
        } else {
          if (prev && prev.alt > 0) run.push(horizon(p, prev));
          flush();
        }
      });
      flush();
    }
  }
  return out;
}

type Dir = { alt: number; x: number; y: number; e: number; n: number; z: number };

/** Onde o trecho `below` (abaixo do horizonte) → `above` cruza o horizonte: interpola o vetor no espaço e projeta com raio 1. */
function horizon(below: Dir, above: Dir): [number, number] {
  const t = above.z / (above.z - below.z);
  const e = above.e + (below.e - above.e) * t, n = above.n + (below.n - above.n) * t;
  const h = Math.hypot(e, n) || 1;
  return [-e / h, n / h];
}

/** Quantas estrelas o catálogo embutido tem (até a magnitude 5,0). */
export const CATALOG_SIZE = STARS.length;
