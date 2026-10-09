#!/usr/bin/env python3
"""Gera src/geometry/models/constellationLines.json a partir de constellations.lines.json do d3-celestial.

Fonte: https://github.com/ofrohn/d3-celestial (data/constellations.lines.json), Copyright (c) 2015 Olaf Frohn, BSD-3-Clause;
as linhas vêm da página das constelações da IAU, com ajustes do autor (ver docs/LICENCAS.md).
Uso: scripts/constellation-lines.py caminho/constellations.lines.json > src/geometry/models/constellationLines.json
Cada constelação (sigla IAU de 3 letras) vira uma lista de linhas, cada uma uma lista de [ascensão reta, declinação] em graus, J2000.
"""
import json
import sys

out = {}
for feature in json.load(open(sys.argv[1]))["features"]:
    lines = []
    for line in feature["geometry"]["coordinates"]:
        # GeoJSON dá a longitude de -180 a 180; a ascensão reta vai de 0 a 360
        lines.append([[round(lon % 360, 3), round(lat, 3)] for lon, lat in line])
    out[feature["id"]] = lines
print(json.dumps(out, separators=(",", ":")))
