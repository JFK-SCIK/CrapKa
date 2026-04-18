# Infrastructure CrapKa — Serveur réseau

## VM Google Cloud Platform
- **Projet GCP** : crapka
- **Instance** : vm-crapka-1
- **Zone** : us-central1-a
- **IP externe** : 35.184.245.186
- **OS** : Ubuntu 22.04 LTS
- **Type** : e2-micro (Always Free)
- **Disque** : 30 Go persistant standard
- **Accès SSH** : via console GCP → Compute Engine → VM Instances → SSH

## DuckDNS
- **Domaine** : crapka.duckdns.org
- **Compte** : kleinfinger.jf@gmail.com
- **Token** : 4fda7c6d-6ff4-4fe1-b54d-0f09c7c5066b
- **IP pointée** : 35.184.245.186

## Firewall GCP ouvert
- Port 80 (HTTP) — règle http-server
- Port 443 (HTTPS) — règle https-server
- Port 8000 (FastAPI dev) — règle crapka-8000

## Serveur FastAPI
- **Repo** : https://github.com/JFK-SCIK/CrapKa (branche reseau-2j)
- **Chemin** : ~/CrapKa/server/
- **Lancer manuellement** : `source ~/CrapKa/server/venv/bin/activate && uvicorn main:app --host 0.0.0.0 --port 8000`
- **Test** : http://35.184.245.186:8000/health → {"ok":true}

## HTTPS — À configurer (prochaine étape)
- **Outil** : Caddy (reverse proxy, gère Let's Encrypt automatiquement)
- **URL finale** : wss://crapka.duckdns.org
- **Frontend** : https://jfk-scik.github.io/CrapKa

## Script de réinstallation
Voir `setup-gcp.sh` dans ce dossier.
