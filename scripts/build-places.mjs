// Gera as listas de lugares do mapa estelar (#196), offline, em src/data/places/:
//   brasil.txt  todos os municípios do IBGE com latitude, longitude e fuso (kelvins/municipios-brasileiros, MIT; o fuso sai de tz-lookup)
//   mundo.txt   cidades do mundo com mais de 15 mil habitantes (GeoNames cities15000, CC-BY 4.0), sem as do Brasil
// Uso: node scripts/build-places.mjs <municipios.csv> <estados.csv> <cities15000.txt>
// Fontes: https://github.com/kelvins/municipios-brasileiros/tree/main/csv e https://download.geonames.org/export/dump/cities15000.zip
import { readFileSync, writeFileSync } from "node:fs";
import tzlookup from "tz-lookup";

const [munFile, ufFile, geoFile] = process.argv.slice(2);
if (!munFile || !ufFile || !geoFile) {
  console.error("uso: node scripts/build-places.mjs <municipios.csv> <estados.csv> <cities15000.txt>");
  process.exit(2);
}
const OUT = new URL("../src/data/places/", import.meta.url);
const r4 = (s) => String(Math.round(parseFloat(s) * 1e4) / 1e4);
const table = (rows) => [...new Set(rows.map((r) => r.tz))];
const write = (name, rows, cols) => {
  const tzs = table(rows);
  const lines = [tzs.join("|"), ...rows.map((r) => cols(r, tzs.indexOf(r.tz)).join("|"))];
  writeFileSync(new URL(name, OUT), lines.join("\n") + "\n");
  console.log(name, rows.length, "linhas");
};

const ufs = new Map(readFileSync(ufFile, "utf8").replace(/^﻿/, "").trim().split("\n").slice(1).map((l) => l.split(",")).map((c) => [c[0], c[1]]));
// zonas IANA do Brasil: se o tz-lookup cair numa zona de fora (município na fronteira), vale a do IBGE
const BR_ZONES = new Set("Noronha Belem Fortaleza Recife Araguaina Maceio Bahia Sao_Paulo Campo_Grande Cuiaba Santarem Porto_Velho Boa_Vista Manaus Eirunepe Rio_Branco".split(" ").map((z) => `America/${z}`));
const brTz = (lat, lon, csvTz) => {
  const z = tzlookup(lat, lon);
  return BR_ZONES.has(z) ? z : csvTz;
};
const br = readFileSync(munFile, "utf8").trim().split("\n").slice(1).map((l) => {
  const c = l.split(",");
  return { name: c[1], uf: ufs.get(c[5]), lat: r4(c[2]), lon: r4(c[3]), capital: c[4] === "1" ? "1" : "", tz: brTz(Number(c[2]), Number(c[3]), c[8].trim()) }; // fuso pelos limites IANA, o mesmo que o app usa para qualquer coordenada
});
write("brasil.txt", br, (r, t) => [r.name, r.uf, r.lat, r.lon, t, r.capital]);

// nomes em português das cidades mais procuradas (o GeoNames traz o nome em inglês)
const PT = {
  "Lisbon|PT": "Lisboa", "New York City|US": "Nova York", "London|GB": "Londres", "Rome|IT": "Roma", "Tokyo|JP": "Tóquio", "Beijing|CN": "Pequim",
  "Moscow|RU": "Moscou", "Mexico City|MX": "Cidade do México", "Vienna|AT": "Viena", "Prague|CZ": "Praga", "Warsaw|PL": "Varsóvia",
  "Athens|GR": "Atenas", "Brussels|BE": "Bruxelas", "Geneva|CH": "Genebra", "Copenhagen|DK": "Copenhague", "Edinburgh|GB": "Edimburgo",
  "Florence|IT": "Florença", "Venice|IT": "Veneza", "Milan|IT": "Milão", "Naples|IT": "Nápoles", "Seville|ES": "Sevilha", "Cairo|EG": "Cairo",
  "Jerusalem|IL": "Jerusalém", "Havana|CU": "Havana", "Cologne|DE": "Colônia", "Munich|DE": "Munique", "Zurich|CH": "Zurique", "Bangkok|TH": "Bangcoc",
  "Seoul|KR": "Seul", "Hanoi|VN": "Hanói", "Kyiv|UA": "Kiev", "Saint Petersburg|RU": "São Petersburgo", "Algiers|DZ": "Argel", "Tunis|TN": "Túnis",
  "Panama City|PA": "Cidade do Panamá", "Asunción|PY": "Assunção", "Bogotá|CO": "Bogotá", "Porto|PT": "Porto", "Luanda|AO": "Luanda", "Maputo|MZ": "Maputo",
};
const world = readFileSync(geoFile, "utf8").trim().split("\n").map((l) => l.split("\t")).filter((c) => c[8] !== "BR").map((c) => {
  const pt = PT[`${c[1]}|${c[8]}`];
  return { name: pt ?? c[1], alt: pt ? c[1] : "", cc: c[8], lat: r4(c[4]), lon: r4(c[5]), tz: c[17], pop: c[14] };
});
write("mundo.txt", world, (r, t) => [r.name, r.cc, r.lat, r.lon, t, r.pop, r.alt]);
