(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const menu = document.getElementById('menu');
  const hud = document.getElementById('hud');
  const charGrid = document.getElementById('charGrid');
  const nameField = document.getElementById('nameField');
  const playBtn = document.getElementById('playBtn');
  const menuStatus = document.getElementById('menuStatus');
  const hpbar = document.getElementById('hpbar');
  const superbar = document.getElementById('superbar');
  const kdCounter = document.getElementById('kdCounter');
  const playerCountEl = document.getElementById('playerCount');
  const boostBadge = document.getElementById('boostBadge');
  const superBadge = document.getElementById('superBadge');
  const killFeedEl = document.getElementById('killFeed');
  const respawnMsg = document.getElementById('respawnMsg');

  function resize() {
    canvas.width = window.innerWidth * window.devicePixelRatio;
    canvas.height = window.innerHeight * window.devicePixelRatio;
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
  }
  window.addEventListener('resize', resize);
  resize();

  let selectedCharacter = null;
  let ws = null;
  let myId = null;
  let latestState = null;
  let lastSelfAlive = true;

  // --- Sélection de personnage ---
  const CHAR_COLORS = {
    fire: { c1: '#ffb15c', c2: '#ff5e2e', body1: '#ffb15c', body2: '#e6480f' },
    sniper: { c1: '#fff27a', c2: '#ffcc33', body1: '#fff27a', body2: '#e0a800' },
    spread: { c1: '#8af7d1', c2: '#22c399', body1: '#8af7d1', body2: '#0f9d76' },
    orb: { c1: '#e2c3ff', c2: '#9b5cff', body1: '#e2c3ff', body2: '#7526d9' },
  };

  fetch('characters').then((r) => r.json()).then((chars) => {
    charGrid.innerHTML = '';
    chars.forEach((c) => {
      const card = document.createElement('div');
      card.className = 'char-card';
      const colors = CHAR_COLORS[c.id] || { c1: '#556', c2: '#223' };
      card.style.setProperty('--c1', colors.c1);
      card.style.setProperty('--c2', colors.c2);
      card.innerHTML = `<div class="char-emoji">${c.emoji}</div><div class="char-name">${c.name}</div>`;
      card.addEventListener('click', () => {
        selectedCharacter = c.id;
        Array.from(charGrid.children).forEach((el) => el.classList.remove('selected'));
        card.classList.add('selected');
        playBtn.disabled = false;
      });
      charGrid.appendChild(card);
    });
  }).catch(() => {
    menuStatus.textContent = "Impossible de contacter le serveur.";
  });

  playBtn.addEventListener('click', () => {
    if (!selectedCharacter) return;
    playBtn.disabled = true;
    menuStatus.textContent = 'Connexion...';
    connect(nameField.value.trim() || 'Joueur', selectedCharacter);
  });

  function connect(name, character) {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(proto + '//' + location.host);
    ws.addEventListener('open', () => {
      ws.send(JSON.stringify({ type: 'join', name, character }));
    });
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.type === 'joined') {
        myId = msg.id;
        menu.classList.add('hidden');
        hud.classList.remove('hidden');
        startInputLoop();
      } else if (msg.type === 'full') {
        menuStatus.textContent = "L'arène est pleine (10/10). Réessaie dans un instant.";
        playBtn.disabled = false;
      } else if (msg.type === 'state') {
        latestState = msg;
      }
    });
    ws.addEventListener('close', () => {
      if (myId) {
        menuStatus.textContent = 'Connexion perdue.';
        hud.classList.add('hidden');
        menu.classList.remove('hidden');
        playBtn.disabled = false;
        myId = null;
      }
    });
  }

  // --- Joysticks tactiles (déplacement + visée/tir) ---
  function makeJoystick(el) {
    const state = { active: false, dx: 0, dy: 0, pointerId: null };
    const knob = el.querySelector('.joystick-knob');
    const radius = 45;

    function setFromEvent(clientX, clientY) {
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      let dx = clientX - cx;
      let dy = clientY - cy;
      const dist = Math.hypot(dx, dy);
      if (dist > radius) { dx = (dx / dist) * radius; dy = (dy / dist) * radius; }
      knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      state.dx = dx / radius;
      state.dy = dy / radius;
    }

    function reset() {
      state.active = false; state.dx = 0; state.dy = 0; state.pointerId = null;
      knob.style.transform = 'translate(-50%, -50%)';
    }

    el.addEventListener('pointerdown', (e) => {
      state.active = true; state.pointerId = e.pointerId;
      el.setPointerCapture(e.pointerId);
      setFromEvent(e.clientX, e.clientY);
    });
    el.addEventListener('pointermove', (e) => {
      if (!state.active || e.pointerId !== state.pointerId) return;
      setFromEvent(e.clientX, e.clientY);
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach((evt) => {
      el.addEventListener(evt, (e) => {
        if (e.pointerId !== state.pointerId) return;
        reset();
      });
    });
    return state;
  }

  const moveStick = makeJoystick(document.getElementById('joyMove'));
  const aimStick = makeJoystick(document.getElementById('joyAim'));

  function startInputLoop() {
    setInterval(() => {
      if (!ws || ws.readyState !== 1) return;
      const firing = aimStick.active && (Math.abs(aimStick.dx) > 0.15 || Math.abs(aimStick.dy) > 0.15);
      ws.send(JSON.stringify({
        type: 'input',
        dx: moveStick.dx, dy: moveStick.dy,
        aimX: aimStick.dx, aimY: aimStick.dy,
        firing,
      }));
    }, 50);
  }

  // --- Rendu style "Brawl Stars" : couleurs vives, contours épais, ombres ---
  // Silhouettes 2D inspirées du skateur de PalmStreet (casquette streetwear +
  // planche sous les pieds en clin d'œil), redessinées à la sauce Brawl Stars.
  const CHAR_LOOK = {
    fire: { cap: '#ff5e2e', brim: '#c73d10', deck: '#ff5e2e', eyes: 'fierce' },
    sniper: { cap: '#2b2f45', brim: '#12142a', deck: '#ffcc33', eyes: 'visor', visor: '#5fe0ff' },
    spread: { cap: '#22c399', brim: '#0f9d76', deck: '#22c399', eyes: 'happy' },
    orb: { cap: '#7526d9', brim: '#4e1594', deck: '#9b5cff', eyes: 'mystic' },
  };
  const OUTLINE = '#1a1a2e';
  const GRASS_A = '#7fd858';
  const GRASS_B = '#71c94c';
  const TILE = 64;

  function roundRectPath(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  function drawOutlinedText(c, text, x, y, fontSize, fill) {
    c.font = `800 ${fontSize}px 'Baloo 2', sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.lineJoin = 'round';
    c.miterLimit = 2;
    c.lineWidth = fontSize * 0.22;
    c.strokeStyle = OUTLINE;
    c.strokeText(text, x, y);
    c.fillStyle = fill;
    c.fillText(text, x, y);
  }

  function drawShadow(c, x, y, rx, ry) {
    c.beginPath();
    c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    c.fillStyle = 'rgba(0,0,0,0.28)';
    c.fill();
  }

  // Petite planche à roulettes sous les pieds, clin d'œil au skateur de PalmStreet.
  function drawSkateboardNod(c, x, y, angle, deckColor) {
    c.save();
    c.translate(x, y);
    c.rotate(angle);
    roundRectPath(c, -17, -3.5, 34, 7, 3.5);
    c.fillStyle = deckColor;
    c.fill();
    c.lineWidth = 2;
    c.strokeStyle = OUTLINE;
    c.stroke();
    c.fillStyle = '#ffe066';
    [-11, 11].forEach((wx) => {
      c.beginPath();
      c.arc(wx, 4, 2.6, 0, Math.PI * 2);
      c.fill();
      c.stroke();
    });
    c.restore();
  }

  // Tête stylisée : casquette streetwear + visage, coloré par personnage.
  function drawCharacterFace(c, x, y, character) {
    const look = CHAR_LOOK[character] || CHAR_LOOK.fire;
    const headY = y - 2;

    // Casquette (dôme + visière)
    c.beginPath();
    c.arc(x, headY - 6, 13, Math.PI, 0);
    c.closePath();
    c.fillStyle = look.cap;
    c.fill();
    c.lineWidth = 3;
    c.strokeStyle = OUTLINE;
    c.stroke();
    roundRectPath(c, x - 15, headY - 8, 30, 6, 3);
    c.fillStyle = look.brim;
    c.fill();
    c.lineWidth = 2.5;
    c.stroke();

    // Visage
    if (look.eyes === 'visor') {
      roundRectPath(c, x - 9, headY - 1, 18, 6, 3);
      c.fillStyle = look.visor;
      c.fill();
      c.lineWidth = 2;
      c.strokeStyle = OUTLINE;
      c.stroke();
    } else {
      c.fillStyle = OUTLINE;
      const eyeDx = 5.5, eyeY = headY + 2;
      if (look.eyes === 'fierce') {
        c.lineWidth = 2.2;
        c.strokeStyle = OUTLINE;
        c.beginPath(); c.moveTo(x - eyeDx - 3, eyeY - 2); c.lineTo(x - eyeDx + 3, eyeY + 1); c.stroke();
        c.beginPath(); c.moveTo(x + eyeDx + 3, eyeY - 2); c.lineTo(x + eyeDx - 3, eyeY + 1); c.stroke();
      } else if (look.eyes === 'mystic') {
        c.beginPath(); c.arc(x - eyeDx, eyeY, 2.6, 0, Math.PI * 2); c.fill();
        c.beginPath(); c.arc(x + eyeDx, eyeY, 2.6, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#e2c3ff';
        c.beginPath(); c.arc(x - eyeDx + 0.8, eyeY - 0.8, 1, 0, Math.PI * 2); c.fill();
        c.beginPath(); c.arc(x + eyeDx + 0.8, eyeY - 0.8, 1, 0, Math.PI * 2); c.fill();
      } else {
        c.beginPath(); c.arc(x - eyeDx, eyeY, 2.2, 0, Math.PI * 2); c.fill();
        c.beginPath(); c.arc(x + eyeDx, eyeY, 2.2, 0, Math.PI * 2); c.fill();
      }
    }
  }

  function draw() {
    requestAnimationFrame(draw);
    const dpr = window.devicePixelRatio;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const now = Date.now();

    ctx.fillStyle = '#2f7bd6';
    ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);

    if (!latestState) return;
    const state = latestState;
    const me = state.players.find((p) => p.id === myId);

    const camX = me ? me.x : state.arena.w / 2;
    const camY = me ? me.y : state.arena.h / 2;
    const offX = window.innerWidth / 2 - camX;
    const offY = window.innerHeight / 2 - camY;

    // Sol : damier d'herbe façon arène
    ctx.save();
    roundRectPath(ctx, offX, offY, state.arena.w, state.arena.h, 6);
    ctx.clip();
    const startCol = Math.floor(-offX / TILE) - 1;
    const startRow = Math.floor(-offY / TILE) - 1;
    const cols = Math.ceil(window.innerWidth / TILE) + 2;
    const rows = Math.ceil(window.innerHeight / TILE) + 2;
    for (let r = startRow; r < startRow + rows; r++) {
      for (let c = startCol; c < startCol + cols; c++) {
        ctx.fillStyle = (r + c) % 2 === 0 ? GRASS_A : GRASS_B;
        ctx.fillRect(offX + c * TILE, offY + r * TILE, TILE, TILE);
      }
    }
    ctx.restore();

    // Contour chunky brun autour de l'arène (façon clôture/sol en terre)
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#8a5a2b';
    ctx.lineWidth = 16;
    roundRectPath(ctx, offX, offY, state.arena.w, state.arena.h, 6);
    ctx.stroke();
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 6;
    ctx.stroke();

    // Obstacles = caisses en bois
    state.arena.obstacles.forEach((rct) => {
      const x = offX + rct.x, y = offY + rct.y, w = rct.w, h = rct.h;
      drawShadow(ctx, x + w / 2, y + h + 4, w / 2, 6);
      roundRectPath(ctx, x, y, w, h, 6);
      const grad = ctx.createLinearGradient(x, y, x, y + h);
      grad.addColorStop(0, '#d8a05a');
      grad.addColorStop(1, '#a5702f');
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = OUTLINE;
      ctx.stroke();
      // planches en croix
      ctx.strokeStyle = 'rgba(90,55,20,0.6)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x + 4, y + 4); ctx.lineTo(x + w - 4, y + h - 4);
      ctx.moveTo(x + w - 4, y + 4); ctx.lineTo(x + 4, y + h - 4);
      ctx.stroke();
    });

    // Pickups (rebondissent légèrement)
    state.pickups.forEach((pk) => {
      const bob = Math.sin(now / 300 + pk.x) * 3;
      const x = offX + pk.x, y = offY + pk.y + bob;
      drawShadow(ctx, offX + pk.x, offY + pk.y + 16, 14, 5);
      if (pk.kind === 'heart') {
        const pulse = 1 + Math.sin(now / 250) * 0.06;
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(pulse, pulse);
        ctx.font = '30px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('❤️', 0, 0);
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(x, y, 20, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,224,102,0.35)';
        ctx.fill();
        ctx.font = '28px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('\u{1F52B}', x, y);
      }
    });

    // Projectiles : halo lumineux + noyau (dorés et plus gros pour une super)
    state.projectiles.forEach((b) => {
      const x = offX + b.x, y = offY + b.y;
      const haloColor = b.s ? '#ffe066' : b.c;
      ctx.beginPath();
      ctx.fillStyle = haloColor + (b.s ? '88' : '55');
      ctx.arc(x, y, b.r * (b.s ? 2.4 : 1.9), 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.fillStyle = b.c;
      ctx.arc(x, y, b.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = b.s ? 3 : 2;
      ctx.strokeStyle = b.s ? '#ffe066' : OUTLINE;
      ctx.stroke();
    });

    // Joueurs
    state.players.forEach((p) => {
      const x = offX + p.x, y = offY + p.y;
      const colors = CHAR_COLORS[p.character] || { body1: '#8899cc', body2: '#445' };
      const look = CHAR_LOOK[p.character] || CHAR_LOOK.fire;
      if (!p.alive) ctx.globalAlpha = 0.3;

      drawShadow(ctx, x, y + 20, 18, 7);
      drawSkateboardNod(ctx, x, y + 17, -0.12, look.deck);

      // Anneau doré pulsant autour d'un joueur dont la super est prête
      if (p.superReady) {
        const pulse = 22 + Math.sin(now / 180) * 2;
        ctx.beginPath();
        ctx.arc(x, y, pulse, 0, Math.PI * 2);
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#ffe066';
        ctx.stroke();
      }

      // Corps : dégradé + contour épais façon "toon"
      ctx.beginPath();
      const bodyGrad = ctx.createRadialGradient(x - 6, y - 8, 4, x, y, 20);
      bodyGrad.addColorStop(0, colors.body1);
      bodyGrad.addColorStop(1, colors.body2);
      ctx.fillStyle = bodyGrad;
      ctx.arc(x, y, 19, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = p.id === myId ? '#ffe066' : OUTLINE;
      ctx.stroke();

      drawCharacterFace(ctx, x, y, p.character);
      ctx.globalAlpha = 1;

      // Pastille de nom
      ctx.font = "700 12px 'Baloo 2', sans-serif";
      const nameW = ctx.measureText(p.name).width + 16;
      roundRectPath(ctx, x - nameW / 2, y - 46, nameW, 18, 9);
      ctx.fillStyle = 'rgba(20,20,35,0.75)';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(p.name, x, y - 37);

      // Barre de vie chunky
      const barW = 40, barH = 7;
      roundRectPath(ctx, x - barW / 2, y - 27, barW, barH, 4);
      ctx.fillStyle = '#2b2b3d';
      ctx.fill();
      const pct = Math.max(0, p.hp) / 100;
      if (pct > 0) {
        roundRectPath(ctx, x - barW / 2, y - 27, barW * pct, barH, 4);
        ctx.fillStyle = pct > 0.4 ? '#63e34d' : '#ff5e5e';
        ctx.fill();
      }
      ctx.lineWidth = 2;
      ctx.strokeStyle = OUTLINE;
      roundRectPath(ctx, x - barW / 2, y - 27, barW, barH, 4);
      ctx.stroke();

      if (p.boosted) {
        ctx.font = '16px sans-serif';
        ctx.fillText('⚡', x + 22, y - 20);
      }
    });

    // HUD
    if (me) {
      hpbar.style.width = Math.max(0, me.hp) + '%';
      kdCounter.textContent = `${me.kills} K / ${me.deaths} D`;
      boostBadge.classList.toggle('hidden', !me.boosted);
      const superNeeded = state.arena.superHitsNeeded || 3;
      superbar.style.width = Math.min(100, (me.superCharge / superNeeded) * 100) + '%';
      superbar.classList.toggle('ready', !!me.superReady);
      superBadge.classList.toggle('hidden', !me.superReady);
      if (!me.alive) {
        const secs = Math.ceil(me.respawnIn / 1000);
        respawnMsg.textContent = `ÉLIMINÉ ! Réapparition dans ${secs}s`;
        respawnMsg.classList.remove('hidden');
      } else {
        respawnMsg.classList.add('hidden');
      }
    }
    playerCountEl.textContent = `${state.playerCount} / ${state.maxPlayers}`;

    killFeedEl.innerHTML = '';
    state.killFeed.forEach((k) => {
      const div = document.createElement('div');
      div.textContent = `${k.killer} ✖️ ${k.victim}`;
      killFeedEl.appendChild(div);
    });
  }
  requestAnimationFrame(draw);
})();
