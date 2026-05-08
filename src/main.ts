import Phaser from "phaser";
import "./style.css";

const WIDTH = 1280;
const HEIGHT = 720;
const FLOOR = 592;
const GRAVITY = 1850;

type FighterId = "p1" | "p2";
type AttackType = "light" | "heavy" | "special";
type Mode = "single" | "versus";

interface Palette {
  main: number;
  trim: number;
  aura: number;
  energy: number;
  shadow: number;
  skin: number;
  blade: number;
}

interface AttackState {
  type: AttackType;
  timer: number;
  total: number;
  hitDone: boolean;
}

interface Fighter {
  id: FighterId;
  name: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  health: number;
  energy: number;
  grounded: boolean;
  blocking: boolean;
  hurtTimer: number;
  dashTimer: number;
  attack?: AttackState;
  cooldowns: Record<AttackType | "dash", number>;
  combo: number;
  aiThink: number;
  aiPlan: "close" | "retreat" | "pressure" | "hold";
  palette: Palette;
}

interface Projectile {
  owner: FighterId;
  x: number;
  y: number;
  vx: number;
  radius: number;
  damage: number;
  life: number;
  color: number;
}

interface AfterImage {
  x: number;
  y: number;
  color: number;
  life: number;
  maxLife: number;
}

interface Flash {
  x: number;
  y: number;
  radius: number;
  color: number;
  life: number;
  maxLife: number;
}

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: number;
  life: number;
  maxLife: number;
  size: number;
}

class DuelScene extends Phaser.Scene {
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private mode: Mode = "single";
  private winner?: Fighter;
  private p1!: Fighter;
  private p2!: Fighter;
  private projectiles: Projectile[] = [];
  private afterImages: AfterImage[] = [];
  private flashes: Flash[] = [];
  private sparks: Spark[] = [];
  private world!: Phaser.GameObjects.Graphics;
  private actors!: Phaser.GameObjects.Graphics;
  private effects!: Phaser.GameObjects.Graphics;
  private hud!: Phaser.GameObjects.Graphics;
  private statusText!: Phaser.GameObjects.Text;
  private p1Label!: Phaser.GameObjects.Text;
  private p2Label!: Phaser.GameObjects.Text;
  private modeButton!: HTMLButtonElement;
  private restartButton!: HTMLButtonElement;

  constructor() {
    super("duel");
  }

  create(): void {
    this.world = this.add.graphics();
    this.actors = this.add.graphics();
    this.effects = this.add.graphics();
    this.hud = this.add.graphics();

    this.keys = this.input.keyboard!.addKeys({
      a: Phaser.Input.Keyboard.KeyCodes.A,
      d: Phaser.Input.Keyboard.KeyCodes.D,
      w: Phaser.Input.Keyboard.KeyCodes.W,
      s: Phaser.Input.Keyboard.KeyCodes.S,
      space: Phaser.Input.Keyboard.KeyCodes.SPACE,
      j: Phaser.Input.Keyboard.KeyCodes.J,
      k: Phaser.Input.Keyboard.KeyCodes.K,
      l: Phaser.Input.Keyboard.KeyCodes.L,
      left: Phaser.Input.Keyboard.KeyCodes.LEFT,
      right: Phaser.Input.Keyboard.KeyCodes.RIGHT,
      up: Phaser.Input.Keyboard.KeyCodes.UP,
      down: Phaser.Input.Keyboard.KeyCodes.DOWN,
      zero: Phaser.Input.Keyboard.KeyCodes.ZERO,
      one: Phaser.Input.Keyboard.KeyCodes.ONE,
      two: Phaser.Input.Keyboard.KeyCodes.TWO,
      three: Phaser.Input.Keyboard.KeyCodes.THREE,
      numZero: Phaser.Input.Keyboard.KeyCodes.NUMPAD_ZERO,
      numOne: Phaser.Input.Keyboard.KeyCodes.NUMPAD_ONE,
      numTwo: Phaser.Input.Keyboard.KeyCodes.NUMPAD_TWO,
      numThree: Phaser.Input.Keyboard.KeyCodes.NUMPAD_THREE,
      r: Phaser.Input.Keyboard.KeyCodes.R,
    }) as Record<string, Phaser.Input.Keyboard.Key>;

    this.statusText = this.add
      .text(WIDTH / 2, HEIGHT - 58, "按任意攻击键开战", {
        fontFamily: "Avenir Next, Helvetica, sans-serif",
        fontSize: "24px",
        fontStyle: "800",
        color: "#ffd36f",
      })
      .setOrigin(0.5);

    this.p1Label = this.add.text(52, 39, "", {
      fontFamily: "Avenir Next, Helvetica, sans-serif",
      fontSize: "16px",
      fontStyle: "800",
      color: "#f6efe2",
    });
    this.p2Label = this.add
      .text(WIDTH - 52, 39, "", {
        fontFamily: "Avenir Next, Helvetica, sans-serif",
        fontSize: "16px",
        fontStyle: "800",
        color: "#f6efe2",
      })
      .setOrigin(1, 0);

    this.modeButton = document.querySelector<HTMLButtonElement>("#modeButton")!;
    this.restartButton = document.querySelector<HTMLButtonElement>("#restartButton")!;
    this.modeButton.addEventListener("click", () => this.toggleMode());
    this.restartButton.addEventListener("click", () => this.resetRound());

    this.resetRound();
  }

  update(_time: number, deltaMs: number): void {
    const dt = Math.min(deltaMs / 1000, 1 / 30);

    if (Phaser.Input.Keyboard.JustDown(this.keys.r)) this.resetRound();
    if (!this.winner) {
      this.readPlayerOneInput();
      if (this.mode === "single") this.updateAi(dt);
      else this.readPlayerTwoInput();
    }

    this.updateFighter(this.p1, this.p2, dt);
    this.updateFighter(this.p2, this.p1, dt);
    this.resolveBodyPush();
    this.resolveAttacks();
    this.updateProjectiles(dt);
    this.updateEffects(dt);
    this.updateSparks(dt);
    this.draw();
  }

  private resetRound(message = "按任意攻击键开战"): void {
    this.p1 = this.makeFighter("p1", 260, "灵刃剑士", {
      main: 0xf3ead7,
      trim: 0xff553e,
      aura: 0xff725d,
      energy: 0xffd36f,
      shadow: 0x332220,
      skin: 0xf2c99f,
      blade: 0xf7f4e9,
    });
    this.p2 = this.makeFighter("p2", 1020, "影狐忍者", {
      main: 0x202b3f,
      trim: 0x47d7ff,
      aura: 0x47d7ff,
      energy: 0x67e889,
      shadow: 0x101520,
      skin: 0xe8c28f,
      blade: 0xbff3ff,
    });
    this.projectiles = [];
    this.afterImages = [];
    this.flashes = [];
    this.sparks = [];
    this.winner = undefined;
    this.statusText.setText(message);
    this.p1Label.setText(this.p1.name);
    this.p2Label.setText(this.p2.name);
  }

  private makeFighter(id: FighterId, x: number, name: string, palette: Palette): Fighter {
    return {
      id,
      name,
      x,
      y: FLOOR,
      vx: 0,
      vy: 0,
      facing: id === "p1" ? 1 : -1,
      health: 100,
      energy: 42,
      grounded: true,
      blocking: false,
      hurtTimer: 0,
      dashTimer: 0,
      cooldowns: { light: 0, heavy: 0, special: 0, dash: 0 },
      combo: 0,
      aiThink: 0,
      aiPlan: "hold",
      palette,
    };
  }

  private toggleMode(): void {
    this.mode = this.mode === "single" ? "versus" : "single";
    this.modeButton.textContent = this.mode === "single" ? "单人模式" : "双人模式";
    this.resetRound(this.mode === "single" ? "单人模式：P2 由 AI 控制" : "双人模式：键盘同屏对战");
  }

  private readPlayerOneInput(): void {
    this.moveFighter(this.p1, this.keys.a.isDown, this.keys.d.isDown, this.keys.s.isDown);
    if (Phaser.Input.Keyboard.JustDown(this.keys.w)) this.jump(this.p1);
    if (Phaser.Input.Keyboard.JustDown(this.keys.space)) this.dash(this.p1);
    if (Phaser.Input.Keyboard.JustDown(this.keys.j)) this.startAttack(this.p1, "light");
    if (Phaser.Input.Keyboard.JustDown(this.keys.k)) this.startAttack(this.p1, "heavy");
    if (Phaser.Input.Keyboard.JustDown(this.keys.l)) this.startAttack(this.p1, "special");
  }

  private readPlayerTwoInput(): void {
    this.moveFighter(this.p2, this.keys.left.isDown, this.keys.right.isDown, this.keys.down.isDown);
    if (Phaser.Input.Keyboard.JustDown(this.keys.up)) this.jump(this.p2);
    if (this.justDown("zero", "numZero")) this.dash(this.p2);
    if (this.justDown("one", "numOne")) this.startAttack(this.p2, "light");
    if (this.justDown("two", "numTwo")) this.startAttack(this.p2, "heavy");
    if (this.justDown("three", "numThree")) this.startAttack(this.p2, "special");
  }

  private justDown(a: string, b: string): boolean {
    return Phaser.Input.Keyboard.JustDown(this.keys[a]) || Phaser.Input.Keyboard.JustDown(this.keys[b]);
  }

  private moveFighter(f: Fighter, left: boolean, right: boolean, block: boolean): void {
    if (block && f.grounded && !f.attack && f.hurtTimer <= 0) {
      f.blocking = true;
      f.vx *= 0.7;
      return;
    }

    f.blocking = false;
    if (f.hurtTimer > 0) return;
    const speed = f.grounded ? 980 : 540;
    if (left) f.vx -= speed * (1 / 60);
    if (right) f.vx += speed * (1 / 60);
    f.vx = Phaser.Math.Clamp(f.vx, -390, 390);
  }

  private updateAi(dt: number): void {
    const ai = this.p2;
    const enemy = this.p1;
    ai.aiThink -= dt;
    const distance = Math.abs(enemy.x - ai.x);
    const dir = Math.sign(enemy.x - ai.x) || ai.facing;

    if (ai.aiThink <= 0) {
      ai.aiThink = 0.18 + Math.random() * 0.28;
      ai.aiPlan = distance > 300 ? "close" : distance < 78 ? "retreat" : "pressure";
    }

    ai.blocking = false;
    if (ai.hurtTimer > 0) return;
    if (enemy.attack && distance < 145 && Math.random() < 0.62) {
      ai.blocking = ai.grounded;
      ai.vx *= 0.74;
      return;
    }

    if (ai.aiPlan === "close") ai.vx += dir * 18;
    if (ai.aiPlan === "retreat") ai.vx -= dir * 16;
    if (distance < 190 && Math.random() < 0.035) this.dash(ai);
    if (distance < 118 && Math.random() < 0.07) this.startAttack(ai, Math.random() < 0.7 ? "light" : "heavy");
    if (distance > 150 && distance < 520 && ai.energy > 28 && Math.random() < 0.035) this.startAttack(ai, "special");
  }

  private jump(f: Fighter): void {
    if (this.winner || !f.grounded || f.hurtTimer > 0) return;
    f.vy = -680;
    f.grounded = false;
  }

  private dash(f: Fighter): void {
    if (this.winner || f.cooldowns.dash > 0 || f.energy < 12 || f.hurtTimer > 0) return;
    f.energy -= 12;
    f.vx = f.facing * 650;
    f.dashTimer = 0.16;
    f.cooldowns.dash = 0.58;
    this.addAfterImage(f, 0.32);
    this.emitSparks(f.x - f.facing * 30, f.y - 28, f.palette.aura, 18, 360);
  }

  private startAttack(f: Fighter, type: AttackType): void {
    if (this.winner || f.hurtTimer > 0 || f.attack || f.cooldowns[type] > 0) return;
    if (type === "special") {
      if (f.energy < 28) return;
      f.energy -= 28;
    }

    const data = {
      light: { total: 0.24, cooldown: 0.28 },
      heavy: { total: 0.42, cooldown: 0.58 },
      special: { total: 0.52, cooldown: 0.82 },
    }[type];

    f.attack = { type, timer: data.total, total: data.total, hitDone: false };
    f.cooldowns[type] = data.cooldown;
    f.vx *= 0.36;

    if (type === "special") {
      this.projectiles.push({
        owner: f.id,
        x: f.x + f.facing * 64,
        y: f.y - 86,
        vx: f.facing * (f.id === "p1" ? 640 : 590),
        radius: f.id === "p1" ? 22 : 18,
        damage: f.id === "p1" ? 15 : 13,
        life: 1.45,
        color: f.palette.aura,
      });
      this.flash(f.x + f.facing * 62, f.y - 86, 46, f.palette.aura, 0.16);
    }
  }

  private updateFighter(f: Fighter, enemy: Fighter, dt: number): void {
    f.facing = enemy.x >= f.x ? 1 : -1;
    f.energy = Phaser.Math.Clamp(f.energy + 4.2 * dt, 0, 100);
    f.hurtTimer = Math.max(0, f.hurtTimer - dt);
    f.dashTimer = Math.max(0, f.dashTimer - dt);
    f.combo = f.attack ? f.combo : Math.max(0, f.combo - dt * 1.1);

    for (const key of Object.keys(f.cooldowns) as Array<AttackType | "dash">) {
      f.cooldowns[key] = Math.max(0, f.cooldowns[key] - dt);
    }

    if (f.attack) {
      f.attack.timer -= dt;
      if (f.attack.timer <= 0) f.attack = undefined;
    }

    if ((Math.abs(f.vx) > 390 || f.dashTimer > 0 || f.attack?.type === "special") && Math.random() < 0.35) {
      this.addAfterImage(f, f.dashTimer > 0 ? 0.28 : 0.16);
    }

    f.vy += GRAVITY * dt;
    f.x += f.vx * dt;
    f.y += f.vy * dt;
    f.vx *= f.grounded ? 0.82 : 0.94;

    if (f.y >= FLOOR) {
      f.y = FLOOR;
      f.vy = 0;
      f.grounded = true;
    }

    f.x = Phaser.Math.Clamp(f.x, 70, WIDTH - 70);
  }

  private resolveBodyPush(): void {
    const dx = this.p2.x - this.p1.x;
    const minDistance = 66;
    if (Math.abs(dx) >= minDistance) return;
    const push = (minDistance - Math.abs(dx)) / 2;
    const dir = dx >= 0 ? 1 : -1;
    this.p1.x -= push * dir;
    this.p2.x += push * dir;
  }

  private resolveAttacks(): void {
    this.resolveMelee(this.p1, this.p2);
    this.resolveMelee(this.p2, this.p1);
  }

  private resolveMelee(attacker: Fighter, target: Fighter): void {
    const attack = attacker.attack;
    if (!attack || attack.hitDone || attack.type === "special") return;
    const progress = 1 - attack.timer / attack.total;
    const active = attack.type === "light" ? progress > 0.32 && progress < 0.62 : progress > 0.36 && progress < 0.68;
    if (!active) return;

    const reach = attack.type === "heavy" ? 132 : 96;
    const dx = (target.x - attacker.x) * attacker.facing;
    const dy = Math.abs((target.y - 82) - (attacker.y - 82));
    if (dx > 12 && dx < reach && dy < 86) {
      attack.hitDone = true;
      this.takeHit(target, attacker, attack.type === "heavy" ? 13 : 7, attack.type === "heavy" ? 460 : 320);
    }
  }

  private takeHit(target: Fighter, attacker: Fighter, damage: number, knockback: number): void {
    if (target.hurtTimer > 0.08) return;
    const blocked = target.blocking && target.facing === -attacker.facing;
    const finalDamage = blocked ? Math.ceil(damage * 0.28) : damage;
    target.health = Phaser.Math.Clamp(target.health - finalDamage, 0, 100);
    target.energy = Phaser.Math.Clamp(target.energy + (blocked ? 8 : 5), 0, 100);
    attacker.energy = Phaser.Math.Clamp(attacker.energy + 9, 0, 100);
    target.hurtTimer = blocked ? 0.16 : 0.28;
    target.vx = attacker.facing * knockback * (blocked ? 0.45 : 1);
    target.vy = blocked ? target.vy : -155;
    attacker.combo = blocked ? attacker.combo : Math.floor(attacker.combo) + 1;

    const color = blocked ? 0xd7dee8 : attacker.palette.aura;
    this.cameras.main.shake(blocked ? 70 : 130, blocked ? 0.003 : 0.008);
    this.flash(target.x, target.y - 82, blocked ? 52 : 90, color, blocked ? 0.14 : 0.22);
    this.emitSparks(target.x, target.y - 82, color, blocked ? 14 : 34, blocked ? 260 : 520);
    this.statusText.setText(blocked ? "格挡成功" : `${Math.max(1, Math.floor(attacker.combo))} 连击`);

    if (target.health <= 0) {
      this.winner = attacker;
      this.statusText.setText(`${attacker.name} 胜利 - 按 R 重新开始`);
      this.cameras.main.flash(220, 255, 238, 205);
    }
  }

  private updateProjectiles(dt: number): void {
    for (const p of this.projectiles) {
      p.x += p.vx * dt;
      p.life -= dt;
      const target = p.owner === "p1" ? this.p2 : this.p1;
      const owner = p.owner === "p1" ? this.p1 : this.p2;
      const distance = Phaser.Math.Distance.Between(p.x, p.y, target.x, target.y - 82);
      if (distance < p.radius + 42) {
        p.life = 0;
        this.takeHit(target, owner, p.damage, 510);
      }
      if (Math.random() < 0.7) this.emitSparks(p.x, p.y, p.color, 1, 80);
    }
    this.projectiles = this.projectiles.filter((p) => p.life > 0 && p.x > -90 && p.x < WIDTH + 90);
  }

  private updateEffects(dt: number): void {
    for (const image of this.afterImages) image.life -= dt;
    this.afterImages = this.afterImages.filter((image) => image.life > 0);
    for (const flash of this.flashes) flash.life -= dt;
    this.flashes = this.flashes.filter((flash) => flash.life > 0);
  }

  private updateSparks(dt: number): void {
    for (const spark of this.sparks) {
      spark.x += spark.vx * dt;
      spark.y += spark.vy * dt;
      spark.vy += 700 * dt;
      spark.vx *= 0.94;
      spark.life -= dt;
    }
    this.sparks = this.sparks.filter((spark) => spark.life > 0);
  }

  private draw(): void {
    this.world.clear();
    this.actors.clear();
    this.effects.clear();
    this.hud.clear();
    this.drawStage();
    this.drawHud();
    this.drawAfterImages();
    this.drawProjectiles();
    this.drawFighter(this.p1);
    this.drawFighter(this.p2);
    this.drawSparks();
    this.drawFlashes();
  }

  private drawStage(): void {
    this.world.fillGradientStyle(0x111a26, 0x111a26, 0x201823, 0x0c0d10, 1);
    this.world.fillRect(0, 0, WIDTH, HEIGHT);
    this.world.fillStyle(0xffd36f, 0.11);
    this.world.fillCircle(676, 156, 124);
    this.world.fillStyle(0xffd36f, 0.055);
    this.world.fillCircle(676, 156, 178);

    this.drawCityLayer(0.24, 86, 0x121721);
    this.drawCityLayer(0.44, 132, 0x17131b);
    this.drawTorii(148, FLOOR - 76, 0x33201a);
    this.drawTorii(1086, FLOOR - 76, 0x172637);

    for (let i = 0; i < 54; i += 1) {
      const x = (i * 89 + 30) % WIDTH;
      const y = 70 + ((i * 47) % 320);
      this.world.fillStyle(i % 2 ? 0xff6a45 : 0x47d7ff, 0.35);
      this.world.fillRect(x, y, 2, 22 + (i % 5) * 13);
    }

    this.world.fillStyle(0x171513);
    this.world.fillRect(0, FLOOR, WIDTH, HEIGHT - FLOOR);
    this.world.fillStyle(0x3e362d);
    this.world.fillRect(0, FLOOR, WIDTH, 8);
    this.world.fillStyle(0x6c5440);
    this.world.fillRect(0, FLOOR - 7, WIDTH, 3);

    for (let i = 0; i < 11; i += 1) {
      this.world.fillStyle(i % 2 ? 0x25221d : 0x302a22);
      this.world.fillRect(i * 148 - 36, FLOOR + 18 + (i % 3) * 8, 118, 7);
    }

    this.world.lineStyle(1, 0xffffff, 0.08);
    for (let i = 0; i < 18; i += 1) {
      this.world.beginPath();
      this.world.moveTo(i * 82 - 20, FLOOR + 2);
      this.world.lineTo(i * 82 - 86, HEIGHT);
      this.world.strokePath();
    }
  }

  private drawCityLayer(alpha: number, baseY: number, color: number): void {
    this.world.fillStyle(color, alpha);
    for (let i = 0; i < 14; i += 1) {
      const w = 56 + (i % 4) * 20;
      const h = 110 + ((i * 31) % 110);
      const x = i * 102 - 42;
      this.world.fillRect(x, baseY + 280 - h, w, h);
      this.world.fillStyle(i % 2 ? 0xff6a45 : 0x47d7ff, alpha * 1.2);
      this.world.fillRect(x + 10, baseY + 296 - h, w - 20, 5);
      this.world.fillStyle(color, alpha);
    }
  }

  private drawTorii(x: number, y: number, color: number): void {
    this.world.fillStyle(color, 1);
    this.world.fillRect(x - 96, y - 12, 192, 14);
    this.world.fillRect(x - 78, y + 4, 156, 10);
    this.world.fillRect(x - 62, y + 14, 14, 92);
    this.world.fillRect(x + 48, y + 14, 14, 92);
    this.world.fillStyle(0xffffff, 0.09);
    this.world.fillRect(x - 92, y - 10, 184, 3);
  }

  private drawHud(): void {
    this.drawMeter(42, 34, 460, this.p1.health, 0xff553e, false);
    this.drawMeter(WIDTH - 502, 34, 460, this.p2.health, 0x47d7ff, true);
    this.drawEnergy(42, 82, 310, this.p1.energy, 0xffd36f, false);
    this.drawEnergy(WIDTH - 352, 82, 310, this.p2.energy, 0x67e889, true);
  }

  private drawMeter(x: number, y: number, width: number, value: number, color: number, right: boolean): void {
    this.hud.fillStyle(0x000000, 0.48);
    this.hud.fillRect(x, y, width, 28);
    this.hud.lineStyle(2, 0x655d4d, 1);
    this.hud.strokeRect(x, y, width, 28);
    const fill = (width - 6) * (value / 100);
    this.hud.fillStyle(color, 1);
    this.hud.fillRect(right ? x + width - 3 - fill : x + 3, y + 3, fill, 22);
  }

  private drawEnergy(x: number, y: number, width: number, value: number, color: number, right: boolean): void {
    this.hud.fillStyle(0x000000, 0.38);
    this.hud.fillRect(x, y, width, 10);
    const fill = width * (value / 100);
    this.hud.fillStyle(color, 1);
    this.hud.fillRect(right ? x + width - fill : x, y, fill, 10);
  }

  private drawFighter(f: Fighter): void {
    const g = this.actors;
    const c = f.palette;
    const bob = Math.sin(this.time.now / 130 + f.x) * (f.grounded ? 2 : 0);
    const x = f.x;
    const y = f.y + bob;
    const flip = f.facing;

    g.fillStyle(0x000000, 0.34);
    g.fillEllipse(x, y + 7, 116, 24);

    if (f.blocking) {
      g.fillStyle(c.aura, 0.16);
      g.fillEllipse(x + flip * 32, y - 76, 56, 188);
      g.lineStyle(4, c.aura, 0.72);
      g.strokeEllipse(x + flip * 35, y - 76, 50, 172);
    }

    if (f.dashTimer > 0 || f.attack?.type === "special") {
      g.fillStyle(c.aura, 0.22);
      g.fillEllipse(x - flip * 22, y - 74, 110, 174);
    }

    for (let i = 0; i < 3; i += 1) {
      g.lineStyle(2, c.aura, 0.16);
      g.strokeEllipse(x, y - 74, 68 + i * 20, 152 + i * 14);
    }

    if (f.id === "p1") this.drawSoulWarrior(f, x, y, flip);
    else this.drawShadowNinja(f, x, y, flip);
    this.drawWeapon(f, x, y, flip);
    if (f.attack && f.attack.type !== "special") this.drawAttackArc(f, x, y, flip);

    if (f.hurtTimer > 0) {
      g.fillStyle(0xffffff, 0.34);
      g.fillEllipse(x, y - 78, 76, 176);
    }
  }

  private drawSoulWarrior(f: Fighter, x: number, y: number, flip: 1 | -1): void {
    const g = this.actors;
    const c = f.palette;
    g.fillStyle(c.shadow);
    g.fillTriangle(x - flip * 30, y - 116, x + flip * 24, y - 120, x + flip * 36, y - 8);
    g.fillTriangle(x - flip * 30, y - 116, x + flip * 36, y - 8, x - flip * 42, y - 70);
    g.fillStyle(c.main);
    g.fillTriangle(x - flip * 18, y - 118, x + flip * 18, y - 118, x + flip * 24, y - 22);
    g.fillTriangle(x - flip * 18, y - 118, x + flip * 24, y - 22, x - flip * 24, y - 22);
    g.fillStyle(c.trim);
    g.fillRect(flip > 0 ? x + 5 : x - 14, y - 112, 9, 92);
    g.fillRect(x - 23, y - 66, 46, 8);
    g.fillStyle(c.skin);
    g.fillCircle(x, y - 137, 19);
    g.fillStyle(0x3a1d1a);
    g.fillTriangle(x - flip * 24, y - 148, x, y - 164, x + flip * 28, y - 149);
    g.fillTriangle(x - flip * 22, y - 133, x + flip * 28, y - 149, x + flip * 12, y - 132);
    this.drawLimb(x - flip * 13, y - 82, x - flip * 43, y - 38, c.trim, 9);
    this.drawLimb(x + flip * 14, y - 82, x + flip * 39, y - 52, c.trim, 9);
    this.drawLimb(x - flip * 11, y - 24, x - flip * 26, y, c.main, 10);
    this.drawLimb(x + flip * 14, y - 24, x + flip * 27, y, c.main, 10);
  }

  private drawShadowNinja(f: Fighter, x: number, y: number, flip: 1 | -1): void {
    const g = this.actors;
    const c = f.palette;
    g.fillStyle(c.shadow);
    g.fillTriangle(x - flip * 28, y - 118, x + flip * 22, y - 116, x + flip * 32, y - 14);
    g.fillTriangle(x - flip * 28, y - 118, x + flip * 32, y - 14, x - flip * 26, y - 16);
    g.fillStyle(c.main);
    g.fillTriangle(x - flip * 17, y - 116, x + flip * 16, y - 116, x + flip * 18, y - 22);
    g.fillTriangle(x - flip * 17, y - 116, x + flip * 18, y - 22, x - flip * 18, y - 22);
    g.fillStyle(c.trim);
    g.fillRect(flip > 0 ? x - 6 : x - 3, y - 113, 9, 92);
    g.fillRect(x - 25, y - 88, 50, 7);
    g.fillRect(x - 18, y - 51, 36, 5);
    g.fillStyle(c.skin);
    g.fillCircle(x, y - 136, 18);
    g.fillStyle(0x10182a);
    g.fillRect(x - 23, y - 151, 46, 17);
    g.fillStyle(c.trim);
    g.fillRect(x - 20, y - 139, 40, 5);
    this.drawLimb(x - flip * 12, y - 84, x - flip * 38, y - 45, c.trim, 8);
    this.drawLimb(x + flip * 12, y - 84, x + flip * 42, y - 52, c.trim, 8);
    this.drawLimb(x - flip * 10, y - 24, x - flip * 25, y + 1, c.main, 10);
    this.drawLimb(x + flip * 12, y - 24, x + flip * 27, y + 1, c.main, 10);
  }

  private drawLimb(x1: number, y1: number, x2: number, y2: number, color: number, width: number): void {
    this.actors.lineStyle(width, color, 1);
    this.actors.lineBetween(x1, y1, x2, y2);
  }

  private drawWeapon(f: Fighter, x: number, y: number, flip: 1 | -1): void {
    const g = this.actors;
    const active = !!f.attack && f.attack.type !== "special";
    if (f.id === "p1") {
      g.lineStyle(9, 0x47352c, 1);
      g.lineBetween(x + flip * 30, y - 54, x + flip * 68, y - 70);
      g.lineStyle(active ? 8 : 5, active ? f.palette.aura : f.palette.blade, 1);
      g.lineBetween(x + flip * 58, y - 70, x + flip * (active ? 154 : 130), y + (active ? -104 : -90));
      g.lineStyle(2, 0xffffff, 1);
      g.lineBetween(x + flip * 62, y - 73, x + flip * (active ? 150 : 126), y + (active ? -106 : -92));
    } else {
      g.fillStyle(f.palette.blade, 1);
      g.fillTriangle(x + flip * 42, y - 60, x + flip * (active ? 104 : 82), y - 75, x + flip * (active ? 74 : 55), y - 42);
      g.fillStyle(f.palette.trim, 1);
      g.fillCircle(x + flip * 42, y - 58, 10);
    }
  }

  private drawAttackArc(f: Fighter, x: number, y: number, flip: 1 | -1): void {
    const attack = f.attack;
    if (!attack) return;
    const progress = 1 - attack.timer / attack.total;
    const radius = (attack.type === "heavy" ? 118 : 90) + progress * 18;
    this.effects.lineStyle(attack.type === "heavy" ? 18 : 12, f.palette.aura, 0.72);
    this.effects.beginPath();
    this.effects.arc(x + flip * 42, y - 80, radius, flip > 0 ? -0.8 : Math.PI - 0.58, flip > 0 ? 0.58 : Math.PI + 0.8, flip < 0);
    this.effects.strokePath();
    this.effects.lineStyle(3, 0xffffff, 0.95);
    this.effects.beginPath();
    this.effects.arc(x + flip * 42, y - 80, radius - 8, flip > 0 ? -0.62 : Math.PI - 0.35, flip > 0 ? 0.35 : Math.PI + 0.62, flip < 0);
    this.effects.strokePath();
  }

  private drawAfterImages(): void {
    for (const image of this.afterImages) {
      const alpha = (image.life / image.maxLife) * 0.32;
      this.effects.fillStyle(image.color, alpha);
      this.effects.fillEllipse(image.x, image.y - 82, 68, 152);
      this.effects.fillStyle(0xffffff, alpha * 0.85);
      this.effects.fillRect(image.x - 12, image.y - 132, 24, 80);
    }
  }

  private drawProjectiles(): void {
    for (const p of this.projectiles) {
      const tailX = p.x - Math.sign(p.vx) * 20;
      this.effects.fillStyle(p.color, 0.34);
      this.effects.fillEllipse(tailX, p.y, p.radius * 7.6, p.radius * 3.1);
      this.effects.fillStyle(p.color, 0.82);
      this.effects.fillCircle(p.x, p.y, p.radius);
      this.effects.fillStyle(0xffffff, 1);
      this.effects.fillCircle(p.x, p.y, p.radius * 0.38);
      this.effects.lineStyle(3, p.color, 1);
      this.effects.strokeCircle(p.x, p.y, p.radius * 0.92);
    }
  }

  private drawSparks(): void {
    for (const spark of this.sparks) {
      const alpha = Phaser.Math.Clamp(spark.life / spark.maxLife, 0, 1);
      this.effects.fillStyle(spark.color, alpha);
      this.effects.fillRect(spark.x, spark.y, spark.size, Math.max(2, spark.size * 0.35));
    }
  }

  private drawFlashes(): void {
    for (const flash of this.flashes) {
      const t = flash.life / flash.maxLife;
      this.effects.lineStyle(5 + (1 - t) * 14, flash.color, t);
      this.effects.strokeCircle(flash.x, flash.y, flash.radius * (1 - t * 0.34));
      this.effects.fillStyle(0xffffff, t);
      for (let i = 0; i < 6; i += 1) {
        const angle = (Math.PI * 2 * i) / 6;
        this.effects.fillRect(flash.x + Math.cos(angle) * flash.radius * 0.32, flash.y + Math.sin(angle) * flash.radius * 0.32, 18 * t, 3);
      }
    }
  }

  private addAfterImage(f: Fighter, alpha: number): void {
    const life = 0.18;
    this.afterImages.push({
      x: f.x,
      y: f.y,
      color: f.palette.aura,
      life,
      maxLife: life / Math.max(alpha, 0.01),
    });
  }

  private flash(x: number, y: number, radius: number, color: number, life: number): void {
    this.flashes.push({ x, y, radius, color, life, maxLife: life });
  }

  private emitSparks(x: number, y: number, color: number, quantity: number, speed: number): void {
    for (let i = 0; i < quantity; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const velocity = speed * (0.2 + Math.random() * 0.8);
      this.sparks.push({
        x,
        y,
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity - speed * 0.16,
        color,
        life: 0.22 + Math.random() * 0.24,
        maxLife: 0.46,
        size: 2 + Math.random() * 6,
      });
    }
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  width: WIDTH,
  height: HEIGHT,
  backgroundColor: "#0c0d10",
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: DuelScene,
});
