/* ============================================================
   UMBRAL 09 - Horror Director
   ------------------------------------------------------------
   Controla la TENSION (0..100) y mantiene el suspenso: dispara
   sonidos lejanos, parpadeos, cierres de puertas, TVs y
   apariciones. Con tension alta ATRAE al acechador hacia tu
   zona (lureTo) para asegurar encuentros. No mata por si mismo.
   ============================================================ */

import { CONFIG, ZONE } from '../config.js';

export class HorrorDirector {
  constructor(map, audio, entity, gameState, fx) {
    this.map = map;
    this.audio = audio;
    this.entity = entity;
    this.state = gameState;
    this.fx = fx;

    this.tension = 10;
    this.eventTimer = CONFIG.director.eventCheckInterval;
    this.lureTimer = 14;
    this.idleTime = 0;
    this.time = 0;
  }

  onObjective(amount = CONFIG.director.objectiveBoost) {
    this.tension = Math.min(CONFIG.director.tensionMax, this.tension + amount);
  }

  // Caza final (panel 3): la entidad se enfurece y te persigue
  triggerFinalHunt() {
    this.tension = CONFIG.director.tensionMax;
    this.entity.enrage(this.fx.getPlayerPos());
    this.audio.startHunt();
  }

  /* ctx = { playerPos, inDarkness, isMoving, isRunning, zone,
            chasing, entityDist, inSafeZone } */
  update(dt, ctx) {
    this.time += dt;
    const d = CONFIG.director;

    // ---- Ajuste de tension ----
    let delta = -d.baseDecay;
    if (ctx.inDarkness) delta += d.darknessRate;
    if (ctx.isRunning) delta += d.runRate;
    if (!ctx.isMoving) { this.idleTime += dt; if (this.idleTime > 4) delta += d.idleRate; }
    else this.idleTime = 0;
    if (ctx.zone === ZONE.CORRUPT) delta += 1.8;
    if (ctx.inSafeZone) delta -= 1.5;
    if (ctx.chasing) this.tension = d.tensionMax;

    const floor = this.state.aggression * 40;
    this.tension += delta * dt;
    this.tension = Math.max(floor * 0.5, Math.min(d.tensionMax, this.tension));
    this.audio.setTension(this.tension / 100);

    // ---- Atraer al acechador hacia el jugador (asegura encuentros) ----
    this.lureTimer -= dt;
    if (this.lureTimer <= 0) {
      // mas frecuente con mas tension; solo si no esta ya persiguiendo
      this.lureTimer = 26 - this.tension * 0.15 + Math.random() * 8;
      if (!ctx.chasing && this.tension > 35 && ctx.entityDist > 16) {
        this.entity.lureTo(ctx.playerPos);
      }
    }

    // ---- Eventos ambientales ----
    this.eventTimer -= dt;
    if (this.eventTimer <= 0) {
      this.eventTimer = d.eventCheckInterval * (1.4 - this.tension / 120) + Math.random() * 2;
      this.maybeFireEvent(ctx);
    }
  }

  maybeFireEvent(ctx) {
    const tn = this.tension / 100;
    if (Math.random() > 0.35 + tn * 0.55) return;
    const r = Math.random();

    if (this.tension < 30) {
      if (r < 0.4) this.audio.playMetalDistant();
      else if (r < 0.7) this.audio.playWaterDrip();
      else { this.audio.playWhisper(); this.fx.subtitle(this.randomWhisper()); }
    } else if (this.tension < 65) {
      if (r < 0.22) this.fx.flickerNearbyLights(ctx.playerPos, 1.2);
      else if (r < 0.4) this.audio.playDoorCreak();
      else if (r < 0.56) { this.audio.playKnock(); this.fx.cameraShake(0.15, 0.3); }
      else if (r < 0.72) { this.map.turnOnTVNear(ctx.playerPos); this.audio.playStatic(1.5, 0.08); }
      else if (r < 0.88) { this.audio.playWhisper(); this.fx.subtitle(this.randomWhisper()); }
      else this.fx.apparition(ctx.playerPos);
    } else {
      if (r < 0.22) { const p = this.map.breakLightNear(ctx.playerPos); if (p) this.audio.playLightPop(); }
      else if (r < 0.42) { const p = this.map.closeRandomDoorNear(ctx.playerPos); if (p) this.audio.playDoorCreak(); }
      else if (r < 0.6) { this.fx.apparition(ctx.playerPos); this.audio.playWhisper(); }
      else if (r < 0.76) { this.audio.playKnock(); this.fx.cameraShake(0.3, 0.4); }
      else { if (!ctx.chasing) this.entity.lureTo(ctx.playerPos); else this.fx.cameraShake(0.2, 0.3); }
    }
  }

  randomWhisper() {
    const lines = ['no... mires...', 'sigue caminando', 'estas mas cerca', 'no estas solo',
      'aqui abajo', 'otra vez tu', 'no la enciendas', 'te escucho'];
    return lines[Math.floor(Math.random() * lines.length)];
  }
}
