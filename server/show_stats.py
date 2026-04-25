#!/usr/bin/env python3
"""Affiche stats.json sous forme de tableau."""
import json
from pathlib import Path

FILE = Path(__file__).parent / 'stats.json'

if not FILE.exists():
    print("\n  Aucune statistique enregistrée.\n")
    raise SystemExit

data = json.loads(FILE.read_text(encoding='utf-8'))
if not data:
    print("\n  Aucune statistique enregistrée.\n")
    raise SystemExit

def pct(w, g):
    return f"{round(w/g*100)}%" if g else "—"

def row(joueur, p, v, d, pc, indent=""):
    return f"  {indent}{joueur:<22} {p:>7}  {v:>9}  {d:>8}  {pc:>7}"

SEP = "  " + "─" * 55
HDR = row("Joueur", "Parties", "Victoires", "Défaites", "%")

print()
print(SEP)
print(HDR)
print(SEP)

for name, st in sorted(data.items(), key=lambda x: -x[1]['games']):
    print(row(name, st['games'], st['wins'], st['losses'], pct(st['wins'], st['games'])))
    for opp, vs in sorted(st['vs'].items(), key=lambda x: -x[1]['games']):
        print(row(f"↳ vs {opp}", vs['games'], vs['wins'], vs['losses'],
                  pct(vs['wins'], vs['games']), indent="   "))

print(SEP)
print()
