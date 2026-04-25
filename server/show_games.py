#!/usr/bin/env python3
"""Affiche les parties enregistrées dans games.json.

Usage :
  python3 show_games.py              # aujourd'hui
  python3 show_games.py hier         # hier
  python3 show_games.py 2025-04-24   # une date précise
  python3 show_games.py tout         # toutes les parties
"""
import json, sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

LOG = Path(__file__).parent / 'games.json'

if not LOG.exists():
    print("Aucune partie enregistrée.")
    sys.exit(0)

games = json.loads(LOG.read_text(encoding='utf-8'))

arg = sys.argv[1].lower() if len(sys.argv) > 1 else 'aujourd\'hui'
today = datetime.now(timezone.utc).date()

if arg in ('tout', 'all'):
    target = None
elif arg in ('hier', 'yesterday'):
    target = today - timedelta(days=1)
else:
    try:
        target = datetime.strptime(arg, '%Y-%m-%d').date()
    except ValueError:
        target = today

filtered = [
    g for g in games
    if target is None or datetime.fromisoformat(g['ts'].replace('Z', '+00:00')).date() == target
]

label = 'toutes les parties' if target is None else str(target)
print(f"\n── Parties du {label} ({'%d partie(s)' % len(filtered)}) ──\n")

if not filtered:
    print("  Aucune partie ce jour-là.")
else:
    for g in filtered:
        t = datetime.fromisoformat(g['ts'].replace('Z', '+00:00')).strftime('%H:%M')
        mode = 'IA' if g['loser'] == 'IA' or g['winner'] == 'IA' else 'Réseau'
        print(f"  {t}  [{mode}]  🏆 {g['winner']}  vs  {g['loser']}")

print()
