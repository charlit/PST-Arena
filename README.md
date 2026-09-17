# PST Arena ⚔️

Jeu d'arène multijoueur temps réel, pensé pour un navigateur mobile :
4 personnages, chacun avec son projectile, jusqu'à 10 joueurs en
simultané, cœurs de vie et armes améliorées qui popent sur la carte.
Auto-hébergé sur un Mac mini, avec Docker + Tailscale Funnel.

Construit avec un serveur Node.js/Express + WebSocket (`ws`), autoritaire
(boucle de jeu à 20 Hz), et un client Canvas 2D avec double joystick
tactile (déplacement + visée/tir), qui fonctionne aussi à la souris sur
ordinateur.

## Personnages

| Personnage | Style de projectile |
|---|---|
| 🔥 Freestill | Boule de feu, dégâts moyens, cadence moyenne |
| 🎯 Maxwell | Tir précis rapide, gros dégâts, cadence lente |
| ✨ Keketsk8 | 3 projectiles en éventail, courte portée |
| 🔮 Guigui | Projectile lent qui suit légèrement la cible la plus proche |

## Règles

- Déplacement au joystick gauche, visée + tir au joystick droit (tenir
  le joystick droit incliné tire automatiquement dans cette direction).
- Un cœur ❤️ soigne 35 PV. Une arme améliorée 🔫 augmente dégâts et
  cadence de tir pendant 15s, équipée automatiquement en marchant dessus.
- 100 PV, mort = réapparition 3s plus tard ailleurs sur la carte.
- Jusqu'à 10 joueurs en simultané ; au-delà, l'arène affiche "pleine"
  jusqu'à ce qu'une place se libère.

## Lancer le jeu en local

```bash
npm install
npm start
```

Puis ouvre `http://localhost:8085` sur ton téléphone (même réseau Wi-Fi)
ou dans le navigateur de ton ordi.

## Déploiement sur le Mac mini (Docker)

```bash
git clone https://github.com/charlit/PST-Arena.git
cd PST-Arena
colima start --vm-type=vz   # si Colima n'est pas déjà démarré
docker compose up -d --build
```

Vérifie que ça tourne :
```bash
docker compose logs -f
```
Tu dois voir `PST Arena, écoute sur le port 8085`.

## Exposer publiquement (Tailscale Funnel)

Ce Mac mini héberge déjà d'autres jeux sur d'autres ports (8081, 8082,
8083, 8084...). Pour PST Arena, on lui donne son propre port HTTPS
Funnel dédié, sans toucher aux autres :

```bash
sudo /Applications/Tailscale.app/Contents/MacOS/Tailscale funnel --bg --https=8444 8085
```

Le jeu sera alors accessible sur :
```
https://games-carlitos.tail736807.ts.net:8444/
```

Vérifie l'état de tous les partages actifs :
```bash
sudo /Applications/Tailscale.app/Contents/MacOS/Tailscale funnel status
```

## Mettre à jour le jeu manuellement

```bash
cd PST-Arena
git pull
docker compose up -d --build
```

## Déploiement automatique (à chaque push GitHub)

Le script [`deploy/watch-deploy.sh`](deploy/watch-deploy.sh) vérifie
s'il y a du nouveau code sur GitHub et, si oui, fait `git pull` +
reconstruit le conteneur Docker automatiquement. Pour l'activer sur le
Mac mini :

```bash
chmod +x ~/PST-Arena/deploy/watch-deploy.sh
crontab -e
```

Ajoute cette ligne (vérifie toutes les 5 minutes) puis sauvegarde :

```
*/5 * * * * /bin/bash /Users/jussan/PST-Arena/deploy/watch-deploy.sh
```

Les logs du script sont dans `deploy/watch-deploy.log`.

## Idées d'améliorations

- Vrais sprites/animations au lieu des emojis pour les personnages.
- Mode par équipes ou round façon battle royale (dernier survivant).
- Classement des kills persistant entre les parties.
- Plus de personnages et d'armes améliorées avec des effets distincts.
