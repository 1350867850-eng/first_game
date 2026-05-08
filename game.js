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
    main: "#e8e0d0",
    trim: "#e94b35",
    aura: "#ff664f",
    energy: "#f2c46f",
    shadow: "#3d2520",
  },
  p2: {
    main: "#30343f",
    trim: "#45d6ff",
    aura: "#45d6ff",
    energy: "#55dc75",
    shadow: "#151a26",
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
  attacker.combo += blocked ? 0 : 1;
  shake = blocked ? 5 : 11;
  slowMo = blocked ? 0 : 4;
  burst(target.x, target.y - 74, blocked ? "#d7dee8" : attacker.color.aura, blocked ? 10 : 24, blocked ? 4 : 9);

  if (target.health <= 0) {
    winner = attacker;
    roundState.textContent = `${attacker.name} 胜利`;
  } else {
    roundState.textContent = blocked ? "格挡成功" : `${attacker.combo} 连击`;
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
    });
  }
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
  sky.addColorStop(0, "#171a20");
  sky.addColorStop(0.56, "#242016");
  sky.addColorStop(1, "#0e0e0c");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  ctx.globalAlpha = 0.2;
  for (let i = 0; i < 42; i += 1) {
    const x = (i * 89 + 30) % W;
    const y = 80 + ((i * 47) % 280);
    ctx.fillStyle = i % 2 ? "#e94b35" : "#45d6ff";
    ctx.fillRect(x, y, 2, 26 + (i % 5) * 12);
  }
  ctx.restore();

  ctx.fillStyle = "#1b1a16";
  ctx.fillRect(0, FLOOR, W, H - FLOOR);
  ctx.fillStyle = "#343026";
  ctx.fillRect(0, FLOOR, W, 6);

  for (let i = 0; i < 8; i += 1) {
    ctx.fillStyle = i % 2 ? "#25221d" : "#2e2a22";
    ctx.fillRect(i * 180 - 40, FLOOR + 18 + (i % 3) * 8, 150, 7);
  }

  ctx.fillStyle = "rgba(244, 184, 74, 0.08)";
  ctx.beginPath();
  ctx.arc(W / 2, 170, 94, 0, Math.PI * 2);
  ctx.fill();
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
    ctx.fillStyle = `${c.aura}33`;
    ctx.beginPath();
    ctx.ellipse(30, -74, 22, 82, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  if (f.dash > 0 || f.attacking === "special") {
    ctx.fillStyle = `${c.aura}55`;
    ctx.beginPath();
    ctx.ellipse(-16, -74, 34 + f.dash * 2, 82, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = "rgba(0, 0, 0, 0.32)";
  ctx.beginPath();
  ctx.ellipse(0, 4, 48, 10, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = c.shadow;
  ctx.fillRect(-22, -86, 44, 76);
  ctx.fillStyle = c.main;
  ctx.fillRect(-18, -116, 36, 52);
  ctx.fillStyle = c.trim;
  ctx.fillRect(6, -112, 10, 92);

  ctx.fillStyle = "#f0d0a6";
  ctx.beginPath();
  ctx.arc(0, -132, 20, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = c.shadow;
  ctx.fillRect(-22, -152, 44, 18);

  ctx.strokeStyle = c.trim;
  ctx.lineWidth = 8;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-10, -78);
  ctx.lineTo(-36, -42);
  ctx.moveTo(10, -78);
  ctx.lineTo(40, -52);
  ctx.stroke();

  ctx.strokeStyle = c.main;
  ctx.beginPath();
  ctx.moveTo(-10, -12);
  ctx.lineTo(-20, 0);
  ctx.moveTo(12, -12);
  ctx.lineTo(26, 0);
  ctx.stroke();

  if (f.id === "p1") drawSword(f);
  else drawKunai(f);

  if (f.attacking && f.attacking !== "special") {
    const hit = attackRect(f);
    ctx.globalAlpha = f.attackFrame < 20 ? 0.34 : 0.18;
    ctx.fillStyle = c.aura;
    ctx.fillRect(hit.x * f.facing - x * f.facing, hit.y - y, hit.w, hit.h);
  }

  if (f.hurt > 0) {
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(-30, -156, 60, 150);
  }

  ctx.restore();
}

function drawSword(f) {
  ctx.strokeStyle = f.attacking ? f.color.aura : "#d8d3c6";
  ctx.lineWidth = f.attacking === "heavy" ? 8 : 5;
  ctx.beginPath();
  const length = f.attacking ? 120 : 90;
  const lift = f.attacking === "heavy" ? -42 : -18;
  ctx.moveTo(35, -58);
  ctx.lineTo(length, -86 + lift);
  ctx.stroke();
}

function drawKunai(f) {
  ctx.fillStyle = f.color.trim;
  ctx.beginPath();
  ctx.moveTo(40, -58);
  ctx.lineTo(78, -70);
  ctx.lineTo(50, -42);
  ctx.closePath();
  ctx.fill();
  if (f.attacking === "heavy") {
    ctx.strokeStyle = f.color.aura;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(66, -58, 32, -0.8, 0.8);
    ctx.stroke();
  }
}

function drawProjectiles() {
  for (const p of projectiles) {
    const glow = ctx.createRadialGradient(p.x, p.y, 2, p.x, p.y, p.r * 2.6);
    glow.addColorStop(0, p.color);
    glow.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r * 2.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r * 0.38, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawParticles() {
  for (const p of particles) {
    ctx.globalAlpha = clamp(p.life / 30, 0, 1);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x, p.y, p.size, p.size);
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
  drawProjectiles();
  drawFighter(p1);
  drawFighter(p2);
  drawParticles();
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
