#!/bin/bash
# Installation/mise à jour du service préprod CrapKa sur la VM GCP
# Prérequis : setup-gcp.sh déjà exécuté (venv à ~/venv, service crapka prod installé)
# Usage : cd ~/CrapKa && bash server/setup-preprod.sh

set -e

echo "=== Service systemd crapka-preprod (port 8001) ==="
sudo tee /etc/systemd/system/crapka-preprod.service > /dev/null <<EOF
[Unit]
Description=CrapKa FastAPI Server (préprod)
After=network.target

[Service]
User=$USER
WorkingDirectory=$HOME/CrapKa/server
ExecStart=$HOME/venv/bin/uvicorn main:app --host 0.0.0.0 --port 8001
Restart=always
RestartSec=3
Environment=CRAPKA_ADMIN_PWD=${CRAPKA_ADMIN_PWD:-}
Environment=CRAPKA_SERVICE=crapka-preprod
Environment=CRAPKA_BRANCH=reseau-2j
Environment=CRAPKA_DATA_DIR=$HOME/CrapKa/server/preprod-data

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable crapka-preprod
sudo systemctl restart crapka-preprod

echo "=== Sudoers — deploy sans mot de passe ==="
echo "$USER ALL=(ALL) NOPASSWD: /usr/bin/systemctl restart crapka, /usr/bin/systemctl restart crapka-preprod" \
  | sudo tee /etc/sudoers.d/crapka-deploy > /dev/null
sudo chmod 440 /etc/sudoers.d/crapka-deploy

echo ""
echo "✓ Service préprod installé/mis à jour."
echo "  Accès : http://crapka.duckdns.org:8001"
echo "  Admin : http://crapka.duckdns.org:8001/admin?pwd=..."
echo "  Données : $HOME/CrapKa/server/preprod-data/ (isolées de la prod)"
echo ""
echo "  Vérification :"
echo "  sudo systemctl status crapka-preprod"
echo "  curl http://localhost:8001/health"
