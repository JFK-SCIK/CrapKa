#!/bin/bash
# Mise à jour CrapKa — relance uniquement si personne n'est connecté
# Usage : ./deploy.sh          → vérifie et relance ou annule
#         ./deploy.sh --wait   → attend que le serveur se vide, puis relance

_do_deploy() {
  echo "✓ Personne connecté — mise à jour en cours…"
  cd ~/CrapKa && git pull origin reseau-2j && sudo systemctl restart crapka && echo "✓ Service relancé."
}

_connected() {
  local count
  count=$(ss -tn | grep -c 8000 || true)
  echo $((count / 2))
}

if [ "${1}" = "--wait" ]; then
  echo "En attente de déconnexion…"
  while [ "$(_connected)" -gt 0 ]; do
    echo "  $(_connected) joueur(s) encore connecté(s) — nouvelle vérification dans 30s"
    sleep 30
  done
  _do_deploy
else
  players=$(_connected)
  if [ "$players" -gt 0 ]; then
    echo "⚠️  $players joueur(s) connecté(s) — redémarrage annulé."
    echo "    Relancez avec : ~/CrapKa/deploy.sh --wait"
    exit 1
  fi
  _do_deploy
fi
