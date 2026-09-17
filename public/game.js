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
  const kdCounter = document.getElementById('kdCounter');
  const playerCountEl = document.getElementById('playerCount');
  const boostBadge = document.getElementById('boostBadge');
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
  fetch('characters').then((r) => r.json()).then((chars) => {
    charGrid.innerHTML = '';
    chars.forEach((c) => {
      const card = document.createElement('div');
      card.className = 'char-card';
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

  // --- Rendu ---
  const CHAR_EMOJI = { fire: '\u{1F525}', sniper: '\u{1F3AF}', spread: '✨', orb: '\u{1F52E}' };

  function draw() {
    requestAnimationFrame(draw);
    const dpr = window.devicePixelRatio;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#14161f';
    ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);

    if (!latestState) return;
    const state = latestState;
    const me = state.players.find((p) => p.id === myId);

    const camX = me ? me.x : state.arena.w / 2;
    const camY = me ? me.y : state.arena.h / 2;
    const offX = window.innerWidth / 2 - camX;
    const offY = window.innerHeight / 2 - camY;

    // Limites de l'arène
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 4;
    ctx.strokeRect(offX, offY, state.arena.w, state.arena.h);
    ctx.fillStyle = 'rgba(255,255,255,0.03)';
    ctx.fillRect(offX, offY, state.arena.w, state.arena.h);

    // Obstacles
    ctx.fillStyle = 'rgba(120,130,160,0.5)';
    state.arena.obstacles.forEach((r) => {
      ctx.fillRect(offX + r.x, offY + r.y, r.w, r.h);
    });

    // Pickups
    state.pickups.forEach((pk) => {
      ctx.font = '26px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(pk.kind === 'heart' ? '❤️' : '\u{1F52B}', offX + pk.x, offY + pk.y);
    });

    // Projectiles
    state.projectiles.forEach((b) => {
      ctx.beginPath();
      ctx.fillStyle = b.c;
      ctx.arc(offX + b.x, offY + b.y, b.r, 0, Math.PI * 2);
      ctx.fill();
    });

    // Joueurs
    state.players.forEach((p) => {
      const x = offX + p.x, y = offY + p.y;
      if (!p.alive) {
        ctx.globalAlpha = 0.25;
      }
      ctx.beginPath();
      ctx.fillStyle = p.id === myId ? '#ffd43b' : '#4dabf7';
      ctx.arc(x, y, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = '22px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(CHAR_EMOJI[p.character] || '?', x, y);
      ctx.globalAlpha = 1;

      // Nom + barre de vie au-dessus
      ctx.font = '11px sans-serif';
      ctx.fillStyle = '#f4f4f8';
      ctx.fillText(p.name, x, y - 30);
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(x - 20, y - 26, 40, 5);
      ctx.fillStyle = p.hp > 40 ? '#51cf66' : '#ff6b6b';
      ctx.fillRect(x - 20, y - 26, 40 * Math.max(0, p.hp) / 100, 5);

      if (p.boosted) {
        ctx.font = '13px sans-serif';
        ctx.fillText('⚡', x + 22, y - 20);
      }
    });

    // HUD
    if (me) {
      hpbar.style.width = Math.max(0, me.hp) + '%';
      kdCounter.textContent = `${me.kills} K / ${me.deaths} D`;
      boostBadge.classList.toggle('hidden', !me.boosted);
      if (!me.alive) {
        const secs = Math.ceil(me.respawnIn / 1000);
        respawnMsg.textContent = `Éliminé ! Réapparition dans ${secs}s`;
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
