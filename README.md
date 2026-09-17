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

**Important : Tailscale Funnel ne peut exposer que 3 ports sur
internet : 443, 8443 et 10000** (contrainte de Tailscale, pas de ce
projet). Sur ce Mac mini, ces trois ports sont déjà pris par les autres
jeux (PalmStreet, SkateHangar, etc.) — un port maison comme 8085 ne
serait donc **jamais joignable depuis l'extérieur du tailnet**, même si
`tailscale funnel` semble démarrer sans erreur (il ne fonctionne alors
qu'en local/sur le tailnet, pas pour un visiteur externe sur son
téléphone).

La solution : faire cohabiter PST Arena avec le jeu déjà sur le port
443, sous un chemin dédié `/arena` (le serveur Express de PST Arena sait
répondre aussi bien à la racine qu'à `/arena`) :

```bash
sudo /Applications/Tailscale.app/Contents/MacOS/Tailscale serve --bg --set-path=/arena http://localhost:8085
```

(le Funnel sur le port 443 doit déjà être actif — c'est le cas ici pour
l'autre jeu qui y tourne déjà). Le jeu sera alors accessible sur :
```
https://games-carlitos.tail736807.ts.net/arena/
```

Vérifie l'état de tous les partages actifs :
```bash
sudo /Applications/Tailscale.app/Contents/MacOS/Tailscale serve status
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
