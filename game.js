const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");
const modeButton = document.querySelector("#modeButton");
const restartButton = document.querySelector("#restartButton");
const roundState = document.querySelector("#roundState");

const W = canvas.width;
const H = canvas.height;
const FLOOR = 594;
const GRAVITY = 0.78;
const keys = new Set();
let singlePlayer = true;
let slowMo = 0;
let shake = 0;
let winner = null;
let lastTime = performance.now();
let particles = [];
let projectiles = [];
let afterImages = [];
let flashes = [];

const controls = {
  p1: {
    left: "KeyA",
    right: "KeyD",
    jump: "KeyW",
    block: "KeyS",
    dash: "Space",
    light: "KeyJ",
    heavy: "KeyK",
    special: "KeyL",
  },
  p2: {
    left: "ArrowLeft",
    right: "ArrowRight",
    jump: "ArrowUp",
    block: "ArrowDown",
    dash: "Numpad0",
    light: "Numpad1",
    heavy: "Numpad2",
    special: "Numpad3",
    dashAlt: "Digit0",
    lightAlt: "Digit1",
    heavyAlt: "Digit2",
    specialAlt: "Digit3",
  },
};

const palette = {
  p1: {
    main: "#f3ead7",
    trim: "#ff553e",
    aura: "#ff725d",
    energy: "#ffd36f",
    shadow: "#332220",
    hair: "#3a1d1a",
    skin: "#f2c99f",
    blade: "#f7f4e9",
  },
  p2: {
    main: "#202b3f",
    trim: "#47d7ff",
    aura: "#47d7ff",
    energy: "#67e889",
    shadow: "#101520",
    hair: "#10182a",
    skin: "#e8c28f",
    blade: "#bff3ff",
  },
};

function makeFighter(id, x, name, color) {
  return {
    id,
    name,
    color,
    x,
    y: FLOOR,
    vx: 0,
    vy: 0,
    w: 58,
    h: 138,
    facing: id === "p1" ? 1 : -1,
    health: 100,
    energy: 35,
    grounded: true,
    attacking: null,
    attackFrame: 0,
    hurt: 0,
    block: false,
    dash: 0,
    cooldowns: { light: 0, heavy: 0, special: 0, dash: 0 },
    combo: 0,
    aiThink: 0,
    aiPlan: "hold",
  };
}

let p1;
let p2;

function resetGame(message = "按任意攻击键开战") {
  p1 = makeFighter("p1", 260, "灵刃剑士", palette.p1);
  p2 = makeFighter("p2", 1020, "影狐忍者", palette.p2);
  particles = [];
  projectiles = [];
  afterImages = [];
  flashes = [];
  slowMo = 0;
  shake = 0;
  winner = null;
  roundState.textContent = message;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function bodyRect(f) {
  return { x: f.x - f.w / 2, y: f.y - f.h, w: f.w, h: f.h };
}

function attackRect(f) {
  const reach = f.attacking === "heavy" ? 96 : 72;
  const height = f.attacking === "special" ? 46 : 58;
  const y = f.y - f.h + 42;
  return {
    x: f.facing > 0 ? f.x + 16 : f.x - reach - 16,
    y,
    w: reach,
    h: height,
  };
}

function startAttack(f, type) {
  if (winner || f.hurt > 0 || f.attacking || f.cooldowns[type] > 0) return;

  if (type === "special") {
    if (f.energy < 28) return;
    f.energy -= 28;
  }

  const timing = {
    light: { total: 21, cooldown: 18 },
    heavy: { total: 34, cooldown: 34 },
    special: { total: 42, cooldown: 52 },
  }[type];

  f.attacking = type;
  f.attackFrame = timing.total;
  f.cooldowns[type] = timing.cooldown;
  f.vx *= 0.35;

  if (type === "special") {
    const speed = f.id === "p1" ? 10 : 9;
    projectiles.push({
      owner: f.id,
      x: f.x + f.facing * 58,
      y: f.y - 82,
      vx: f.facing * speed,
      r: f.id === "p1" ? 20 : 17,
      damage: f.id === "p1" ? 15 : 13,
      life: 80,
      color: f.color.aura,
      hit: false,
    });
  }
}

function dash(f) {
  if (winner || f.cooldowns.dash > 0 || f.energy < 14 || f.hurt > 0) return;
  f.energy -= 14;
  f.dash = 12;
  f.cooldowns.dash = 42;
  f.vx = f.facing * 14;
  burst(f.x - f.facing * 20, f.y - 32, f.color.aura, 16, 7);
  afterImages.push(snapshotFighter(f, 0.34));
}

function jump(f) {
  if (winner || !f.grounded || f.hurt > 0) return;
  f.vy = -16.5;
  f.grounded = false;
}

function takeHit(target, attacker, damage, knockback) {
  if (target.hurt > 4) return;
  const blocked = target.block && target.facing === -attacker.facing;
  const finalDamage = blocked ? Math.ceil(damage * 0.28) : damage;
  target.health = clamp(target.health - finalDamage, 0, 100);
  target.energy = clamp(target.energy + (blocked ? 8 : 5), 0, 100);
  attacker.energy = clamp(attacker.energy + 9, 0, 100);
  target.hurt = blocked ? 10 : 18;
  target.vx = attacker.facing * knockback * (blocked ? 0.45 : 1);
  target.vy = blocked ? target.vy : -3.2;
  attacker.combo = blocked ? attacker.combo : Math.floor(attacker.combo) + 1;
  shake = blocked ? 5 : 11;
  slowMo = blocked ? 0 : 4;
  burst(target.x, target.y - 74, blocked ? "#d7dee8" : attacker.color.aura, blocked ? 10 : 24, blocked ? 4 : 9);
  flashes.push({
    x: target.x,
    y: target.y - 82,
    r: blocked ? 58 : 88,
    life: blocked ? 13 : 18,
    max: blocked ? 13 : 18,
    color: blocked ? "#d7dee8" : attacker.color.aura,
  });
  slashBurst(target.x, target.y - 84, attacker.facing, blocked ? "#d7dee8" : attacker.color.aura, blocked ? 3 : 7);

  if (target.health <= 0) {
    winner = attacker;
    roundState.textContent = `${attacker.name} 胜利`;
  } else {
    roundState.textContent = blocked ? "格挡成功" : `${Math.max(1, Math.floor(attacker.combo))} 连击`;
  }
}

function slashBurst(x, y, facing, color, count) {
  for (let i = 0; i < count; i += 1) {
    particles.push({
      type: "streak",
      x,
      y: y + (Math.random() - 0.5) * 58,
      vx: facing * (4 + Math.random() * 9),
      vy: (Math.random() - 0.5) * 5,
      life: 14 + Math.random() * 10,
      color,
      size: 16 + Math.random() * 28,
      spin: (Math.random() - 0.5) * 0.9,
    });
  }
}

function burst(x, y, color, count, power) {
  for (let i = 0; i < count; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const speed = Math.random() * power + 1;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 1,
      life: 24 + Math.random() * 18,
      color,
      size: 2 + Math.random() * 5,
      type: Math.random() < 0.35 ? "spark" : "dot",
    });
  }
}

function snapshotFighter(f, alpha = 0.22) {
  return {
    id: f.id,
    x: f.x,
    y: f.y,
    facing: f.facing,
    color: f.color,
    alpha,
    life: 16,
    max: 16,
  };
}

function handlePlayerInput(f, c) {
  const left = keys.has(c.left);
  const right = keys.has(c.right);
  const speed = f.block ? 2.1 : 5.8;

  if (keys.has(c.block) && f.grounded && !f.attacking && f.hurt <= 0) {
    f.block = true;
    f.vx *= 0.7;
  } else {
    f.block = false;
    if (left) f.vx -= speed;
    if (right) f.vx += speed;
  }
  f.vx = clamp(f.vx, -12, 12);
}

function aiInput(ai, enemy) {
  ai.aiThink -= 1;
  if (ai.aiThink <= 0) {
    const distance = Math.abs(enemy.x - ai.x);
    ai.aiThink = 12 + Math.random() * 18;
    ai.aiPlan = distance > 280 ? "close" : distance < 76 ? "retreat" : "pressure";
  }

  const dir = Math.sign(enemy.x - ai.x) || ai.facing;
  const distance = Math.abs(enemy.x - ai.x);
  ai.block = false;

  if (ai.hurt > 0) return;
  if (enemy.attacking && distance < 120 && Math.random() < 0.55) {
    ai.block = ai.grounded;
    ai.vx *= 0.75;
    return;
  }
  if (ai.aiPlan === "close") ai.vx += dir * 4.7;
  if (ai.aiPlan === "retreat") ai.vx -= dir * 4.2;
  if (distance < 190 && Math.random() < 0.035) dash(ai);
  if (distance < 108 && Math.random() < 0.075) startAttack(ai, Math.random() < 0.7 ? "light" : "heavy");
  if (distance > 150 && distance < 510 && ai.energy > 30 && Math.random() < 0.045) startAttack(ai, "special");
  if (enemy.attacking && Math.random() < 0.02) jump(ai);
}

function updateFighter(f, enemy) {
  f.facing = enemy.x >= f.x ? 1 : -1;

  for (const key of Object.keys(f.cooldowns)) {
    f.cooldowns[key] = Math.max(0, f.cooldowns[key] - 1);
  }

  f.energy = clamp(f.energy + 0.035, 0, 100);
  if (f.hurt > 0) f.hurt -= 1;
  if (f.dash > 0) f.dash -= 1;
  if (f.combo > 0 && !f.attacking) f.combo = Math.max(0, f.combo - 0.025);
  if ((Math.abs(f.vx) > 8 || f.dash > 0 || f.attacking === "special") && Math.random() < 0.28) {
    afterImages.push(snapshotFighter(f, f.dash > 0 ? 0.26 : 0.16));
  }

  if (f.attackFrame > 0) {
    f.attackFrame -= 1;
    if (f.attackFrame === 0) f.attacking = null;
  }

  f.vy += GRAVITY;
  f.x += f.vx;
  f.y += f.vy;
  f.vx *= f.grounded ? 0.78 : 0.92;

  if (f.y >= FLOOR) {
    f.y = FLOOR;
    f.vy = 0;
    f.grounded = true;
  }

  f.x = clamp(f.x, 64, W - 64);
}

function resolveBodyPush() {
  const a = bodyRect(p1);
  const b = bodyRect(p2);
  if (!rectsOverlap(a, b)) return;
  const overlap = Math.min(a.x + a.w - b.x, b.x + b.w - a.x);
  const push = overlap / 2 + 0.1;
  if (p1.x < p2.x) {
    p1.x -= push;
    p2.x += push;
  } else {
    p1.x += push;
    p2.x -= push;
  }
}

function resolveAttacks() {
  for (const [attacker, target] of [[p1, p2], [p2, p1]]) {
    if (!attacker.attacking || attacker.attackFrame !== activeHitFrame(attacker.attacking)) continue;
    if (rectsOverlap(attackRect(attacker), bodyRect(target))) {
      const data = {
        light: { damage: 7, knockback: 6.5 },
        heavy: { damage: 13, knockback: 10 },
        special: { damage: 10, knockback: 8 },
      }[attacker.attacking];
      takeHit(target, attacker, data.damage, data.knockback);
    }
  }
}

function activeHitFrame(type) {
  return { light: 13, heavy: 19, special: 26 }[type];
}

function updateProjectiles() {
  for (const p of projectiles) {
    p.x += p.vx;
    p.life -= 1;
    const target = p.owner === "p1" ? p2 : p1;
    const owner = p.owner === "p1" ? p1 : p2;
    const hitbox = { x: p.x - p.r, y: p.y - p.r, w: p.r * 2, h: p.r * 2 };
    if (!p.hit && rectsOverlap(hitbox, bodyRect(target))) {
      p.hit = true;
      p.life = 0;
      takeHit(target, owner, p.damage, 11);
    }
    if (Math.random() < 0.6) burst(p.x, p.y, p.color, 1, 1.5);
  }
  projectiles = projectiles.filter((p) => p.life > 0 && p.x > -80 && p.x < W + 80);
}

function updateParticles() {
  for (const p of particles) {
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.22;
    p.vx *= 0.96;
    p.life -= 1;
  }
  particles = particles.filter((p) => p.life > 0);
  for (const ghost of afterImages) ghost.life -= 1;
  afterImages = afterImages.filter((ghost) => ghost.life > 0);
  for (const flash of flashes) flash.life -= 1;
  flashes = flashes.filter((flash) => flash.life > 0);
}

function update() {
  if (!winner) {
    handlePlayerInput(p1, controls.p1);
    if (singlePlayer) aiInput(p2, p1);
    else handlePlayerInput(p2, controls.p2);
  }

  updateFighter(p1, p2);
  updateFighter(p2, p1);
  resolveBodyPush();
  resolveAttacks();
  updateProjectiles();
  updateParticles();
  shake = Math.max(0, shake - 0.6);
  slowMo = Math.max(0, slowMo - 1);
}

function drawBackground() {
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, "#111a26");
  sky.addColorStop(0.48, "#201823");
  sky.addColorStop(1, "#0c0d10");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = "rgba(255, 211, 111, 0.13)";
  ctx.beginPath();
  ctx.arc(676, 156, 122, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255, 211, 111, 0.07)";
  ctx.beginPath();
  ctx.arc(676, 156, 174, 0, Math.PI * 2);
  ctx.fill();

  drawCityLayer(0.22, 86, "#121721");
  drawCityLayer(0.44, 132, "#17131b");
  drawTorii(148, FLOOR - 76, "#33201a");
  drawTorii(1086, FLOOR - 76, "#172637");

  ctx.save();
  ctx.globalAlpha = 0.34;
  for (let i = 0; i < 52; i += 1) {
    const x = (i * 89 + 30) % W;
    const y = 70 + ((i * 47) % 320);
    ctx.fillStyle = i % 2 ? "#ff6a45" : "#47d7ff";
    ctx.fillRect(x, y, 2, 22 + (i % 5) * 13);
  }
  ctx.restore();

  ctx.fillStyle = "#171513";
  ctx.fillRect(0, FLOOR, W, H - FLOOR);
  ctx.fillStyle = "#3e362d";
  ctx.fillRect(0, FLOOR, W, 8);
  ctx.fillStyle = "#6c5440";
  ctx.fillRect(0, FLOOR - 7, W, 3);

  for (let i = 0; i < 10; i += 1) {
    ctx.fillStyle = i % 2 ? "#25221d" : "#302a22";
    ctx.fillRect(i * 148 - 36, FLOOR + 18 + (i % 3) * 8, 118, 7);
  }

  ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
  ctx.lineWidth = 1;
  for (let i = 0; i < 18; i += 1) {
    ctx.beginPath();
    ctx.moveTo(i * 82 - 20, FLOOR + 2);
    ctx.lineTo(i * 82 - 86, H);
    ctx.stroke();
  }
}

function drawCityLayer(alpha, baseY, color) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  for (let i = 0; i < 14; i += 1) {
    const w = 56 + (i % 4) * 20;
    const h = 110 + ((i * 31) % 110);
    const x = i * 102 - 42;
    ctx.fillRect(x, baseY + 280 - h, w, h);
    ctx.fillStyle = i % 2 ? "#ff6a45" : "#47d7ff";
    ctx.fillRect(x + 10, baseY + 296 - h, w - 20, 5);
    ctx.fillStyle = color;
  }
  ctx.restore();
}

function drawTorii(x, y, color) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.fillRect(x - 96, y - 12, 192, 14);
  ctx.fillRect(x - 78, y + 4, 156, 10);
  ctx.fillRect(x - 62, y + 14, 14, 92);
  ctx.fillRect(x + 48, y + 14, 14, 92);
  ctx.fillStyle = "rgba(255, 255, 255, 0.09)";
  ctx.fillRect(x - 92, y - 10, 184, 3);
  ctx.restore();
}

function drawBars() {
  drawMeter(42, 34, 460, p1.health, "#e94b35", p1.name, false);
  drawMeter(W - 502, 34, 460, p2.health, "#45d6ff", p2.name, true);
  drawEnergy(42, 82, 310, p1.energy, "#f2c46f", false);
  drawEnergy(W - 352, 82, 310, p2.energy, "#55dc75", true);
}

function drawMeter(x, y, width, value, color, label, right) {
  ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
  ctx.fillRect(x, y, width, 28);
  ctx.strokeStyle = "#655d4d";
  ctx.strokeRect(x, y, width, 28);
  ctx.fillStyle = color;
  const fill = (width - 6) * (value / 100);
  ctx.fillRect(right ? x + width - 3 - fill : x + 3, y + 3, fill, 22);
  ctx.fillStyle = "#f6efe2";
  ctx.font = "700 17px Avenir Next, sans-serif";
  ctx.textAlign = right ? "right" : "left";
  ctx.fillText(label, right ? x + width - 10 : x + 10, y + 21);
}

function drawEnergy(x, y, width, value, color, right) {
  ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
  ctx.fillRect(x, y, width, 10);
  ctx.fillStyle = color;
  const fill = width * (value / 100);
  ctx.fillRect(right ? x + width - fill : x, y, fill, 10);
}

function drawFighter(f) {
  const bob = Math.sin(performance.now() / 130 + f.x) * (f.grounded ? 2 : 0);
  const x = f.x;
  const y = f.y + bob;
  const c = f.color;

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(f.facing, 1);

  if (f.block) {
    ctx.fillStyle = `${c.aura}22`;
    ctx.beginPath();
    ctx.ellipse(33, -76, 28, 94, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = `${c.aura}aa`;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.ellipse(35, -76, 25, 86, 0, -1.25, 1.25);
    ctx.stroke();
  }

  if (f.dash > 0 || f.attacking === "special") {
    ctx.fillStyle = `${c.aura}44`;
    ctx.beginPath();
    ctx.ellipse(-20, -74, 42 + f.dash * 2, 88, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = "rgba(0, 0, 0, 0.32)";
  ctx.beginPath();
  ctx.ellipse(0, 7, 58, 12, 0, 0, Math.PI * 2);
  ctx.fill();

  drawAura(c);
  if (f.id === "p1") drawSoulWarrior(f, c);
  else drawShadowNinja(f, c);
  drawWeapon(f);

  if (f.attacking && f.attacking !== "special") {
    drawAttackArc(f);
  }

  if (f.hurt > 0) {
    ctx.globalAlpha = 0.36;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.ellipse(0, -78, 38, 88, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawAura(c) {
  ctx.save();
  ctx.globalAlpha = 0.2;
  ctx.strokeStyle = c.aura;
  ctx.lineWidth = 2;
  for (let i = 0; i < 3; i += 1) {
    ctx.beginPath();
    ctx.ellipse(0, -74, 34 + i * 10, 76 + i * 7, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawSoulWarrior(f, c) {
  const lean = clamp(f.vx / 18, -0.42, 0.42);
  ctx.save();
  ctx.rotate(lean * 0.08);

  ctx.fillStyle = c.shadow;
  ctx.beginPath();
  ctx.moveTo(-30, -116);
  ctx.lineTo(24, -120);
  ctx.lineTo(36, -8);
  ctx.lineTo(-18, -10);
  ctx.lineTo(-42, -70);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = c.main;
  ctx.beginPath();
  ctx.moveTo(-18, -118);
  ctx.lineTo(18, -118);
  ctx.lineTo(24, -22);
  ctx.lineTo(-24, -22);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = c.trim;
  ctx.fillRect(5, -112, 9, 92);
  ctx.fillRect(-23, -66, 48, 8);

  ctx.fillStyle = c.skin;
  ctx.beginPath();
  ctx.arc(0, -137, 19, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = c.hair;
  ctx.beginPath();
  ctx.moveTo(-24, -148);
  ctx.lineTo(0, -164);
  ctx.lineTo(28, -149);
  ctx.lineTo(12, -132);
  ctx.lineTo(-22, -133);
  ctx.closePath();
  ctx.fill();

  drawLimb(-13, -82, -43, -38, c.trim, 9);
  drawLimb(14, -82, 39, -52, c.trim, 9);
  drawLimb(-11, -24, -26, 0, c.main, 10);
  drawLimb(14, -24, 27, 0, c.main, 10);
  ctx.restore();
}

function drawShadowNinja(f, c) {
  const lean = clamp(f.vx / 18, -0.42, 0.42);
  ctx.save();
  ctx.rotate(lean * 0.1);

  ctx.fillStyle = c.shadow;
  ctx.beginPath();
  ctx.moveTo(-28, -118);
  ctx.lineTo(22, -116);
  ctx.lineTo(32, -14);
  ctx.lineTo(-26, -16);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = c.main;
  ctx.beginPath();
  ctx.moveTo(-17, -116);
  ctx.lineTo(16, -116);
  ctx.lineTo(18, -22);
  ctx.lineTo(-18, -22);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = c.trim;
  ctx.fillRect(-6, -113, 9, 92);
  ctx.fillRect(-25, -88, 50, 7);
  ctx.fillRect(-18, -51, 36, 5);

  ctx.fillStyle = c.skin;
  ctx.beginPath();
  ctx.arc(0, -136, 18, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = c.hair;
  ctx.fillRect(-23, -151, 46, 17);
  ctx.fillStyle = c.trim;
  ctx.fillRect(-20, -139, 40, 5);

  ctx.strokeStyle = `${c.aura}77`;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(-20, -145, 12, 2.4, 5.3);
  ctx.arc(20, -145, 12, 4.1, 0.7);
  ctx.stroke();

  drawLimb(-12, -84, -38, -45, c.trim, 8);
  drawLimb(12, -84, 42, -52, c.trim, 8);
  drawLimb(-10, -24, -25, 1, c.main, 10);
  drawLimb(12, -24, 27, 1, c.main, 10);
  ctx.restore();
}

function drawLimb(x1, y1, x2, y2, color, width) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function drawWeapon(f) {
  if (f.id === "p1") drawSword(f);
  else drawKunai(f);
}

function drawAttackArc(f) {
  const c = f.color;
  const progress = 1 - f.attackFrame / (f.attacking === "heavy" ? 34 : 21);
  const reach = f.attacking === "heavy" ? 116 : 88;
  const radius = reach + progress * 16;

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const gradient = ctx.createRadialGradient(44, -80, 6, 44, -80, radius);
  gradient.addColorStop(0, "rgba(255,255,255,0.94)");
  gradient.addColorStop(0.34, `${c.aura}dd`);
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.strokeStyle = gradient;
  ctx.lineWidth = f.attacking === "heavy" ? 18 : 12;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(42, -80, radius, -0.8, 0.58);
  ctx.stroke();
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(42, -80, radius - 8, -0.62, 0.35);
  ctx.stroke();
  ctx.restore();
}

function drawAfterImages() {
  for (const ghost of afterImages) {
    ctx.save();
    ctx.globalAlpha = ghost.alpha * (ghost.life / ghost.max);
    ctx.globalCompositeOperation = "lighter";
    ctx.translate(ghost.x, ghost.y);
    ctx.scale(ghost.facing, 1);
    ctx.fillStyle = ghost.color.aura;
    ctx.beginPath();
    ctx.ellipse(0, -82, 34, 76, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(-12, -132, 24, 80);
    ctx.restore();
  }
}

function drawFlashes() {
  for (const flash of flashes) {
    const t = flash.life / flash.max;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = t;
    ctx.strokeStyle = flash.color;
    ctx.lineWidth = 5 + (1 - t) * 14;
    ctx.beginPath();
    ctx.arc(flash.x, flash.y, flash.r * (1 - t * 0.34), 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    for (let i = 0; i < 6; i += 1) {
      const angle = (Math.PI * 2 * i) / 6;
      ctx.fillRect(flash.x + Math.cos(angle) * flash.r * 0.32, flash.y + Math.sin(angle) * flash.r * 0.32, 18 * t, 3);
    }
    ctx.restore();
  }
}

function drawSword(f) {
  const active = f.attacking && f.attacking !== "special";
  ctx.save();
  ctx.rotate(active && f.attacking === "heavy" ? -0.55 : -0.24);
  ctx.strokeStyle = "#47352c";
  ctx.lineWidth = 9;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(30, -54);
  ctx.lineTo(68, -70);
  ctx.stroke();

  ctx.strokeStyle = active ? f.color.aura : f.color.blade;
  ctx.lineWidth = active ? 8 : 5;
  ctx.beginPath();
  ctx.moveTo(58, -70);
  ctx.lineTo(active ? 154 : 130, active ? -104 : -90);
  ctx.stroke();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(62, -73);
  ctx.lineTo(active ? 150 : 126, active ? -106 : -92);
  ctx.stroke();
  ctx.restore();
}

function drawKunai(f) {
  const active = f.attacking && f.attacking !== "special";
  ctx.save();
  ctx.rotate(active ? 0.28 : 0.12);
  ctx.fillStyle = f.color.blade;
  ctx.beginPath();
  ctx.moveTo(42, -60);
  ctx.lineTo(active ? 104 : 82, -75);
  ctx.lineTo(active ? 74 : 55, -42);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = f.color.trim;
  ctx.beginPath();
  ctx.arc(42, -58, 10, 0, Math.PI * 2);
  ctx.fill();
  if (active) {
    ctx.strokeStyle = f.color.aura;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(64, -58, 40, -0.85, 0.82);
    ctx.stroke();
  }
  ctx.restore();
}

function drawProjectiles() {
  for (const p of projectiles) {
    const glow = ctx.createRadialGradient(p.x, p.y, 2, p.x, p.y, p.r * 3.2);
    glow.addColorStop(0, p.color);
    glow.addColorStop(0.35, `${p.color}aa`);
    glow.addColorStop(1, "rgba(255,255,255,0)");
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.ellipse(p.x - Math.sign(p.vx) * 18, p.y, p.r * 3.8, p.r * 1.55, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r * 0.38, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = p.color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r * 0.92, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

function drawParticles() {
  for (const p of particles) {
    ctx.globalAlpha = clamp(p.life / 30, 0, 1);
    ctx.fillStyle = p.color;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.spin || 0);
    if (p.type === "streak") {
      ctx.fillRect(-p.size / 2, -2, p.size, 4);
    } else if (p.type === "spark") {
      ctx.fillRect(-p.size / 2, -1, p.size, 2);
      ctx.fillRect(-1, -p.size / 2, 2, p.size);
    } else {
      ctx.fillRect(0, 0, p.size, p.size);
    }
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

function drawCenterText() {
  if (!winner) return;
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#f6efe2";
  ctx.font = "900 66px Avenir Next, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(`${winner.name} 胜利`, W / 2, H / 2 - 10);
  ctx.fillStyle = "#f4b84a";
  ctx.font = "700 22px Avenir Next, sans-serif";
  ctx.fillText("按 R 或点击重新开始", W / 2, H / 2 + 38);
}

function render() {
  ctx.save();
  if (shake > 0) {
    ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
  }
  drawBackground();
  drawBars();
  drawAfterImages();
  drawProjectiles();
  drawFighter(p1);
  drawFighter(p2);
  drawParticles();
  drawFlashes();
  drawCenterText();
  ctx.restore();
}

function frame(now) {
  const elapsed = now - lastTime;
  lastTime = now;
  const steps = slowMo > 0 ? 1 : Math.min(3, Math.max(1, Math.round(elapsed / 16.7)));
  for (let i = 0; i < steps; i += 1) update();
  render();
  requestAnimationFrame(frame);
}

window.addEventListener("keydown", (event) => {
  keys.add(event.code);
  if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.code)) {
    event.preventDefault();
  }
  if (event.code === "KeyR") resetGame();
  if (event.code === controls.p1.jump) jump(p1);
  if (event.code === controls.p1.dash) dash(p1);
  if (event.code === controls.p1.light) startAttack(p1, "light");
  if (event.code === controls.p1.heavy) startAttack(p1, "heavy");
  if (event.code === controls.p1.special) startAttack(p1, "special");

  if (!singlePlayer) {
    if (event.code === controls.p2.jump) jump(p2);
    if (event.code === controls.p2.dash || event.code === controls.p2.dashAlt) dash(p2);
    if (event.code === controls.p2.light || event.code === controls.p2.lightAlt) startAttack(p2, "light");
    if (event.code === controls.p2.heavy || event.code === controls.p2.heavyAlt) startAttack(p2, "heavy");
    if (event.code === controls.p2.special || event.code === controls.p2.specialAlt) startAttack(p2, "special");
  }
});

window.addEventListener("keyup", (event) => {
  keys.delete(event.code);
});

modeButton.addEventListener("click", () => {
  singlePlayer = !singlePlayer;
  modeButton.textContent = singlePlayer ? "单人模式" : "双人模式";
  resetGame(singlePlayer ? "单人模式：P2 由 AI 控制" : "双人模式：键盘同屏对战");
});

restartButton.addEventListener("click", () => resetGame());

resetGame();
requestAnimationFrame(frame);
