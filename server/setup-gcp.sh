#!/bin/bash
# Script de setup/reinstallation du serveur CrapKa sur VM GCP Ubuntu 22.04
# IP VM : 35.184.245.186
# Exécuter depuis le home directory (~)

set -e

echo "=== 1. Mise à jour système ==="
sudo apt update && sudo apt upgrade -y

echo "=== 2. Installation Python + Git ==="
sudo apt install -y python3-pip python3-venv git

echo "=== 3. Clone du repo ==="
if [ -d "CrapKa" ]; then
  echo "Repo déjà présent, mise à jour..."
  cd CrapKa && git pull origin reseau-2j && cd ..
else
  git clone https://github.com/JFK-SCIK/CrapKa.git
  cd CrapKa && git checkout reseau-2j && cd ..
fi

echo "=== 4. Setup environnement Python ==="
python3 -m venv ~/venv
~/venv/bin/pip install -r ~/CrapKa/server/requirements.txt

echo "=== 5. Installation Caddy (reverse proxy HTTPS) ==="
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy

echo "=== 6. Service systemd FastAPI ==="
sudo tee /etc/systemd/system/crapka.service > /dev/null <<EOF
[Unit]
Description=CrapKa FastAPI Server
After=network.target

[Service]
User=$USER
WorkingDirectory=$HOME/CrapKa/server
ExecStart=$HOME/venv/bin/uvicorn main:app --host 127.0.0.1 --port 8000
Restart=always
RestartSec=3
Environment=CRAPKA_ADMIN_PWD=${CRAPKA_ADMIN_PWD:-}
Environment=CRAPKA_SERVICE=crapka
Environment=CRAPKA_BRANCH=reseau-2j

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable crapka
sudo systemctl start crapka

echo "=== 7. Sudoers — deploy sans mot de passe ==="
echo "$USER ALL=(ALL) NOPASSWD: /usr/bin/systemctl restart crapka, /usr/bin/systemctl restart crapka-preprod" \
  | sudo tee /etc/sudoers.d/crapka-deploy > /dev/null
sudo chmod 440 /etc/sudoers.d/crapka-deploy

echo "=== Terminé ! ==="
echo "FastAPI tourne sur 127.0.0.1:8000"
echo "Prochaine étape : configurer Caddy + DuckDNS pour HTTPS"
