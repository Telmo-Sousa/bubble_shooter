'use strict';
/* =====================================================================
   Bubble Shooter. All balance values live in CONFIG.
   Original per-frame values (60 Hz) were converted to per-second units:
   speed px/frame * 60 = px/s, frames * 16.67 = ms.
   ===================================================================== */
const CONFIG = {
    stepMs: 1000 / 240,          // fixed physics step
    maxFrameMs: 100,             // clamp for tab-switch / lag spikes
    maxStepsPerFrame: 30,        // spiral-of-death guard
    difficulty: {                // speeds in px/s (originals: 1.5 / 2 / 3 / 5 px per frame)
        easy:   { enemySpeed: 90,  enemySpawnMultiplier: 3, playerSpeed: 300 },
        medium: { enemySpeed: 120, enemySpawnMultiplier: 5, playerSpeed: 300 },
        hard:   { enemySpeed: 180, enemySpawnMultiplier: 7, playerSpeed: 300 }
    },
    player: { radius: 20 },
    enemy: { baseRadius: 15, maxCount: 60, minSpawnDistance: 200, bossSpeed: 60 },
    weapon: {
        magSize: 12, reserveStart: 48, reserveMax: 96, reloadMs: 1100,
        fireIntervalMs: 200,     // original 200 ms
        bulletSpeed: 600,        // original 10 px/frame
        bulletRadius: 5, damage: 1, lifetimeMs: 3000,
        spreadCount: 3, spreadAngle: Math.PI / 12, ammoPerShot: 1
    },
    drops: {
        chance: 0.1,             // original 10 %
        lowAmmoChance: 0.3,      // used when total ammo < one magazine
        lowAmmoPrefersAmmo: 0.7,
        maxOnScreen: 4, lifetimeMs: 12000, fallSpeed: 60, size: 15,
        ammoAmount: 24, scoreBonus: 50,
        types: {
            ammo:       { weight: 2, color: 'orange', letter: 'A', label: 'AMMO' },
            speedBoost: { weight: 1, color: 'cyan',   letter: 'F', label: 'FAST',   ms: 5000, mul: 1.5 },
            scoreBonus: { weight: 1, color: 'green',  letter: '$', label: 'BONUS' },
            spreadShot: { weight: 1, color: 'yellow', letter: 'M', label: 'MULTI',  ms: 5000 },
            shield:     { weight: 1, color: 'purple', letter: 'O', label: 'SHIELD', ms: 8000 }
        }
    },
    effects: { hitFlashMs: 90, muzzleMs: 60, maxParticles: 400 }
};

const $ = id => document.getElementById(id);
const canvas = $('gameCanvas');
const ctx = canvas.getContext('2d');
const el = {
    start: $('startScreen'), lose: $('loseScreen'), pause: $('pauseMenu'),
    score: $('scoreBoard'), scoreValue: $('scoreValue'), fps: $('fpsCounter'), fpsValue: $('fpsValue'),
    round: $('roundIndicator'), roundValue: $('roundValue'),
    finalScore: $('finalScore'), finalRound: $('finalRound'),
    bestStart: $('bestValueStart'), bestLose: $('bestValueLose'),
    reload: $('touchReload'), pauseBtn: $('touchPause')
};

const store = {
    get(k, d) { try { const v = localStorage.getItem('bs_' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('bs_' + k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } }
};
const settings = {
    difficulty: store.get('difficulty', 'medium'),
    sound: store.get('sound', true),
    light: store.get('light', false),
    effects: store.get('effects', !(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches))
};
if (!CONFIG.difficulty[settings.difficulty]) settings.difficulty = 'medium';

const sounds = {};
['shoot:shoot', 'enemyHit:hit', 'playerHit:hit', 'powerup:powerUp', 'gameOver:gameOver'].forEach(p => {
    const [name, file] = p.split(':');
    try { sounds[name] = new Audio('audio/' + file + '.wav'); } catch (e) { /* no audio */ }
});

const colors = {};
function refreshColors() {
    const cs = getComputedStyle(document.documentElement);
    ['background', 'foreground', 'comment', 'cyan', 'green', 'orange', 'pink', 'purple', 'red', 'yellow']
        .forEach(n => { colors[n] = cs.getPropertyValue('--' + n).trim(); });
}

// ---------------------------------------------------------------- state
let W = 0, H = 0, dpr = 1;
let state = 'menu';                       // menu | playing | paused | over
let player, enemies = [], bullets = [], particles = [], drops = [], floaters = [];
let score = 0, round = 1, best = store.get('best', 0);
let simTime = 0, acc = 0, lastTime = 0, rafId = 0;
let fpsFrames = 0, fpsT = 0;
const keys = {};
const ammo = { mag: 0, reserve: 0, reloadEnd: -1, nextShot: 0, emptyUntil: 0 };
const input = { mx: 0, my: 0, hasMouse: false, fire: false, moveStick: null, aimStick: null };
const STICK_R = 60;

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
function rm(arr, i) { arr[i] = arr[arr.length - 1]; arr.pop(); }
function playSound(n) {
    if (!settings.sound || !sounds[n]) return;
    try { sounds[n].currentTime = 0; const p = sounds[n].play(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* ignore */ }
}

// ---------------------------------------------------------------- setup
function init() {
    if (window.matchMedia && matchMedia('(pointer: coarse)').matches) document.body.classList.add('touch');
    refreshColors();
    document.documentElement.classList.toggle('light-mode', settings.light);
    refreshColors();
    resize();
    input.mx = W / 2; input.my = H / 2;
    setupEvents();
    document.querySelectorAll('.difficulty-btn').forEach(btn => {
        btn.classList.toggle('selected', btn.dataset.difficulty === settings.difficulty);
        btn.addEventListener('click', () => {
            document.querySelectorAll('.difficulty-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            settings.difficulty = btn.dataset.difficulty;
            store.set('difficulty', settings.difficulty);
        });
    });
    updateToggleLabels();
    el.bestStart.textContent = best;
    draw();
}

function updateToggleLabels() {
    document.querySelectorAll('.toggle-sound').forEach(b => { b.textContent = 'Sound: ' + (settings.sound ? 'ON' : 'OFF'); });
    document.querySelectorAll('.toggle-effects').forEach(b => { b.textContent = 'Effects: ' + (settings.effects ? 'ON' : 'OFF'); });
}

function resize() {
    const nw = window.innerWidth, nh = window.innerHeight;
    if (nw === W && nh === H) return;
    if (W && player) {                    // keep the run: map positions proportionally
        const sx = nw / W, sy = nh / H;
        [enemies, bullets, particles, drops, floaters].forEach(list => list.forEach(o => { o.x *= sx; o.y *= sy; }));
        player.x *= sx; player.y *= sy;
        input.mx *= sx; input.my *= sy;
    }
    W = nw; H = nh;
    dpr = Math.min(window.devicePixelRatio || 1, 2);   // cap internal resolution on phones
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (player) { player.x = clamp(player.x, player.radius, W - player.radius); player.y = clamp(player.y, player.radius, H - player.radius); }
    if (state !== 'playing') draw();
}

// ---------------------------------------------------------------- game flow
function resetInput() {
    for (const k in keys) keys[k] = false;
    input.fire = false; input.moveStick = null; input.aimStick = null;
}

function startGame() {
    const d = CONFIG.difficulty[settings.difficulty];
    player = { x: W / 2, y: H / 2, radius: CONFIG.player.radius, speed: d.playerSpeed, aim: 0,
               fx: { speedBoost: 0, spreadShot: 0, shield: 0 }, muzzleUntil: 0 };
    enemies.length = bullets.length = particles.length = drops.length = floaters.length = 0;
    round = 1; simTime = 0; acc = 0;
    ammo.mag = CONFIG.weapon.magSize; ammo.reserve = CONFIG.weapon.reserveStart;
    ammo.reloadEnd = -1; ammo.nextShot = 0; ammo.emptyUntil = 0;
    resetInput();
    setScore(0);
    el.roundValue.textContent = round;
    el.score.classList.add('active'); el.fps.classList.add('active'); el.round.classList.add('active');
    el.start.classList.remove('active'); el.lose.classList.remove('active'); el.pause.classList.remove('active');
    spawnEnemies(d.enemySpawnMultiplier);
    state = 'playing';
    document.body.classList.add('playing');
    startLoop();
}

function startLoop() {
    cancelAnimationFrame(rafId);          // guarantees a single loop
    lastTime = performance.now(); acc = 0;
    fpsFrames = 0; fpsT = lastTime;
    rafId = requestAnimationFrame(frame);
}

function frame(now) {
    if (state !== 'playing') return;
    rafId = requestAnimationFrame(frame);
    const dt = Math.min(now - lastTime, CONFIG.maxFrameMs);
    lastTime = now;
    acc += dt;
    let steps = 0;
    while (acc >= CONFIG.stepMs && steps < CONFIG.maxStepsPerFrame && state === 'playing') {
        update(CONFIG.stepMs); acc -= CONFIG.stepMs; steps++;
    }
    if (steps >= CONFIG.maxStepsPerFrame) acc = 0;
    draw();
    fpsFrames++;
    if (now - fpsT >= 500) { el.fpsValue.textContent = Math.round(fpsFrames * 1000 / (now - fpsT)); fpsFrames = 0; fpsT = now; }
    if (state === 'over') endGame();
}

function pauseGame() {
    if (state !== 'playing') return;
    state = 'paused'; cancelAnimationFrame(rafId); resetInput();
    document.body.classList.remove('playing');
    el.pause.classList.add('active');
}
function resumeGame() {
    if (state !== 'paused') return;
    state = 'playing'; el.pause.classList.remove('active');
    document.body.classList.add('playing');
    startLoop();
}
function togglePause() { state === 'playing' ? pauseGame() : resumeGame(); }

function endGame() {
    cancelAnimationFrame(rafId); resetInput();
    document.body.classList.remove('playing');
    if (score > best) { best = score; store.set('best', best); }
    el.finalScore.textContent = score; el.finalRound.textContent = round;
    el.bestLose.textContent = best; el.bestStart.textContent = best;
    el.score.classList.remove('active'); el.fps.classList.remove('active'); el.round.classList.remove('active');
    el.lose.classList.add('active');
    playSound('gameOver');
}

// ---------------------------------------------------------------- simulation
function update(dt) {
    simTime += dt;
    const s = dt / 1000;
    const p = player;

    // aim: right stick, else mouse
    const as = input.aimStick;
    if (as && as.mag > 0.2) p.aim = as.angle;
    else if (input.hasMouse) p.aim = Math.atan2(input.my - p.y, input.mx - p.x);

    // movement (keyboard + left stick), diagonal normalised
    let ax = (keys.d || keys.arrowright ? 1 : 0) - (keys.a || keys.arrowleft ? 1 : 0);
    let ay = (keys.s || keys.arrowdown ? 1 : 0) - (keys.w || keys.arrowup ? 1 : 0);
    if (input.moveStick) { ax += input.moveStick.vx; ay += input.moveStick.vy; }
    const m = Math.hypot(ax, ay);
    if (m > 1) { ax /= m; ay /= m; }
    const sp = p.speed * (simTime < p.fx.speedBoost ? CONFIG.drops.types.speedBoost.mul : 1) * s;
    p.x = clamp(p.x + ax * sp, p.radius, W - p.radius);
    p.y = clamp(p.y + ay * sp, p.radius, H - p.radius);

    // weapon
    if (ammo.reloadEnd >= 0 && simTime >= ammo.reloadEnd) finishReload();
    if (input.fire || (as && as.mag > 0.25)) tryShoot();

    // bullets
    const wl = CONFIG.weapon.lifetimeMs;
    for (let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i];
        b.x += b.dx * s; b.y += b.dy * s;
        if (b.x < -b.r || b.x > W + b.r || b.y < -b.r || b.y > H + b.r || simTime - b.born > wl) rm(bullets, i);
    }
    // enemies
    for (let i = 0; i < enemies.length; i++) {
        const e = enemies[i];
        const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1;
        e.x += dx / d * e.speed * s; e.y += dy / d * e.speed * s;
    }
    // particles
    for (let i = particles.length - 1; i >= 0; i--) {
        const q = particles[i];
        q.x += q.dx * s; q.y += q.dy * s; q.life -= dt; q.r -= 3 * s;
        if (q.life <= 0 || q.r <= 0) rm(particles, i);
    }
    // drops
    for (let i = drops.length - 1; i >= 0; i--) {
        const d = drops[i];
        d.y += CONFIG.drops.fallSpeed * s; d.rot += 1.2 * s;
        if (simTime > d.expires || d.y > H + d.size) rm(drops, i);
    }
    for (let i = floaters.length - 1; i >= 0; i--) {
        floaters[i].y -= 30 * s;
        if (simTime > floaters[i].until) rm(floaters, i);
    }

    collisions();
    if (enemies.length === 0 && state === 'playing') nextRound();
}

function collisions() {
    const wd = CONFIG.weapon.damage;
    for (let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i];
        for (let j = enemies.length - 1; j >= 0; j--) {
            const e = enemies[j];
            const dx = b.x - e.x, dy = b.y - e.y, rr = b.r + e.radius;
            if (dx * dx + dy * dy < rr * rr) {
                rm(bullets, i);
                e.health -= wd; e.hitUntil = simTime + CONFIG.effects.hitFlashMs;
                burst(b.x, b.y, colors.cyan, 4);
                playSound('enemyHit');
                if (e.health <= 0) killEnemy(j);
                break;
            }
        }
    }
    const p = player;
    for (let i = 0; i < enemies.length; i++) {
        const e = enemies[i];
        const dx = e.x - p.x, dy = e.y - p.y, rr = e.radius + p.radius;
        if (dx * dx + dy * dy < rr * rr) {
            if (simTime < p.fx.shield) {
                p.fx.shield = 0;
                burst(e.x, e.y, colors[e.ck], 15);
                enemies.splice(i, 1);
                playSound('enemyHit');
            } else {
                burst(p.x, p.y, colors.green, 30);
                playSound('playerHit');
                state = 'over';
            }
            break;
        }
    }
    const dc = CONFIG.drops;
    for (let i = drops.length - 1; i >= 0; i--) {
        const d = drops[i];
        const dx = d.x - p.x, dy = d.y - p.y, rr = d.size + p.radius;
        if (dx * dx + dy * dy < rr * rr) { rm(drops, i); applyDrop(d.type, d.x, d.y); playSound('powerup'); }
    }
}

function killEnemy(j) {
    const e = enemies[j];
    burst(e.x, e.y, colors[e.ck], 15);
    enemies.splice(j, 1);
    setScore(score + (e.isBoss ? 100 : 10));
    maybeDrop(e.x, e.y);
}

// ---------------------------------------------------------------- weapon
function tryShoot() {
    const w = CONFIG.weapon;
    if (ammo.reloadEnd >= 0 || simTime < ammo.nextShot) return;
    if (ammo.mag < w.ammoPerShot) {
        if (ammo.reserve > 0) startReload();
        else if (simTime >= ammo.emptyUntil) { ammo.emptyUntil = simTime + 500; floater('NO AMMO', player.x, player.y - 35, colors.red); }
        return;
    }
    ammo.nextShot = simTime + w.fireIntervalMs;
    ammo.mag -= w.ammoPerShot;
    const n = simTime < player.fx.spreadShot ? w.spreadCount : 1;
    for (let i = 0; i < n; i++) {
        const a = player.aim + (i - (n - 1) / 2) * w.spreadAngle;
        bullets.push({ x: player.x, y: player.y, r: w.bulletRadius, dx: Math.cos(a) * w.bulletSpeed, dy: Math.sin(a) * w.bulletSpeed, born: simTime });
    }
    player.muzzleUntil = simTime + CONFIG.effects.muzzleMs;
    playSound('shoot');
    if (ammo.mag < w.ammoPerShot && ammo.reserve > 0) startReload();
}
function startReload() {
    if (state !== 'playing' || ammo.reloadEnd >= 0 || ammo.mag >= CONFIG.weapon.magSize || ammo.reserve <= 0) return;
    ammo.reloadEnd = simTime + CONFIG.weapon.reloadMs;
}
function finishReload() {
    const take = Math.min(CONFIG.weapon.magSize - ammo.mag, ammo.reserve);
    ammo.mag += take; ammo.reserve -= take; ammo.reloadEnd = -1;
}

// ---------------------------------------------------------------- drops
function maybeDrop(x, y) {
    const dc = CONFIG.drops;
    if (drops.length >= dc.maxOnScreen) return;
    const low = ammo.mag + ammo.reserve < CONFIG.weapon.magSize;
    if (Math.random() >= (low ? dc.lowAmmoChance : dc.chance)) return;
    let type = 'ammo';
    if (!(low && Math.random() < dc.lowAmmoPrefersAmmo)) {
        let total = 0; for (const k in dc.types) total += dc.types[k].weight;
        let r = Math.random() * total;
        for (const k in dc.types) { r -= dc.types[k].weight; if (r <= 0) { type = k; break; } }
    }
    drops.push({ x, y, size: dc.size, rot: 0, type, expires: simTime + dc.lifetimeMs });
}
function applyDrop(type, x, y) {
    const dc = CONFIG.drops, t = dc.types[type];
    if (type === 'ammo') {
        ammo.reserve = Math.min(CONFIG.weapon.reserveMax, ammo.reserve + dc.ammoAmount);
        if (ammo.mag === 0) startReload();
    } else if (type === 'scoreBonus') {
        setScore(score + dc.scoreBonus);
    } else {
        player.fx[type] = simTime + t.ms;   // refreshes, never stacks
    }
    floater(t.label, x, y, colors[t.color]);
}
function floater(text, x, y, color) {
    if (floaters.length < 8) floaters.push({ text, x, y, color, until: simTime + 900 });
}

// ---------------------------------------------------------------- enemies
function spawnEnemies(count) {
    const d = CONFIG.difficulty[settings.difficulty], ec = CONFIG.enemy;
    count = Math.min(count, ec.maxCount - enemies.length);
    for (let i = 0; i < count; i++) {
        let x, y, tries = 0;
        do {
            const side = Math.floor(Math.random() * 4);
            if (side === 0) { x = Math.random() * W; y = -30; }
            else if (side === 1) { x = W + 30; y = Math.random() * H; }
            else if (side === 2) { x = Math.random() * W; y = H + 30; }
            else { x = -30; y = Math.random() * H; }
        } while (++tries < 8 && Math.hypot(x - player.x, y - player.y) < ec.minSpawnDistance);
        const hp = round > 3 ? Math.ceil(round / 3) : 1;
        enemies.push({ x, y, radius: ec.baseRadius * (0.7 + Math.random() * 0.6),
            speed: d.enemySpeed * (0.8 + Math.random() * 0.4), ck: 'red', health: hp, maxHealth: hp, hitUntil: 0 });
    }
}
function spawnBoss() {
    const size = 40 + (round / 5) * 10, hp = 10 + (round / 5) * 5;
    enemies.push({ x: W / 2, y: -size, radius: size, speed: CONFIG.enemy.bossSpeed, ck: 'orange',
        health: hp, maxHealth: hp, isBoss: true, hitUntil: 0 });
}
function nextRound() {
    round++;
    el.roundValue.textContent = round;
    const d = CONFIG.difficulty[settings.difficulty];
    if (round % 5 === 0) spawnBoss();
    else spawnEnemies(d.enemySpawnMultiplier + Math.floor(round * 1.5));
}

function burst(x, y, color, count) {
    if (!settings.effects) count = Math.ceil(count * 0.25);
    for (let i = 0; i < count && particles.length < CONFIG.effects.maxParticles; i++) {
        const a = Math.random() * Math.PI * 2, sp = 60 + Math.random() * 180, life = 500 + Math.random() * 333;
        particles.push({ x, y, r: 2 + Math.random() * 3, dx: Math.cos(a) * sp, dy: Math.sin(a) * sp, color, life, maxLife: life });
    }
}
function setScore(n) { score = n; el.scoreValue.textContent = n; }

// ---------------------------------------------------------------- rendering
function circle(x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283185307); ctx.fill(); }

function draw() {
    ctx.clearRect(0, 0, W, H);
    if (!player) return;
    for (let i = 0; i < particles.length; i++) {
        const q = particles[i];
        ctx.globalAlpha = q.life / q.maxLife; ctx.fillStyle = q.color; circle(q.x, q.y, q.r);
    }
    ctx.globalAlpha = 1;
    drawDrops();
    drawPlayer();
    ctx.fillStyle = colors.cyan;
    for (let i = 0; i < bullets.length; i++) circle(bullets[i].x, bullets[i].y, bullets[i].r);
    drawEnemies();
    drawFloaters();
    drawHUD();
    drawSticks();
}

function drawPlayer() {
    const p = player;
    ctx.fillStyle = colors.green; circle(p.x, p.y, p.radius);
    ctx.strokeStyle = colors.green; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + Math.cos(p.aim) * p.radius * 1.5, p.y + Math.sin(p.aim) * p.radius * 1.5); ctx.stroke();
    if (simTime < p.muzzleUntil) {
        ctx.fillStyle = colors.yellow;
        circle(p.x + Math.cos(p.aim) * p.radius * 1.7, p.y + Math.sin(p.aim) * p.radius * 1.7, 5);
    }
    if (simTime < p.fx.shield) {
        ctx.strokeStyle = colors.purple; ctx.lineWidth = 3; ctx.setLineDash([6, 4]);
        ctx.beginPath(); ctx.arc(p.x, p.y, p.radius + 7, 0, 6.283185307); ctx.stroke(); ctx.setLineDash([]);
    }
}

function drawEnemies() {
    for (let i = 0; i < enemies.length; i++) {
        const e = enemies[i];
        ctx.fillStyle = simTime < e.hitUntil ? colors.foreground : colors[e.ck];
        circle(e.x, e.y, e.radius);
        if (e.maxHealth > 1) {
            const f = e.health / e.maxHealth, bw = e.radius * 2, by = e.y - e.radius - 10;
            ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(e.x - bw / 2, by, bw, 4);
            ctx.fillStyle = f > 0.5 ? colors.green : f > 0.25 ? colors.orange : colors.red;
            ctx.fillRect(e.x - bw / 2, by, bw * f, 4);
        }
    }
}

function drawDrops() {
    ctx.font = 'bold 13px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let i = 0; i < drops.length; i++) {
        const d = drops[i], t = CONFIG.drops.types[d.type];
        const left = d.expires - simTime;
        if (left < 2000 && Math.floor(simTime / 150) % 2) continue;      // blink before expiring
        ctx.globalAlpha = 0.25; ctx.fillStyle = colors[t.color];
        circle(d.x, d.y, d.size * 1.1 + Math.sin(simTime / 200) * 3);    // cheap glow
        ctx.globalAlpha = 1;
        ctx.save(); ctx.translate(d.x, d.y); ctx.rotate(d.rot);
        ctx.fillRect(-d.size / 2, -d.size / 2, d.size, d.size); ctx.restore();
        ctx.fillStyle = colors.background; ctx.fillText(t.letter, d.x, d.y + 1);   // letter: not colour-only
    }
}

function drawFloaters() {
    ctx.font = 'bold 14px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let i = 0; i < floaters.length; i++) {
        const f = floaters[i];
        ctx.globalAlpha = clamp((f.until - simTime) / 400, 0, 1); ctx.fillStyle = f.color; ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
}

function drawHUD() {
    const w = CONFIG.weapon, cx = W / 2, by = H - 24;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = 'bold 18px Arial';
    const reloading = ammo.reloadEnd >= 0, none = ammo.mag === 0 && ammo.reserve === 0;
    ctx.fillStyle = none ? colors.red : ammo.mag <= 3 ? colors.orange : colors.foreground;
    ctx.fillText(reloading ? 'RELOADING' : none ? 'NO AMMO' : 'AMMO ' + ammo.mag + ' / ' + ammo.reserve, cx, by - 14);
    const bw = 8 * w.magSize + 2 * (w.magSize - 1), x0 = cx - bw / 2;
    if (reloading) {
        const f = clamp(1 - (ammo.reloadEnd - simTime) / w.reloadMs, 0, 1);
        ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(x0, by + 2, bw, 6);
        ctx.fillStyle = colors.cyan; ctx.fillRect(x0, by + 2, bw * f, 6);
    } else {
        ctx.fillStyle = colors.cyan;
        for (let i = 0; i < ammo.mag; i++) ctx.fillRect(x0 + i * 10, by + 2, 8, 6);
    }
    // active effects with text + timer
    ctx.textAlign = 'left'; ctx.font = 'bold 14px Arial';
    let y = 70;
    for (const k in player.fx) {
        const left = player.fx[k] - simTime; if (left <= 0) continue;
        const t = CONFIG.drops.types[k];
        ctx.fillStyle = colors[t.color]; ctx.fillText(t.label + (k === 'shield' ? ' (1 hit) ' : ' ') + (left / 1000).toFixed(1) + 's', 12, y);
        y += 20;
    }
}

function drawSticks() {
    [input.moveStick, input.aimStick].forEach(s => {
        if (!s) return;
        ctx.globalAlpha = 0.35; ctx.strokeStyle = colors.foreground; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(s.ox, s.oy, STICK_R, 0, 6.283185307); ctx.stroke();
        ctx.fillStyle = colors.foreground; circle(s.tx, s.ty, 24);
        ctx.globalAlpha = 1;
    });
}

// ---------------------------------------------------------------- input
function stickUpdate(s, x, y) {
    const dx = x - s.ox, dy = y - s.oy, len = Math.hypot(dx, dy);
    const mag = Math.min(len / STICK_R, 1);
    s.mag = mag < 0.1 ? 0 : mag;
    s.angle = Math.atan2(dy, dx);
    s.vx = len > 0 ? dx / len * s.mag : 0; s.vy = len > 0 ? dy / len * s.mag : 0;
    s.tx = s.ox + (len > 0 ? dx / len : 0) * Math.min(len, STICK_R);
    s.ty = s.oy + (len > 0 ? dy / len : 0) * Math.min(len, STICK_R);
}
function stickRelease(id) {
    if (input.moveStick && input.moveStick.id === id) input.moveStick = null;
    if (input.aimStick && input.aimStick.id === id) input.aimStick = null;
}

function setupEvents() {
    window.addEventListener('keydown', e => {
        const k = e.key.toLowerCase();
        if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
        keys[k] = true;
        if (e.repeat) return;
        if ((k === 'escape' || k === 'p') && (state === 'playing' || state === 'paused')) togglePause();
        else if (k === 'r') startReload();
    });
    window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });
    window.addEventListener('blur', () => { resetInput(); pauseGame(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) pauseGame(); });
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', resize);

    window.addEventListener('pointermove', e => {
        if (e.pointerType === 'touch') return;
        input.mx = e.clientX; input.my = e.clientY; input.hasMouse = true;
    });
    window.addEventListener('pointerup', e => { if (e.pointerType !== 'touch') input.fire = false; });

    canvas.addEventListener('contextmenu', e => e.preventDefault());
    canvas.addEventListener('pointerdown', e => {
        if (state !== 'playing') return;
        e.preventDefault();
        if (e.pointerType === 'touch') {
            document.body.classList.add('touch');
            const side = e.clientX < W / 2 ? 'moveStick' : 'aimStick';
            if (input[side]) return;
            const s = { id: e.pointerId, ox: e.clientX, oy: e.clientY, tx: e.clientX, ty: e.clientY, vx: 0, vy: 0, mag: 0, angle: 0 };
            input[side] = s;
            try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
        } else if (e.button === 0) {
            input.mx = e.clientX; input.my = e.clientY; input.hasMouse = true; input.fire = true;
        }
    });
    canvas.addEventListener('pointermove', e => {
        if (e.pointerType !== 'touch') return;
        [input.moveStick, input.aimStick].forEach(s => { if (s && s.id === e.pointerId) stickUpdate(s, e.clientX, e.clientY); });
    });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(t =>
        canvas.addEventListener(t, e => { if (e.pointerType === 'touch') stickRelease(e.pointerId); }));

    $('startButton').addEventListener('click', startGame);
    $('restartButton').addEventListener('click', startGame);
    $('resumeButton').addEventListener('click', resumeGame);
    $('restartFromPauseButton').addEventListener('click', startGame);
    el.reload.addEventListener('pointerdown', e => { e.preventDefault(); startReload(); });
    el.pauseBtn.addEventListener('pointerdown', e => { e.preventDefault(); pauseGame(); });

    document.querySelectorAll('.toggle-theme').forEach(b => b.addEventListener('click', () => {
        settings.light = !settings.light; store.set('light', settings.light);
        document.documentElement.classList.toggle('light-mode', settings.light);
        refreshColors(); if (state !== 'playing') draw();
    }));
    document.querySelectorAll('.toggle-sound').forEach(b => b.addEventListener('click', () => {
        settings.sound = !settings.sound; store.set('sound', settings.sound); updateToggleLabels();
    }));
    document.querySelectorAll('.toggle-effects').forEach(b => b.addEventListener('click', () => {
        settings.effects = !settings.effects; store.set('effects', settings.effects); updateToggleLabels();
    }));
}

window.addEventListener('load', init);
window.__bs = { frame, startGame, update, snapshot: () => ({ state, score, round, simTime, player, enemies, bullets, particles, drops, ammo, keys, input }) };