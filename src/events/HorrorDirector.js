/* ============================================================
   UMBRAL 09 - Horror Director
   ------------------------------------------------------------
   Controla la TENSION (0..100) y decide, de forma dinamica y
   semi-aleatoria, que eventos de terror disparar para que el
   miedo no sea predecible: sonidos lejanos, parpadeos, cierres
   de puertas, apariciones, manifestacion y caza de la entidad.
   ============================================================ */

import { CONFIG, ENTITY_STATE, ZONE } from '../config.js';

export class HorrorDirector {
  constructor(map, audio, entity, gameState, fx) {
    this.map = map;
    this.audio = audio;
    this.entity = entity;
    this.state = gameState;
    this.fx = fx; // callbacks visuales que implementa Game

    this.tension = 0;
    this.eventTimer = CONFIG.director.eventCheckInterval;
    this.idleTime = 0;
    this.lastBigEvent = 0;
    this.time = 0;
    this.forcedHunt = false; // caza final (panel 3)
  }

  // Sube tension al cumplir un objetivo
  onObjective(amount = CONFIG.director.objectiveBoost) {
    this.tension = Math.min(CONFIG.director.tensionMax, this.tension + amount);
  }

  // Inicia la caza final (panel 3): la entidad despierta del todo
  triggerFinalHunt() {
    this.forcedHunt = true;
    this.tension = CONFIG.director.tensionMax;
    if (this.entity.state === ENTITY_STATE.DORMANT) {
      this.entity.spawnStalk(this.fx.getPlayerPos());
    }
    this.entity.setState(ENTITY_STATE.HUNT);
    this.audio.startHunt();
  }

  // Permisos que Game pasa a entity.update (la entidad decide el micro)
  getEntityPermissions() {
    return {
      aggression: this.state.aggression,
      allowManifest: this.tension > 45 || this.state.aggression > 0.3,
      allowHunt: this.forcedHunt || this.tension > CONFIG.director.huntTensionThreshold
    };
  }

  /* ctx = { playerPos, camera, inDarkness, isMoving, isRunning,
            zone, entityState, entityDist, inSafeZone } */
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

    // mas progreso => suelo de tension mas alto (dificultad creciente)
    const floor = this.state.aggression * 35 + (this.forcedHunt ? 60 : 0);

    this.tension += delta * dt;
    this.tension = Math.max(floor * 0.5, Math.min(d.tensionMax, this.tension));

    // info para audio/postproceso
    this.audio.setTension(this.tension / 100);

    // ---- Despertar a la entidad cuando hay algo de tension ----
    if (this.entity.state === ENTITY_STATE.DORMANT && this.tension > 22) {
      this.entity.spawnStalk(ctx.playerPos);
    }

    // ---- Programador de eventos ----
    this.eventTimer -= dt;
    if (this.eventTimer <= 0) {
      // intervalo mas corto con tension alta
      this.eventTimer = d.eventCheckInterval * (1.4 - this.tension / 120) + Math.random() * 2;
      this.maybeFireEvent(ctx);
    }
  }

  maybeFireEvent(ctx) {
    const tn = this.tension / 100;
    // probabilidad de que ocurra algo escala con tension
    if (Math.random() > 0.35 + tn * 0.6) return;

    // elige una banda de eventos segun tension
    const r = Math.random();
    if (this.tension < 30) {
      // sutil
      if (r < 0.4) { this.audio.playMetalDistant(); }
      else if (r < 0.7) { this.audio.playWaterDrip(); }
      else { this.audio.playWhisper(); this.fx.subtitle(this.randomWhisper()); }
    } else if (this.tension < 62) {
      // medio
      if (r < 0.2) { this.flickerLights(ctx.playerPos); }
      else if (r < 0.38) { this.audio.playDoorCreak(); }
      else if (r < 0.54) { this.audio.playKnock(); this.fx.cameraShake(0.15, 0.3); }
      else if (r < 0.7) { this.map.turnOnTVNear(ctx.playerPos); this.audio.playStatic(1.5, 0.08); }
      else if (r < 0.86) { this.audio.playWhisper(); this.fx.subtitle(this.randomWhisper()); }
      else { this.fx.apparition(ctx.playerPos); }
    } else {
      // alto
      if (r < 0.2) { const p = this.map.breakLightNear(ctx.playerPos); if (p) this.audio.playLightPop(); }
      else if (r < 0.4) { const p = this.map.closeRandomDoorNear(ctx.playerPos); if (p) this.audio.playDoorCreak(); }
      else if (r < 0.58) { this.fx.apparition(ctx.playerPos); this.audio.playWhisper(); }
      else if (r < 0.72) { this.audio.playKnock(); this.fx.cameraShake(0.3, 0.4); }
      else {
        // manifestacion de la entidad (si esta acechando)
        if (this.entity.state === ENTITY_STATE.STALK) {
          const perms = this.getEntityPermissions();
          this.entity.tryManifest({ playerPos: ctx.playerPos, ...perms });
        } else {
          this.fx.apparition(ctx.playerPos);
        }
      }
    }
  }

  flickerLights(pos) {
    // parpadeo breve de luminarias cercanas (lo aplica Game via fx)
    this.fx.flickerNearbyLights(pos, 1.2);
  }

  randomWhisper() {
    const lines = [
      'no... mires...',
      'sigue caminando',
      'estas mas cerca',
      'no estas solo',
      'aqui abajo',
      'otra vez tu',
      'no la enciendas'
    ];
    return lines[Math.floor(Math.random() * lines.length)];
  }
}
