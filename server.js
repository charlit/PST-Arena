// Serveur PST Arena, auto-hébergé (Mac mini, comme les autres jeux du Mac mini).
// Autorité serveur : boucle de jeu à 20 Hz, diffusion de l'état via WebSocket.

const express = require('express');
const http = require('http');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 8085;
const TICK_MS = 50; // 20 Hz
const MAX_PLAYERS = 10;

const ARENA_W = 1000;
const ARENA_H = 700;
const PLAYER_RADIUS = 18;
const PLAYER_SPEED = 190; // px/s
const PLAYER_MAX_HP = 100;
const RESPAWN_MS = 3000;
const WEAPON_BOOST_MS = 15000;
const HEART_HEAL = 35;
const MAX_HEARTS = 3;
const MAX_WEAPONS = 2;
const HEART_SPAWN_MS = 7000;
const WEAPON_SPAWN_MS = 11000;
const PICKUP_RADIUS = 16;

// Obstacles simples (rectangles) servant de couverture, bloquent joueurs et projectiles.
const OBSTACLES = [
  { x: 220, y: 140, w: 120, h: 30 },
  { x: 660, y: 140, w: 120, h: 30 },
  { x: 220, y: 530, w: 120, h: 30 },
  { x: 660, y: 530, w: 120, h: 30 },
  { x: 460, y: 330, w: 80, h: 40 },
  { x: 60, y: 330, w: 30, h: 120 },
  { x: 910, y: 330, w: 30, h: 120 },
];

const CHARACTERS = {
  fire: {
    id: 'fire', name: 'Braise', emoji: '\u{1F525}',
    projectile: { speed: 340, damage: 18, cooldown: 450, radius: 9, life: 1200, color: '#ff7a45' },
  },
  sniper: {
    id: 'sniper', name: 'Vise', emoji: '\u{1F3AF}',
    projectile: { speed: 680, damage: 38, cooldown: 950, radius: 5, life: 1400, color: '#ffe066' },
  },
  spread: {
    id: 'spread', name: 'Rafale', emoji: '✨',
    projectile: { speed: 300, damage: 11, cooldown: 650, radius: 7, life: 700, color: '#63e6be', spread: 3, spreadAngle: 0.32 },
  },
  orb: {
    id: 'orb', name: 'Spectre', emoji: '\u{1F52E}',
    projectile: { speed: 220, damage: 15, cooldown: 550, radius: 10, life: 1600, color: '#b197fc', homing: 2.6 },
  },
};

function rectIntersectsCircle(rect, cx, cy, r) {
  const closestX = Math.max(rect.x, Math.min(cx, rect.x + rect.w));
  const closestY = Math.max(rect.y, Math.min(cy, rect.y + rect.h));
  const dx = cx - closestX;
  const dy = cy - closestY;
  return (dx * dx + dy * dy) < r * r;
}

function resolveObstacleCollision(x, y, r) {
  for (const rect of OBSTACLES) {
    if (!rectIntersectsCircle(rect, x, y, r)) continue;
    const closestX = Math.max(rect.x, Math.min(x, rect.x + rect.w));
    const closestY = Math.max(rect.y, Math.min(y, rect.y + rect.h));
    let dx = x - closestX;
    let dy = y - closestY;
    let dist = Math.hypot(dx, dy);
    if (dist === 0) { dx = 1; dy = 0; dist = 1; }
    const push = r - dist;
    x += (dx / dist) * push;
    y += (dy / dist) * push;
  }
  return { x, y };
}

function randomSpawnPoint(margin) {
  for (let attempt = 0; attempt < 30; attempt++) {
    const x = margin + Math.random() * (ARENA_W - margin * 2);
    const y = margin + Math.random() * (ARENA_H - margin * 2);
    if (!OBSTACLES.some((r) => rectIntersectsCircle(r, x, y, margin))) return { x, y };
  }
  return { x: ARENA_W / 2, y: ARENA_H / 2 };
}

let nextEntityId = 1;

class Room {
  constructor() {
    this.players = new Map(); // id -> player
    this.projectiles = [];
    this.pickups = []; // {id, kind:'heart'|'weapon', x, y}
    this.killFeed = [];
    this.lastHeartSpawn = 0;
    this.lastWeaponSpawn = 0;
  }

  addPlayer(ws, name, characterId) {
    if (this.players.size >= MAX_PLAYERS) return null;
    const character = CHARACTERS[characterId] ? characterId : 'fire';
    const spawn = randomSpawnPoint(PLAYER_RADIUS + 4);
    const id = 'p' + (nextEntityId++);
    const player = {
      id, ws, name: String(name || 'Joueur').slice(0, 14) || 'Joueur',
      character,
      x: spawn.x, y: spawn.y,
      hp: PLAYER_MAX_HP, alive: true,
      kills: 0, deaths: 0,
      input: { dx: 0, dy: 0, aimX: 1, aimY: 0, firing: false },
      lastShot: 0,
      respawnAt: 0,
      weaponBoostUntil: 0,
    };
    this.players.set(id, player);
    return player;
  }

  removePlayer(id) {
    this.players.delete(id);
  }

  spawnPickup(kind) {
    const point = randomSpawnPoint(PICKUP_RADIUS + 6);
    this.pickups.push({ id: 'k' + (nextEntityId++), kind, x: point.x, y: point.y });
  }

  tick(dtMs, now) {
    const dt = dtMs / 1000;

    // Spawns périodiques
    if (this.pickups.filter((p) => p.kind === 'heart').length < MAX_HEARTS && now - this.lastHeartSpawn > HEART_SPAWN_MS) {
      this.spawnPickup('heart');
      this.lastHeartSpawn = now;
    }
    if (this.pickups.filter((p) => p.kind === 'weapon').length < MAX_WEAPONS && now - this.lastWeaponSpawn > WEAPON_SPAWN_MS) {
      this.spawnPickup('weapon');
      this.lastWeaponSpawn = now;
    }

    // Joueurs : mouvement, tir, respawn
    for (const p of this.players.values()) {
      if (!p.alive) {
        if (now >= p.respawnAt) {
          const spawn = randomSpawnPoint(PLAYER_RADIUS + 4);
          p.x = spawn.x; p.y = spawn.y;
          p.hp = PLAYER_MAX_HP; p.alive = true; p.weaponBoostUntil = 0;
        }
        continue;
      }

      const { dx, dy } = p.input;
      const mag = Math.hypot(dx, dy);
      if (mag > 0.05) {
        const nx = (dx / Math.max(mag, 1)) * Math.min(mag, 1);
        const ny = (dy / Math.max(mag, 1)) * Math.min(mag, 1);
        let x = p.x + nx * PLAYER_SPEED * dt;
        let y = p.y + ny * PLAYER_SPEED * dt;
        x = Math.max(PLAYER_RADIUS, Math.min(ARENA_W - PLAYER_RADIUS, x));
        y = Math.max(PLAYER_RADIUS, Math.min(ARENA_H - PLAYER_RADIUS, y));
        const resolved = resolveObstacleCollision(x, y, PLAYER_RADIUS);
        p.x = resolved.x; p.y = resolved.y;
      }

      // Ramassage pickups
      for (let i = this.pickups.length - 1; i >= 0; i--) {
        const pk = this.pickups[i];
        if (Math.hypot(p.x - pk.x, p.y - pk.y) < PLAYER_RADIUS + PICKUP_RADIUS) {
          if (pk.kind === 'heart') {
            p.hp = Math.min(PLAYER_MAX_HP, p.hp + HEART_HEAL);
          } else if (pk.kind === 'weapon') {
            p.weaponBoostUntil = now + WEAPON_BOOST_MS;
          }
          this.pickups.splice(i, 1);
        }
      }

      const charDef = CHARACTERS[p.character];
      const proj = charDef.projectile;
      const boosted = now < p.weaponBoostUntil;
      const cooldown = boosted ? proj.cooldown * 0.55 : proj.cooldown;
      const damage = boosted ? proj.damage * 1.6 : proj.damage;

      if (p.input.firing && now - p.lastShot >= cooldown) {
        p.lastShot = now;
        const baseAngle = Math.atan2(p.input.aimY, p.input.aimX);
        const shots = proj.spread || 1;
        for (let i = 0; i < shots; i++) {
          let angle = baseAngle;
          if (shots > 1) {
            const spreadAngle = proj.spreadAngle || 0.3;
            angle += (i - (shots - 1) / 2) * spreadAngle;
          }
          this.projectiles.push({
            id: 'b' + (nextEntityId++),
            ownerId: p.id,
            x: p.x + Math.cos(angle) * (PLAYER_RADIUS + 4),
            y: p.y + Math.sin(angle) * (PLAYER_RADIUS + 4),
            vx: Math.cos(angle) * proj.speed,
            vy: Math.sin(angle) * proj.speed,
            damage,
            radius: proj.radius,
            color: proj.color,
            homing: proj.homing || 0,
            expiresAt: now + proj.life,
          });
        }
      }
    }

    // Projectiles : déplacement, homing léger, collisions
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const b = this.projectiles[i];
      if (now >= b.expiresAt) { this.projectiles.splice(i, 1); continue; }

      if (b.homing > 0) {
        let closest = null, closestDist = Infinity;
        for (const p of this.players.values()) {
          if (!p.alive || p.id === b.ownerId) continue;
          const d = Math.hypot(p.x - b.x, p.y - b.y);
          if (d < closestDist) { closestDist = d; closest = p; }
        }
        if (closest && closestDist < 400) {
          const targetAngle = Math.atan2(closest.y - b.y, closest.x - b.x);
          const curAngle = Math.atan2(b.vy, b.vx);
          let diff = targetAngle - curAngle;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          const turn = Math.max(-b.homing * dt, Math.min(b.homing * dt, diff));
          const newAngle = curAngle + turn;
          const speed = Math.hypot(b.vx, b.vy);
          b.vx = Math.cos(newAngle) * speed;
          b.vy = Math.sin(newAngle) * speed;
        }
      }

      b.x += b.vx * dt;
      b.y += b.vy * dt;

      if (b.x < 0 || b.x > ARENA_W || b.y < 0 || b.y > ARENA_H) { this.projectiles.splice(i, 1); continue; }
      if (OBSTACLES.some((r) => rectIntersectsCircle(r, b.x, b.y, b.radius))) { this.projectiles.splice(i, 1); continue; }

      let hit = false;
      for (const p of this.players.values()) {
        if (!p.alive || p.id === b.ownerId) continue;
        if (Math.hypot(p.x - b.x, p.y - b.y) < PLAYER_RADIUS + b.radius) {
          p.hp -= b.damage;
          hit = true;
          if (p.hp <= 0) {
            p.alive = false;
            p.deaths += 1;
            p.respawnAt = now + RESPAWN_MS;
            const killer = this.players.get(b.ownerId);
            if (killer) killer.kills += 1;
            this.killFeed.push({ killer: killer ? killer.name : '?', victim: p.name, at: now });
          }
          break;
        }
      }
      if (hit) this.projectiles.splice(i, 1);
    }

    this.killFeed = this.killFeed.filter((k) => now - k.at < 6000);
  }

  snapshot() {
    return {
      type: 'state',
      arena: { w: ARENA_W, h: ARENA_H, obstacles: OBSTACLES },
      players: Array.from(this.players.values()).map((p) => ({
        id: p.id, name: p.name, character: p.character,
        x: Math.round(p.x), y: Math.round(p.y),
        hp: Math.round(p.hp), alive: p.alive,
        kills: p.kills, deaths: p.deaths,
        boosted: Date.now() < p.weaponBoostUntil,
        respawnIn: p.alive ? 0 : Math.max(0, p.respawnAt - Date.now()),
      })),
      projectiles: this.projectiles.map((b) => ({ x: Math.round(b.x), y: Math.round(b.y), r: b.radius, c: b.color })),
      pickups: this.pickups.map((pk) => ({ id: pk.id, kind: pk.kind, x: pk.x, y: pk.y })),
      killFeed: this.killFeed.slice(-5),
      playerCount: this.players.size,
      maxPlayers: MAX_PLAYERS,
    };
  }
}

const room = new Room();

const app = express();
app.use(express.static(path.join(__dirname, 'public')));
app.get('/characters', (req, res) => {
  res.json(Object.values(CHARACTERS).map((c) => ({ id: c.id, name: c.name, emoji: c.emoji })));
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  let player = null;

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch (e) { return; }

    if (msg.type === 'join') {
      if (player) return;
      if (room.players.size >= MAX_PLAYERS) {
        ws.send(JSON.stringify({ type: 'full' }));
        return;
      }
      player = room.addPlayer(ws, msg.name, msg.character);
      ws.send(JSON.stringify({ type: 'joined', id: player.id, character: player.character }));
      return;
    }

    if (msg.type === 'input' && player) {
      player.input.dx = clampNum(msg.dx, -1, 1);
      player.input.dy = clampNum(msg.dy, -1, 1);
      if (typeof msg.aimX === 'number' && typeof msg.aimY === 'number' && (msg.aimX !== 0 || msg.aimY !== 0)) {
        player.input.aimX = msg.aimX;
        player.input.aimY = msg.aimY;
      }
      player.input.firing = !!msg.firing;
    }
  });

  ws.on('close', () => {
    if (player) room.removePlayer(player.id);
  });
});

function clampNum(v, lo, hi) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(lo, Math.min(hi, n));
}

let lastTick = Date.now();
setInterval(() => {
  const now = Date.now();
  const dt = now - lastTick;
  lastTick = now;
  room.tick(dt, now);
  const payload = JSON.stringify(room.snapshot());
  for (const p of room.players.values()) {
    if (p.ws.readyState === 1) p.ws.send(payload);
  }
}, TICK_MS);

server.listen(PORT, () => {
  console.log('PST Arena, écoute sur le port ' + PORT);
});
