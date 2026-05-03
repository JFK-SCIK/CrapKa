#!/bin/bash
# Installation du service préprod CrapKa sur la VM GCP
# Prérequis : setup-gcp.sh déjà exécuté (venv, dépendances, service crapka prod installé)
# Exécuter depuis le home directory (~)

set -e

echo "=== 1. Service systemd crapka-preprod (port 8001) ==="
sudo tee /etc/systemd/system/crapka-preprod.service > /dev/null <<EOF
[Unit]
Description=CrapKa FastAPI Server (préprod)
After=network.target

[Service]
User=$USER
WorkingDirectory=$HOME/CrapKa/server
ExecStart=$HOME/CrapKa/server/venv/bin/uvicorn main:app --host 127.0.0.1 --port 8001
Restart=always
RestartSec=3
Environment=CRAPKA_ADMIN_PWD=${CRAPKA_ADMIN_PWD:-}
Environment=CRAPKA_SERVICE=crapka-preprod
Environment=CRAPKA_BRANCH=reseau-2j

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable crapka-preprod
sudo systemctl start crapka-preprod

echo ""
echo "=== 2. Firewall GCP — port 8001 ==="
echo "Ouvrir dans la console GCP :"
echo "  Compute Engine → Règles de pare-feu → Créer une règle"
echo "  Nom : crapka-8001"
echo "  Cible : Toutes les instances (ou balise http-server)"
echo "  Plage IP source : 0.0.0.0/0"
echo "  Port TCP : 8001"
echo ""
echo "  Ou via gcloud :"
echo "  gcloud compute firewall-rules create crapka-8001 \\"
echo "    --allow tcp:8001 --description='CrapKa preprod'"
echo ""
echo "=== 3. Caddy (si configuré) ==="
echo "Ajouter dans /etc/caddy/Caddyfile :"
echo "  crapka.duckdns.org:8001 {"
echo "    reverse_proxy 127.0.0.1:8001"
echo "  }"
echo "  puis : sudo systemctl reload caddy"
echo ""
echo "=== 4. Vérification ==="
echo "  sudo systemctl status crapka-preprod"
echo "  curl http://localhost:8001/health"
echo ""
echo "✓ Service préprod installé."
echo "  Accès : http://crapka.duckdns.org:8001"
echo "  Admin : http://crapka.duckdns.org:8001/admin?pwd=..."
echo ""
echo "  Note : stats.json et games.json sont partagés avec la prod."
echo "  Pour des données isolées, créer ~/CrapKa/server-preprod/ et adapter les chemins."
