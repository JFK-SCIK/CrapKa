#!/bin/bash
# ── CrapKa Management ─────────────────────────────────────────────────────────
DIR="$(cd "$(dirname "$0")" && pwd)"

_connected() {
  local count
  count=$(ss -tn | grep -c 8000 || true)
  echo $((count / 2))
}

_header() {
  clear
  echo "╔══════════════════════════════════════╗"
  echo "║        CrapKa — Gestion serveur      ║"
  local p
  p=$(_connected)
  if [ "$p" -gt 0 ]; then
    echo "║  ⚡ $p joueur(s) connecté(s)           ║"
  else
    echo "║  ✓  Serveur vide                     ║"
  fi
  echo "╚══════════════════════════════════════╝"
  echo ""
}

_pause() {
  echo ""
  read -rp "  Appuie sur Entrée pour continuer…"
}

while true; do
  _header
  echo "  Déploiement"
  echo "  ─────────────────────────────────────"
  echo "  1) Déployer maintenant (si personne connecté)"
  echo "  2) Déployer dès que le serveur est vide"
  echo ""
  echo "  Parties"
  echo "  ─────────────────────────────────────"
  echo "  3) Parties d'aujourd'hui"
  echo "  4) Parties d'hier"
  echo "  5) Toutes les parties"
  echo "  6) Parties d'une date précise"
  echo ""
  echo "  Monitoring"
  echo "  ─────────────────────────────────────"
  echo "  7) Statut serveur (/status)"
  echo "  8) Statistiques globales (/stats)"
  echo "  9) Connexions actives (ss)"
  echo " 10) Logs du service (50 dernières lignes)"
  echo ""
  echo "   0) Quitter"
  echo ""
  read -rp "  Choix : " choice

  case "$choice" in
    1)
      _header
      "$DIR/deploy.sh"
      _pause
      ;;
    2)
      _header
      "$DIR/deploy.sh" --wait
      _pause
      ;;
    3)
      _header
      python3 "$DIR/server/show_games.py" aujourd\'hui
      _pause
      ;;
    4)
      _header
      python3 "$DIR/server/show_games.py" hier
      _pause
      ;;
    5)
      _header
      python3 "$DIR/server/show_games.py" tout
      _pause
      ;;
    6)
      read -rp "  Date (YYYY-MM-DD) : " dt
      _header
      python3 "$DIR/server/show_games.py" "$dt"
      _pause
      ;;
    7)
      _header
      curl -s https://crapka.duckdns.org/status | python3 -m json.tool
      _pause
      ;;
    8)
      _header
      curl -s https://crapka.duckdns.org/stats | python3 -m json.tool
      _pause
      ;;
    9)
      _header
      echo "  Connexions actives sur le port 8000 :"
      echo ""
      ss -tn | grep 8000 || echo "  Aucune connexion."
      echo ""
      echo "  → $(_connected) joueur(s) connecté(s)"
      _pause
      ;;
   10)
      _header
      journalctl -u crapka -n 50 --no-pager
      _pause
      ;;
    0)
      clear
      echo "  À bientôt !"
      echo ""
      exit 0
      ;;
    *)
      ;;
  esac
done
