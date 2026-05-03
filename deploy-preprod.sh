#!/bin/bash
# Mise à jour CrapKa préprod — port 8001, service crapka-preprod
# Usage : ./deploy-preprod.sh          → immédiat si personne connecté
#         ./deploy-preprod.sh --wait   → attend déconnexion

_do_deploy() {
  echo "✓ Personne connecté — mise à jour préprod en cours…"
  cd ~/CrapKa && git pull origin reseau-2j && sudo systemctl restart crapka-preprod && echo "✓ Service préprod relancé."
}

_connected() {
  local count
  count=$(ss -tn | grep -c 8001 || true)
  echo $((count / 2))
}

if [ "${1}" = "--wait" ]; then
  echo "En attente de déconnexion préprod…"
  while [ "$(_connected)" -gt 0 ]; do
    echo "  $(_connected) joueur(s) encore connecté(s) — nouvelle vérification dans 30s"
    sleep 30
  done
  _do_deploy
else
  players=$(_connected)
  if [ "$players" -gt 0 ]; then
    echo "⚠️  $players joueur(s) connecté(s) en préprod — redémarrage annulé."
    echo "    Relancez avec : ~/CrapKa/deploy-preprod.sh --wait"
    exit 1
  fi
  _do_deploy
fi
