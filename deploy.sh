#!/bin/bash
# Mise à jour CrapKa — relance uniquement si personne n'est connecté
count=$(ss -tn | grep -c 8000 || true)
players=$((count / 2))

if [ "$players" -gt 0 ]; then
  echo "⚠️  $players joueur(s) connecté(s) — redémarrage annulé."
  exit 1
fi

echo "✓ Personne connecté — mise à jour en cours…"
cd ~/CrapKa && git pull origin reseau-2j && sudo systemctl restart crapka && echo "✓ Service relancé."
