#!/usr/bin/env python3
"""Gera src/geometry/models/starCatalog.json a partir do Yale Bright Star Catalogue (BSC5, Hoffleit & Warren, ADC/NASA).

Dados astronômicos de domínio público; o catálogo vem de http://tdc-www.harvard.edu/catalogs/bsc5.dat.gz.
Uso: scripts/star-catalog.py caminho/bsc5.dat [magnitude_maxima]   (padrão 5.0)
Cada estrela vira [ascensão reta em graus, declinação em graus, magnitude V], J2000, da mais brilhante para a mais fraca.
"""
import json
import sys

path = sys.argv[1]
limit = float(sys.argv[2]) if len(sys.argv) > 2 else 5.0
stars = []
for line in open(path, encoding="latin-1"):
    line = line.rstrip("\n")
    ra, dec_sign, vmag = line[75:83].strip(), line[83:84], line[102:107].strip()
    if len(line) < 107 or not ra or not vmag:
        continue  # novas e objetos sem posição ou magnitude
    mag = float(vmag)
    if mag > limit:
        continue
    ra_deg = 15 * (int(line[75:77]) + int(line[77:79]) / 60 + float(line[79:83]) / 3600)
    dec_deg = int(line[84:86]) + int(line[86:88]) / 60 + int(line[88:90]) / 3600
    stars.append([round(ra_deg, 3), round(-dec_deg if dec_sign == "-" else dec_deg, 3), mag])
stars.sort(key=lambda s: s[2])
print(json.dumps(stars, separators=(",", ":")))
