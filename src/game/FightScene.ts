// "Escape Polyphemus" — the one trial. Greek black-figure vase art, all drawn in code.
import Phaser from "phaser";
import { bus, inputState, keyState, story as storyChoice, type GameEvent, type PlayerName } from "@/lib/bus";
import { EFFECT_STYLE, type AbilityConfig, type Effect } from "@/lib/abilities";
import { sfx } from "@/lib/sfx";

export const W = 960, H = 540;
const C = { clay: 0xd2733a, clayDark: 0x9e4a1c, clayLight: 0xec9d5f, black: 0x16100c, cream: 0xf4e4c6, red: 0xb3321f, day: 0xf7e7b4 };
const LANES = [290, 480, 670];
const GROUND = 468;
const BOSS_X = 480, BOSS_Y = 300;
const BOSS_MAX = 100, PLAYER_MAX = 100;
const BLAST_DMG = 7;
/** The display font loaded by next/font (hashed family name), read from the CSS variable. */
const FONT = () => {
  const v = typeof document !== "undefined" ? getComputedStyle(document.documentElement).getPropertyValue("--font-display").trim() : "";
  return v ? `${v}, Georgia, serif` : "Georgia, serif";
};

type Attack = { kind: "boulder" | "slam"; impactAt: number; lanes: number[]; objs: Phaser.GameObjects.GameObject[] };

export class FightScene extends Phaser.Scene {
  private t = 0;
  private bossHp = BOSS_MAX;
  private playerHp = PLAYER_MAX;
  private score = 0;
  private phase: 1 | 2 = 1;
  private story = true; // attacks paused while a story beat plays
  private ended = false;
  private nobodyDone = false;
  /** What the player told Polyphemus. "odysseus" (the truth) means the brothers answer his call. */
  private name: PlayerName = "nobody";
  private reinforced = false;
  private stunnedUntil = 0;
  private nextAttackAt = 0;
  private attack: Attack | null = null;
  private lastKinds: string[] = [];
  private lane = 1;
  private lastShieldAt = -1e9;
  private lastBlastAt = -1e9;
  private boss!: Phaser.GameObjects.Container;
  private club!: Phaser.GameObjects.Graphics;
  private rock!: Phaser.GameObjects.Graphics;
  private iris!: Phaser.GameObjects.Graphics;
  private eyeGlow!: Phaser.GameObjects.Graphics;
  private stunFx!: Phaser.GameObjects.Container;
  private player!: Phaser.GameObjects.Container;
  private aegis!: Phaser.GameObjects.Graphics;
  private hud!: Phaser.GameObjects.Graphics;
  private scoreText!: Phaser.GameObjects.Text;
  private prompt!: Phaser.GameObjects.Text;
  private dialog!: Phaser.GameObjects.Container;
  private dialogWho!: Phaser.GameObjects.Text;
  private dialogText!: Phaser.GameObjects.Text;
  private dialogTimer?: Phaser.Time.TimerEvent;
  private cyclopes!: Phaser.GameObjects.Container;
  private banner!: Phaser.GameObjects.Text;
  private off?: () => void;

  constructor() { super("fight"); }

  create() {
    this.makeTextures();
    this.drawCave();
    this.cyclopes = this.drawCyclopesAtDoor();
    this.boss = this.drawBoss();
    this.player = this.drawPlayer();
    this.hud = this.add.graphics().setDepth(50);
    const font = { fontFamily: FONT() };
    this.add.text(W / 2, 56, "POLYPHEMUS · SON OF POSEIDON", { ...font, fontSize: "13px", color: "#16100c", fontStyle: "bold" }).setOrigin(0.5, 0).setDepth(51);
    this.add.text(24, H - 64, storyChoice.name === "nobody" ? "NOBODY" : "ODYSSEUS", { ...font, fontSize: "13px", color: "#f4e4c6", fontStyle: "bold" }).setDepth(51);
    this.scoreText = this.add.text(W - 24, 30, "", { ...font, fontSize: "18px", color: "#f4e4c6", fontStyle: "bold", stroke: "#16100c", strokeThickness: 5 }).setOrigin(1, 0).setDepth(51);
    this.prompt = this.add.text(W / 2, 392, "", { ...font, fontSize: "34px", color: "#f4e4c6", fontStyle: "bold", stroke: "#16100c", strokeThickness: 6 }).setOrigin(0.5).setDepth(60);
    this.banner = this.add.text(W / 2, 200, "", { ...font, fontSize: "22px", color: "#f4e4c6", fontStyle: "bold", stroke: "#16100c", strokeThickness: 5, align: "center" }).setOrigin(0.5).setDepth(61).setAlpha(0);
    this.makeDialog();
    this.drawHud();

    this.off = bus.on((e) => this.onBus(e));
    this.events.once("shutdown", () => this.off?.());
    this.events.once("destroy", () => this.off?.());

    // Opening beat, straight from Book 9.
    this.name = storyChoice.name;
    this.say("POLYPHEMUS", this.name === "nobody"
      ? "NOBODY, you say? Then here is my gift for your wine: I will eat Nobody LAST!"
      : "ODYSSEUS, son of Laertes? A proud name. My gift for your wine: I will eat Odysseus LAST!", 3600);
    sfx.roar();
    this.time.delayedCall(3800, () => {
      this.story = false;
      this.nextAttackAt = this.t + 600;
      this.flashPrompt("FIGHT!", 900);
    });
  }

  // ---------------- input ----------------
  private onBus(e: GameEvent) {
    if (e.type === "pause") { if (e.paused) this.scene.pause(); else this.scene.resume(); return; }
    if (!this.scene.isActive() || this.ended) return;
    if (e.type === "blast") this.playerBlast();
    if (e.type === "power") this.castPower(e.config);
  }

  update(_time: number, delta: number) {
    this.t += delta;
    const shield = inputState.shield || keyState.shield;
    const lean = keyState.lean !== 0 ? keyState.lean : inputState.lean;
    if (shield) this.lastShieldAt = this.t;
    this.aegis.setVisible(shield && !this.ended);

    const lane = this.ended ? this.lane : lean + 1;
    if (lane !== this.lane) {
      this.lane = lane;
      this.tweens.add({ targets: this.player, x: LANES[lane], duration: 130, ease: "Quad.out" });
    }
    // The single eye follows Odysseus.
    if (this.iris.visible) this.iris.x = Phaser.Math.Clamp((this.player.x - BOSS_X) / 22, -9, 9);
    this.stunFx.setVisible(this.t < this.stunnedUntil && !this.ended);
    if (this.stunFx.visible) this.stunFx.rotation += delta * 0.004;

    if (this.ended) return;
    if (this.attack && this.t >= this.attack.impactAt) this.resolveAttack();
    if (!this.attack && !this.story && this.t >= this.nextAttackAt && this.t >= this.stunnedUntil) this.startAttack();
  }

  // ---------------- boss attacks ----------------
  private startAttack() {
    let kind: Attack["kind"] = Math.random() < 0.5 ? "boulder" : "slam";
    if (this.lastKinds.length >= 2 && this.lastKinds.every((k) => k === kind)) kind = kind === "boulder" ? "slam" : "boulder";
    this.lastKinds = [...this.lastKinds.slice(-1), kind];
    const tele = this.phase === 1 ? 1500 : 1150;
    const objs: Phaser.GameObjects.GameObject[] = [];
    const lane = this.lane;
    // With his brothers at the door, a second boulder lands in another lane: only one lane is safe.
    const lanes = [lane];
    if (this.reinforced) lanes.push(Phaser.Utils.Array.GetRandom([0, 1, 2].filter((l) => l !== lane)));
    sfx.warn();
    if (kind === "boulder") {
      const ring = this.add.graphics().setDepth(5);
      for (const l of lanes) {
        ring.lineStyle(4, C.red, 1).strokeEllipse(LANES[l], GROUND + 18, 150, 34);
        ring.fillStyle(C.red, 0.25).fillEllipse(LANES[l], GROUND + 18, 150, 34);
      }
      this.tweens.add({ targets: ring, alpha: 0.35, yoyo: true, repeat: -1, duration: 160 });
      objs.push(ring);
      this.rock.setVisible(true);
      this.tweens.add({ targets: this.rock, y: -250, duration: 400, ease: "Back.out" });
      const safe = [0, 1, 2].find((l) => !lanes.includes(l))!;
      this.flashPrompt(lanes.length > 1 ? (safe === 1 ? "SIT UPRIGHT — CENTER IS SAFE!" : safe === 0 ? "LEAN LEFT!" : "LEAN RIGHT!") : lane === 1 ? "LEAN LEFT OR RIGHT!" : "LEAN AWAY!", tele);
    } else {
      this.tweens.add({ targets: this.club, angle: -150, duration: tele * 0.8, ease: "Quad.out" });
      const floor = this.add.rectangle(W / 2, GROUND + 20, W, 70, C.red, 0.28).setDepth(4);
      this.tweens.add({ targets: floor, alpha: 0.08, yoyo: true, repeat: -1, duration: 170 });
      objs.push(floor);
      this.flashPrompt("HANDS UP — SHIELD!", tele);
    }
    this.attack = { kind, impactAt: this.t + tele, lanes, objs };
  }

  private cancelAttack() {
    if (!this.attack) return;
    this.attack.objs.forEach((o) => o.destroy());
    this.attack = null;
    this.rock.setVisible(false).setY(-120);
    this.tweens.add({ targets: this.club, angle: 0, duration: 250 });
    this.prompt.setText("");
  }

  private resolveAttack() {
    const a = this.attack!;
    a.objs.forEach((o) => o.destroy());
    this.attack = null;
    this.prompt.setText("");
    if (a.kind === "boulder") {
      this.rock.setVisible(false).setY(-120);
      const hit = a.lanes.includes(this.lane);
      a.lanes.forEach((l, k) => {
        const target = LANES[l];
        // first boulder from Polyphemus, second thrown by a brother at the cave mouth
        const boulder = this.add.image(k === 0 ? BOSS_X + 130 : 160, k === 0 ? BOSS_Y - 250 : 260, "boulder").setDepth(30);
        this.tweens.add({
          targets: boulder, x: target, y: GROUND - 10, angle: 360, duration: 320, ease: "Quad.in",
          onComplete: () => {
            this.tweens.add({ targets: boulder, alpha: 0, x: target + 40, duration: 500, onComplete: () => boulder.destroy() });
            if (k !== 0) return;
            this.cameras.main.shake(160, 0.008);
            if (hit) this.hurtPlayer(18, "CRUSHED!");
            else { sfx.dodge(); this.addScore(100); this.popText(this.player.x, GROUND - 90, "DODGED +100", "#f4e4c6"); }
          },
        });
      });
    } else {
      this.tweens.add({
        targets: this.club, angle: 25, duration: 140, ease: "Quad.in",
        onComplete: () => {
          this.cameras.main.shake(220, 0.012);
          this.tweens.add({ targets: this.club, angle: 0, duration: 400, delay: 200 });
          if (this.t - this.lastShieldAt < 250) {
            sfx.block(); this.addScore(150);
            this.popText(this.player.x, GROUND - 110, "BLOCKED +150", "#f4e4c6");
            this.tweens.add({ targets: this.aegis, scale: 1.25, yoyo: true, duration: 90 });
          } else this.hurtPlayer(22, "SMASHED!");
        },
      });
    }
    this.nextAttackAt = this.t + (this.phase === 1 ? 1300 : 900) + Math.random() * 600;
  }

  private hurtPlayer(dmg: number, label: string) {
    if (this.ended) return;
    this.playerHp = Math.max(0, this.playerHp - dmg);
    sfx.hurt();
    this.cameras.main.flash(120, 179, 50, 31);
    this.popText(this.player.x, GROUND - 100, `${label} -${dmg}`, "#ffd2c4");
    this.tweens.add({ targets: this.player, alpha: 0.3, yoyo: true, repeat: 2, duration: 70 });
    this.drawHud();
    if (this.playerHp <= 0) this.lose();
  }

  // ---------------- player actions ----------------
  private playerBlast() {
    if (this.story || this.t - this.lastBlastAt < 450) return;
    this.lastBlastAt = this.t;
    sfx.blast();
    const bolt = this.add.image(this.player.x, GROUND - 70, "orb").setDepth(30).setTint(C.cream).setScale(0.8);
    this.tweens.add({
      targets: bolt, x: BOSS_X, y: BOSS_Y - 150, scale: 1.4, duration: 260, ease: "Quad.in",
      onComplete: () => { bolt.destroy(); this.damageBoss(BLAST_DMG, C.cream); },
    });
  }

  private castPower(cfg: AbilityConfig) {
    if (this.story) return;
    sfx.power();
    const style = EFFECT_STYLE[cfg.effect];
    this.showBanner(`${cfg.name.toUpperCase()}!\n${cfg.flavor}`, 1800, style.css);
    this.playEffect(cfg.effect, style.color);
    this.time.delayedCall(380, () => {
      if (cfg.damage > 0) this.damageBoss(cfg.damage, style.color);
      if (cfg.heal > 0) {
        this.playerHp = Math.min(PLAYER_MAX, this.playerHp + cfg.heal);
        this.popText(this.player.x, GROUND - 120, `+${cfg.heal} HP`, "#c9f7c0");
        this.drawHud();
      }
      if (cfg.stunSeconds > 0 && !this.ended) {
        this.stunnedUntil = Math.max(this.stunnedUntil, this.t + cfg.stunSeconds * 1000);
        this.cancelAttack();
        this.nextAttackAt = Math.max(this.nextAttackAt, this.stunnedUntil + 400);
        this.popText(BOSS_X, BOSS_Y - 230, `STUNNED ${cfg.stunSeconds}s`, style.css);
        this.addScore(Math.round(cfg.stunSeconds * 50));
      }
    });
  }

  private damageBoss(dmg: number, color: number) {
    if (this.ended || this.story) return;
    this.bossHp = Math.max(0, this.bossHp - dmg);
    this.addScore(dmg * 10);
    sfx.hitBoss();
    const burst = this.add.particles(BOSS_X, BOSS_Y - 150, "spark", {
      speed: { min: 80, max: 260 }, lifespan: 500, scale: { start: 0.9, end: 0 }, tint: color, quantity: 18, emitting: false,
    }).setDepth(40);
    burst.explode(18);
    this.time.delayedCall(700, () => burst.destroy());
    this.tweens.add({ targets: this.boss, x: BOSS_X + 8, yoyo: true, repeat: 1, duration: 45 });
    this.popText(BOSS_X + Phaser.Math.Between(-60, 60), BOSS_Y - 210, `-${dmg}`, "#16100c");
    this.drawHud();
    if (this.bossHp <= 0) this.win();
    else if (!this.nobodyDone && this.bossHp <= BOSS_MAX / 2) this.nobodyBeat();
  }

  // ---------------- story: "Nobody is hurting me!" ----------------
  private nobodyBeat() {
    if (this.name === "odysseus") { this.truthBeat(); return; }
    this.nobodyDone = true;
    this.story = true;
    this.cancelAttack();
    this.stunnedUntil = 0;
    bus.emit({ type: "story", beat: "nobody" });
    sfx.roar();
    this.cameras.main.shake(500, 0.01);
    this.say("POLYPHEMUS", "CYCLOPES! BROTHERS! HELP ME! NOBODY IS HURTING ME!", 2600);
    this.time.delayedCall(1600, () => {
      this.showBanner("⚠ REINFORCEMENTS: 3 CYCLOPES AT THE CAVE MOUTH", 1800, "#ffd2c4");
      this.cyclopes.setVisible(true).setAlpha(0);
      this.tweens.add({ targets: this.cyclopes, alpha: 1, y: 0, duration: 500 });
    });
    this.time.delayedCall(2800, () => {
      sfx.laugh();
      this.say("THE OTHER CYCLOPES", "If NOBODY is hurting you, it's a sickness from Zeus. Pray to your father Poseidon!", 2700);
    });
    this.time.delayedCall(5600, () => {
      this.tweens.add({ targets: this.cyclopes, alpha: 0, y: 30, duration: 600, onComplete: () => this.cyclopes.setVisible(false) });
      this.showBanner("REINFORCEMENTS CANCELLED\nNo one comes for Nobody.  TRICKSTER +500", 2200, "#f4e4c6");
      this.addScore(500);
    });
    this.time.delayedCall(7600, () => {
      this.say("POLYPHEMUS", "Then I will crush you myself, NOBODY!", 1800);
      this.phase = 2;
      this.eyeGlow.setVisible(true);
      this.tweens.add({ targets: this.eyeGlow, alpha: 0.3, yoyo: true, repeat: -1, duration: 400 });
      this.story = false;
      this.nextAttackAt = this.t + 1200;
    });
  }

  /** The road Homer's hero did not take: he told the truth, so the brothers come. */
  private truthBeat() {
    this.nobodyDone = true;
    this.story = true;
    this.cancelAttack();
    this.stunnedUntil = 0;
    bus.emit({ type: "story", beat: "nobody" });
    sfx.roar();
    this.cameras.main.shake(500, 0.01);
    this.say("POLYPHEMUS", "CYCLOPES! BROTHERS! ODYSSEUS, SON OF LAERTES, IS HURTING ME!", 2600);
    this.time.delayedCall(1600, () => {
      this.showBanner("⚠ REINFORCEMENTS: 3 CYCLOPES AT THE CAVE MOUTH", 1800, "#ffd2c4");
      this.cyclopes.setVisible(true).setAlpha(0);
      this.tweens.add({ targets: this.cyclopes, alpha: 1, y: 0, duration: 500 });
    });
    this.time.delayedCall(2800, () => {
      sfx.roar();
      this.say("THE OTHER CYCLOPES", "ODYSSEUS? We know that name now. Hold on, brother. We throw with you!", 2700);
    });
    this.time.delayedCall(5600, () => {
      this.showBanner("REINFORCEMENTS ARRIVE\nYou told the truth. Two boulders per throw now.", 2200, "#ffd2c4");
    });
    this.time.delayedCall(7600, () => {
      this.say("POLYPHEMUS", "Crush him, brothers! Crush ODYSSEUS!", 1800);
      this.phase = 2;
      this.reinforced = true;
      this.eyeGlow.setVisible(true);
      this.tweens.add({ targets: this.eyeGlow, alpha: 0.3, yoyo: true, repeat: -1, duration: 400 });
      this.story = false;
      this.nextAttackAt = this.t + 1200;
    });
  }

  private win() {
    this.ended = true;
    this.cancelAttack();
    this.stunFx.setVisible(false);
    const stake = this.add.image(this.player.x, GROUND - 60, "stake").setDepth(45).setOrigin(0.5, 0.1);
    stake.setRotation(Phaser.Math.Angle.Between(this.player.x, GROUND - 60, BOSS_X, BOSS_Y - 150) + Math.PI / 2);
    this.showBanner("THE OLIVE STAKE!", 1400, "#f4e4c6");
    this.tweens.add({
      targets: stake, x: BOSS_X, y: BOSS_Y - 150, duration: 450, ease: "Quad.in", delay: 300,
      onComplete: () => {
        sfx.roar();
        this.cameras.main.flash(250, 255, 240, 200);
        this.cameras.main.shake(600, 0.015);
        this.iris.setVisible(false);
        this.eyeGlow.setVisible(false);
        const scar = this.add.graphics().setDepth(46);
        scar.fillStyle(C.black, 1).fillEllipse(BOSS_X, BOSS_Y - 150, 46, 30);
        scar.lineStyle(3, C.red, 1).lineBetween(BOSS_X - 22, BOSS_Y - 160, BOSS_X + 22, BOSS_Y - 140).lineBetween(BOSS_X + 22, BOSS_Y - 160, BOSS_X - 22, BOSS_Y - 140);
        stake.destroy();
        this.say("POLYPHEMUS", this.name === "nobody" ? "AAARGH! NOBODY HAS BLINDED ME!" : "AAARGH! ODYSSEUS HAS BLINDED ME! Father Poseidon, curse him!", 2600);
        this.tweens.add({ targets: this.boss, angle: -6, yoyo: true, repeat: 3, duration: 220 });
        const bonus = Math.max(0, Math.round(3000 - this.t / 1000 * 20)) + this.playerHp * 10;
        this.addScore(bonus);
        sfx.victory();
        this.time.delayedCall(2900, () => bus.emit({ type: "over", result: { won: true, score: this.score, timeMs: this.t, name: this.name } }));
      },
    });
  }

  private lose() {
    this.ended = true;
    this.cancelAttack();
    sfx.defeat();
    this.say("POLYPHEMUS", this.name === "nobody" ? "Ha! NOBODY is nothing now. Nobody will mourn you." : "Ha! My brothers and I thank you for your name, ODYSSEUS.", 2400);
    this.tweens.add({ targets: this.player, angle: 90, y: GROUND + 10, alpha: 0.6, duration: 600 });
    this.time.delayedCall(2500, () => bus.emit({ type: "over", result: { won: false, score: this.score, timeMs: this.t, name: this.name } }));
  }

  // ---------------- effects ----------------
  private playEffect(effect: Effect, color: number) {
    const bx = BOSS_X, by = BOSS_Y - 120;
    const g = this.add.graphics().setDepth(42);
    const fade = (obj: Phaser.GameObjects.GameObject, ms = 700) =>
      this.tweens.add({ targets: obj, alpha: 0, duration: ms, delay: 250, onComplete: () => obj.destroy() });
    switch (effect) {
      case "lightning": {
        this.cameras.main.flash(180, 255, 250, 200);
        for (let k = 0; k < 3; k++) {
          g.lineStyle(6 - k * 1.5, k === 0 ? 0xffffff : color, 1);
          g.beginPath();
          let x = bx + Phaser.Math.Between(-140, 140), y = 0;
          g.moveTo(x, y);
          while (y < by) { y += 28; x += Phaser.Math.Between(-24, 24) + (bx - x) * 0.18; g.lineTo(x, y); }
          g.strokePath();
        }
        this.tweens.add({ targets: g, alpha: 0.2, yoyo: true, repeat: 2, duration: 60 });
        fade(g, 500);
        break;
      }
      case "fire": case "light": {
        const orb = this.add.image(this.player.x, GROUND - 70, "orb").setTint(color).setDepth(42).setScale(1.2);
        this.tweens.add({ targets: orb, x: bx, y: by, scale: 3.4, duration: 380, ease: "Quad.in", onComplete: () => fade(orb, 300) });
        if (effect === "light") this.cameras.main.flash(300, 255, 250, 230);
        g.destroy();
        break;
      }
      case "ice": {
        for (let k = 0; k < 9; k++) {
          const a = (k / 9) * Math.PI * 2, r = 110;
          g.fillStyle(color, 0.9).fillTriangle(bx + Math.cos(a) * r, by + Math.sin(a) * r, bx + Math.cos(a + 0.12) * (r - 70), by + Math.sin(a + 0.12) * (r - 70), bx + Math.cos(a - 0.12) * (r - 70), by + Math.sin(a - 0.12) * (r - 70));
        }
        g.fillStyle(color, 0.25).fillEllipse(bx, BOSS_Y - 40, 260, 340);
        fade(g, 1200);
        break;
      }
      case "wind": {
        g.setPosition(bx, by);
        for (let k = 0; k < 4; k++) { g.lineStyle(5, color, 0.9); g.beginPath(); g.arc(0, 0, 60 + k * 30, k, k + 3.6); g.strokePath(); }
        this.tweens.add({ targets: g, angle: 200, duration: 900 });
        fade(g, 700);
        break;
      }
      case "quake": {
        this.cameras.main.shake(500, 0.02);
        g.lineStyle(5, C.black, 1);
        for (let k = 0; k < 5; k++) { let x = bx + Phaser.Math.Between(-150, 150); let y = GROUND + 30; g.beginPath(); g.moveTo(x, y); for (let s = 0; s < 5; s++) { x += Phaser.Math.Between(-20, 20); y -= 22; g.lineTo(x, y); } g.strokePath(); }
        g.fillStyle(color, 0.5).fillRect(bx - 160, BOSS_Y + 90, 320, 20);
        fade(g, 900);
        break;
      }
      case "wave": {
        const wave = this.add.ellipse(80, BOSS_Y - 60, 120, 380, color, 0.65).setDepth(42);
        this.tweens.add({ targets: wave, x: W - 80, duration: 650, ease: "Sine.inOut", onComplete: () => fade(wave, 200) });
        g.destroy();
        break;
      }
      case "vines": {
        g.lineStyle(7, color, 1);
        for (let k = 0; k < 6; k++) {
          const x0 = bx - 120 + k * 48; g.beginPath(); g.moveTo(x0, BOSS_Y + 110);
          for (let s = 1; s <= 8; s++) g.lineTo(x0 + Math.sin(s + k) * 26, BOSS_Y + 110 - s * 30);
          g.strokePath();
        }
        g.setAlpha(0);
        this.tweens.add({ targets: g, alpha: 1, duration: 250 });
        fade(g, 1400);
        break;
      }
    }
    const burst = this.add.particles(bx, by, "spark", { speed: { min: 120, max: 380 }, lifespan: 800, scale: { start: 1.4, end: 0 }, tint: color, emitting: false }).setDepth(43);
    burst.explode(40);
    this.time.delayedCall(1000, () => burst.destroy());
  }

  // ---------------- UI helpers ----------------
  private addScore(n: number) { this.score += n; this.scoreText.setText(`κλέος ${this.score}`); }

  private flashPrompt(text: string, ms: number) {
    this.prompt.setText(text).setAlpha(1).setScale(1);
    this.tweens.killTweensOf(this.prompt);
    this.tweens.add({ targets: this.prompt, scale: 1.08, yoyo: true, repeat: Math.max(0, Math.floor(ms / 300) - 1), duration: 150 });
    this.time.delayedCall(ms, () => { if (this.prompt.text === text) this.prompt.setText(""); });
  }

  private showBanner(text: string, ms: number, color: string) {
    this.tweens.killTweensOf(this.banner);
    this.banner.setText(text).setColor(color).setAlpha(1).setScale(0.9);
    this.tweens.add({ targets: this.banner, scale: 1, duration: 200, ease: "Back.out" });
    this.tweens.add({ targets: this.banner, alpha: 0, delay: ms, duration: 400 });
  }

  private popText(x: number, y: number, text: string, color: string) {
    const t = this.add.text(x, y, text, { fontFamily: FONT(), fontSize: "20px", color, fontStyle: "bold", stroke: "#16100c", strokeThickness: color === "#16100c" ? 0 : 4 }).setOrigin(0.5).setDepth(70);
    this.tweens.add({ targets: t, y: y - 50, alpha: 0, duration: 1000, ease: "Quad.out", onComplete: () => t.destroy() });
  }

  private makeDialog() {
    const bg = this.add.graphics();
    bg.fillStyle(C.cream, 0.97).fillRoundedRect(-330, -34, 660, 68, 6);
    bg.lineStyle(3, C.black, 1).strokeRoundedRect(-330, -34, 660, 68, 6);
    this.dialogWho = this.add.text(-316, -28, "", { fontFamily: FONT(), fontSize: "12px", color: "#9e4a1c", fontStyle: "bold" });
    this.dialogText = this.add.text(-316, -12, "", { fontFamily: "Georgia, serif", fontSize: "17px", color: "#16100c", wordWrap: { width: 630 } });
    this.dialog = this.add.container(W / 2, 112, [bg, this.dialogWho, this.dialogText]).setDepth(65).setVisible(false);
  }

  private say(who: string, text: string, ms: number) {
    this.dialogWho.setText(who);
    this.dialogText.setText(text);
    this.dialog.setVisible(true).setAlpha(0);
    this.tweens.add({ targets: this.dialog, alpha: 1, duration: 150 });
    this.dialogTimer?.remove();
    this.dialogTimer = this.time.delayedCall(ms, () => this.dialog.setVisible(false));
  }

  private drawHud() {
    const g = this.hud.clear();
    // boss bar
    g.fillStyle(C.black, 1).fillRect(W / 2 - 252, 32, 504, 20);
    g.fillStyle(C.clayDark, 1).fillRect(W / 2 - 248, 36, 496, 12);
    g.fillStyle(this.phase === 2 ? C.red : C.cream, 1).fillRect(W / 2 - 248, 36, 496 * (this.bossHp / BOSS_MAX), 12);
    g.fillStyle(C.black, 1).fillRect(W / 2 - 1, 32, 2, 20); // half-way notch: the Nobody beat
    // player bar
    g.fillStyle(C.black, 0.85).fillRoundedRect(16, H - 70, 270, 50, 6);
    g.fillStyle(C.clayDark, 1).fillRect(24, H - 44, 254, 14);
    g.fillStyle(this.playerHp > 35 ? 0x9fd88a : C.red, 1).fillRect(24, H - 44, 254 * (this.playerHp / PLAYER_MAX), 14);
    if (!this.scoreText.text) this.addScore(0);
  }

  // ---------------- art ----------------
  private makeTextures() {
    if (this.textures.exists("spark")) return;
    const g = this.make.graphics({}, false);
    g.fillStyle(0xffffff, 1).fillCircle(8, 8, 8);
    g.generateTexture("spark", 16, 16); g.clear();
    g.fillStyle(0xffffff, 0.35).fillCircle(24, 24, 24);
    g.fillStyle(0xffffff, 1).fillCircle(24, 24, 14);
    g.generateTexture("orb", 48, 48); g.clear();
    g.fillStyle(C.black, 1).fillCircle(34, 34, 34);
    g.lineStyle(3, C.clay, 0.8).beginPath().arc(30, 30, 18, 3.6, 5.4).strokePath();
    g.lineStyle(3, C.clay, 0.8).beginPath().arc(42, 40, 12, 0.2, 1.6).strokePath();
    g.generateTexture("boulder", 68, 68); g.clear();
    g.fillStyle(0x5a3a1a, 1).fillRect(6, 18, 8, 132);
    g.fillStyle(0xff7a2a, 1).fillTriangle(1, 22, 19, 22, 10, 0);
    g.fillStyle(0xffd27a, 1).fillCircle(10, 18, 5);
    g.generateTexture("stake", 20, 150);
    g.destroy();
  }

  private meander(g: Phaser.GameObjects.Graphics, y: number) {
    g.fillStyle(C.black, 1).fillRect(0, y, W, 18);
    g.lineStyle(2.5, C.clay, 1);
    for (let x = 0; x < W; x += 24) {
      g.beginPath();
      g.moveTo(x + 2, y + 15); g.lineTo(x + 2, y + 3); g.lineTo(x + 16, y + 3); g.lineTo(x + 16, y + 11);
      g.lineTo(x + 8, y + 11); g.lineTo(x + 8, y + 7); g.lineTo(x + 12, y + 7);
      g.moveTo(x + 2, y + 15); g.lineTo(x + 22, y + 15);
      g.strokePath();
    }
  }

  private drawCave() {
    const g = this.add.graphics().setDepth(0);
    g.fillGradientStyle(C.clayLight, C.clayLight, C.clay, C.clay, 1).fillRect(0, 0, W, H);
    // cave walls: black-figure rock masses framing the scene
    g.fillStyle(C.black, 1);
    g.fillPoints([{ x: 0, y: 18 }, { x: 210, y: 18 }, { x: 150, y: 90 }, { x: 95, y: 200 }, { x: 70, y: 330 }, { x: 0, y: 360 }], true);
    g.fillPoints([{ x: W, y: 18 }, { x: W - 220, y: 18 }, { x: W - 160, y: 80 }, { x: W - 110, y: 190 }, { x: W - 70, y: 320 }, { x: W, y: 350 }], true);
    // cave mouth (daylight) blocked by the great door-stone
    g.fillStyle(C.day, 1).fillEllipse(150, 330, 120, 170);
    g.fillStyle(C.black, 1).fillCircle(170, 360, 70);
    g.lineStyle(3, C.clay, 0.8).beginPath().arc(160, 350, 40, 3.5, 5.6).strokePath();
    // floor band
    g.fillStyle(C.clayDark, 1).fillRect(0, GROUND + 30, W, H - GROUND - 30);
    g.fillStyle(C.black, 1).fillRect(0, GROUND + 26, W, 6);
    for (let x = 30; x < W; x += 80) { g.fillStyle(C.black, 1).fillCircle(x, GROUND + 48, 5); }
    // the rams Odysseus will escape beneath
    const ram = (x: number, y: number, s: number) => {
      g.fillStyle(C.black, 1).fillEllipse(x, y, 64 * s, 34 * s).fillCircle(x + 34 * s, y - 10 * s, 11 * s);
      g.fillRect(x - 22 * s, y + 10 * s, 5 * s, 18 * s).fillRect(x + 16 * s, y + 10 * s, 5 * s, 18 * s);
      g.lineStyle(2.5, C.clay, 1).beginPath().arc(x + 32 * s, y - 13 * s, 7 * s, 0, 5).strokePath();
      g.lineStyle(1.5, C.clay, 0.7);
      for (let k = -2; k <= 2; k++) g.beginPath().arc(x + k * 9 * s, y, 6 * s, 0.4, 2.7).strokePath();
    };
    ram(830, GROUND - 6, 1); ram(900, GROUND + 4, 0.85); ram(60, GROUND + 2, 0.8);
    this.meander(g, 0);
    this.meander(g, H - 18);
  }

  private drawCyclopesAtDoor() {
    const c = this.add.container(0, 30).setDepth(3).setVisible(false);
    [[110, 270], [160, 255], [210, 272]].forEach(([x, y]) => {
      const g = this.add.graphics();
      g.fillStyle(C.black, 1).fillCircle(x, y, 22).fillRect(x - 24, y + 14, 48, 40);
      g.fillStyle(C.cream, 1).fillEllipse(x, y - 3, 16, 10);
      g.fillStyle(C.black, 1).fillCircle(x, y - 3, 3);
      c.add(g);
    });
    return c;
  }

  private drawBoss() {
    const c = this.add.container(BOSS_X, BOSS_Y).setDepth(10);
    const g = this.add.graphics();
    g.fillStyle(C.black, 1);
    // legs, torso, arms (black figure)
    g.fillRect(-70, 60, 46, 110).fillRect(24, 60, 46, 110);
    g.fillPoints([{ x: -110, y: -100 }, { x: 110, y: -100 }, { x: 85, y: 80 }, { x: -85, y: 80 }], true);
    g.fillPoints([{ x: -110, y: -96 }, { x: -170, y: -20 }, { x: -150, y: 30 }, { x: -96, y: -40 }], true);
    g.fillPoints([{ x: 110, y: -96 }, { x: 175, y: -30 }, { x: 160, y: 10 }, { x: 96, y: -40 }], true);
    g.fillCircle(-158, 32, 18);
    // head
    g.fillCircle(0, -150, 62);
    g.fillTriangle(-40, -200, -20, -228, -8, -206).fillTriangle(8, -206, 22, -232, 40, -200);
    // incised details (scratched clay lines, as on black-figure vases)
    g.lineStyle(3, C.clay, 0.85);
    g.beginPath().arc(0, -40, 60, 0.3, 2.84).strokePath();
    g.lineBetween(-60, 80, 60, 80);
    g.beginPath().arc(-30, -20, 30, 3.4, 4.8).strokePath();
    g.beginPath().arc(30, -20, 30, 4.6, 6.0).strokePath();
    g.beginPath().arc(0, -112, 30, 0.2, 2.9).strokePath(); // mouth
    g.lineStyle(2, C.clay, 0.85);
    for (let k = -3; k <= 3; k++) g.lineBetween(k * 12, -96, k * 14, -84); // beard
    // the single eye
    g.fillStyle(C.cream, 1).fillEllipse(0, -150, 52, 34);
    g.lineStyle(3, C.clay, 1).strokeEllipse(0, -150, 56, 38);
    g.lineStyle(4, C.black, 1).lineBetween(-30, -176, 30, -176); // brow
    const eyeGlow = this.add.graphics();
    eyeGlow.fillStyle(C.red, 0.6).fillEllipse(0, -150, 70, 48);
    eyeGlow.setVisible(false);
    const iris = this.add.graphics();
    iris.fillStyle(C.red, 1).fillCircle(0, -150, 11);
    iris.fillStyle(C.black, 1).fillCircle(0, -150, 5);
    // club in the right hand
    const club = this.add.graphics();
    club.fillStyle(0x3a2412, 1).fillPoints([{ x: -8, y: 0 }, { x: 8, y: 0 }, { x: 22, y: -170 }, { x: -6, y: -175 }], true);
    club.lineStyle(2, C.clay, 0.8).lineBetween(0, -40, 10, -150);
    club.setPosition(165, 0);
    const rock = this.add.graphics();
    rock.fillStyle(C.black, 1).fillCircle(0, 0, 34).lineStyle(3, C.clay, 0.8).strokeCircle(0, 0, 22);
    rock.setPosition(130, -120).setVisible(false);
    const stun = this.add.container(0, -230);
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      const s = this.add.star(Math.cos(a) * 60, Math.sin(a) * 16, 5, 5, 11, 0xfff27a).setStrokeStyle(2, C.black);
      stun.add(s);
    }
    stun.setVisible(false);
    c.add([g, eyeGlow, iris, club, rock, stun]);
    this.club = club; this.iris = iris; this.eyeGlow = eyeGlow; this.rock = rock; this.stunFx = stun;
    // stun stars need to sit around the head, not orbit the body origin
    this.stunFx.setPosition(0, -215);
    this.tweens.add({ targets: c, y: BOSS_Y - 6, yoyo: true, repeat: -1, duration: 900, ease: "Sine.inOut" });
    return c;
  }

  private drawPlayer() {
    const c = this.add.container(LANES[1], GROUND).setDepth(20);
    const g = this.add.graphics();
    g.fillStyle(C.black, 1);
    g.fillRect(-14, -10, 9, 34).fillRect(5, -10, 9, 34); // legs
    g.fillPoints([{ x: -20, y: -62 }, { x: 20, y: -62 }, { x: 16, y: -6 }, { x: -16, y: -6 }], true); // torso
    g.fillCircle(0, -78, 15); // head
    g.fillPoints([{ x: -14, y: -86 }, { x: 14, y: -86 }, { x: 4, y: -112 }, { x: -18, y: -104 }], true); // crest
    g.fillStyle(C.black, 1).fillCircle(-24, -36, 22); // hoplite shield
    g.lineStyle(3, C.clay, 1).strokeCircle(-24, -36, 15);
    g.fillStyle(C.clay, 1).fillCircle(-24, -36, 4);
    g.lineStyle(2, C.clay, 0.8).lineBetween(-10, -94, 10, -100).lineBetween(-14, -30, 14, -30);
    g.fillStyle(C.black, 1).fillRect(18, -70, 4, 60); // spear
    g.fillTriangle(14, -70, 26, -70, 20, -88);
    const aegis = this.add.graphics();
    aegis.fillStyle(C.cream, 0.28).fillCircle(0, -60, 80);
    aegis.lineStyle(5, C.cream, 0.95).strokeCircle(0, -60, 80);
    aegis.lineStyle(2, 0xfff27a, 0.8).strokeCircle(0, -60, 66);
    aegis.setVisible(false);
    c.add([aegis, g]);
    c.setScale(1.3);
    // cream outline so the black-figure hero stays readable in front of the black Cyclops
    try { c.postFX?.addGlow(C.cream, 3, 0, false, 0.1, 10); } catch { /* canvas renderer: no FX */ }
    this.aegis = aegis;
    return c;
  }
}
