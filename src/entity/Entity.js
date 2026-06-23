/* ============================================================
   UMBRAL 09 - Entidad hostil
   ------------------------------------------------------------
   Presencia que aterra mas por sonido/ausencia que por mostrarse.
   Tres estados:
     1. STALK (acecho): invisible/lejana, sonidos, sin verse.
     2. MANIFEST (manifestacion): aparece breve a distancia.
     3. HUNT (caza): persigue al jugador por el laberinto (BFS).
   Reacciona a: correr (oido), linterna apuntada, progreso (agresion).
   ============================================================ */

import * as THREE from 'three';
import { CONFIG, ENTITY_STATE } from '../config.js';

export class Entity {
  constructor(scene, map, audio) {
    this.scene = scene;
    this.map = map;
    this.audio = audio;

    this.state = ENTITY_STATE.DORMANT;
    this.position = new THREE.Vector3(0, 0, 0);
    this.targetCell = null;     // celda destino actual {gx,gz}
    this.path = [];             // ruta BFS (lista de celdas)
    this.repathTimer = 0;
    this.stateTimer = 0;

    this.awareness = 0;         // 0..1 cuanto sabe de ti
    this.flashlightExposure = 0;// tiempo acumulado de linterna encima
    this.loseSightTimer = 0;    // tiempo sin verte (para abandonar caza)
    this.stepTimer = 0;

    this.isVisibleToPlayer = false; // lo fija Game (LOS)
    this.distanceToPlayer = Infinity;

    this.onCatch = null;        // callback cuando atrapa al jugador
    this.onHuntStart = null;
    this.onManifest = null;

    this.mesh = this.buildMesh();
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  // Silueta humanoide alta y oscura (lee como vacio recortado)
  buildMesh() {
    const g = new THREE.Group();
    const dark = new THREE.MeshStandardMaterial({ color: 0x050507, roughness: 0.4, metalness: 0.0 });

    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.9, 4, 10), dark);
    torso.position.y = 1.5; g.add(torso);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), dark);
    head.position.y = 2.25; g.add(head);

    // brazos largos
    const armGeo = new THREE.CapsuleGeometry(0.08, 1.0, 3, 6);
    const armL = new THREE.Mesh(armGeo, dark);
    armL.position.set(-0.34, 1.35, 0); armL.rotation.z = 0.12; g.add(armL);
    const armR = new THREE.Mesh(armGeo, dark);
    armR.position.set(0.34, 1.35, 0); armR.rotation.z = -0.12; g.add(armR);

    // piernas
    const legGeo = new THREE.CapsuleGeometry(0.11, 0.9, 3, 6);
    const legL = new THREE.Mesh(legGeo, dark);
    legL.position.set(-0.14, 0.55, 0); g.add(legL);
    const legR = new THREE.Mesh(legGeo, dark);
    legR.position.set(0.14, 0.55, 0); g.add(legR);

    // ojos: dos puntos tenues que solo se notan de cerca
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x884444 });
    const eyeGeo = new THREE.SphereGeometry(0.025, 6, 6);
    const eyeL = new THREE.Mesh(eyeGeo, eyeMat); eyeL.position.set(-0.07, 2.28, 0.18); g.add(eyeL);
    const eyeR = new THREE.Mesh(eyeGeo, eyeMat); eyeR.position.set(0.07, 2.28, 0.18); g.add(eyeR);
    this.eyeMat = eyeMat;

    g.traverse(o => { if (o.isMesh) { o.castShadow = true; } });
    this.limbs = { armL, armR, legL, legR };
    return g;
  }

  // ---- Entrada en juego: comienza acechando lejos del jugador ----
  spawnStalk(playerPos) {
    const cell = this.map.randomFloorCellFar(playerPos, CONFIG.entity.spawnMinDistance);
    if (!cell) return;
    this.position.copy(cell.world);
    this.mesh.position.copy(this.position);
    this.mesh.visible = false; // acecho: no se muestra
    this.setState(ENTITY_STATE.STALK);
    this.awareness = 0.2;
  }

  setState(s) {
    this.state = s;
    this.stateTimer = 0;
    if (s === ENTITY_STATE.MANIFEST) {
      this.mesh.visible = true;
      if (this.onManifest) this.onManifest(this.position.clone());
    } else if (s === ENTITY_STATE.HUNT) {
      this.mesh.visible = true;
      this.path = [];
      this.repathTimer = 0;
      if (this.onHuntStart) this.onHuntStart();
    } else if (s === ENTITY_STATE.STALK) {
      this.mesh.visible = false;
      this.path = [];
      this.pickWanderTarget();
    } else if (s === ENTITY_STATE.DORMANT) {
      this.mesh.visible = false;
    }
  }

  cell() { return this.map.worldToGrid(this.position.x, this.position.z); }

  // ---- BFS sobre la rejilla (entidad -> destino), devuelve lista de celdas ----
  bfs(from, to) {
    if (from.gx === to.gx && from.gz === to.gz) return [];
    const W = this.map.gridW, H = this.map.gridH;
    const key = (x, z) => x * H + z;
    const visited = new Uint8Array(W * H);
    const prev = new Int32Array(W * H).fill(-1);
    const queue = [from];
    visited[key(from.gx, from.gz)] = 1;
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    let found = false;
    while (queue.length) {
      const cur = queue.shift();
      if (cur.gx === to.gx && cur.gz === to.gz) { found = true; break; }
      for (const [dx, dz] of dirs) {
        const nx = cur.gx + dx, nz = cur.gz + dz;
        if (nx < 0 || nz < 0 || nx >= W || nz >= H) continue;
        if (visited[key(nx, nz)]) continue;
        if (this.map.isSolidGrid(nx, nz)) continue;
        visited[key(nx, nz)] = 1;
        prev[key(nx, nz)] = key(cur.gx, cur.gz);
        queue.push({ gx: nx, gz: nz });
      }
    }
    if (!found) return [];
    // reconstruir
    const path = [];
    let ck = key(to.gx, to.gz);
    while (ck !== key(from.gx, from.gz) && ck >= 0) {
      const x = Math.floor(ck / H), z = ck % H;
      path.unshift({ gx: x, gz: z });
      ck = prev[ck];
    }
    return path;
  }

  pickWanderTarget() {
    const cell = this.map.randomFloorCellFar(this.position, 6);
    if (cell) {
      this.targetCell = { gx: cell.gx, gz: cell.gz };
      this.path = this.bfs(this.cell(), this.targetCell);
    }
  }

  // ---- Mover la entidad a lo largo de su ruta a cierta velocidad ----
  followPath(dt, speed) {
    if (!this.path || this.path.length === 0) return false;
    const next = this.path[0];
    const w = this.map.gridToWorld(next.gx, next.gz);
    const dx = w.x - this.position.x;
    const dz = w.z - this.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.18) {
      this.path.shift();
      return this.path.length > 0;
    }
    const step = speed * dt;
    this.position.x += (dx / dist) * step;
    this.position.z += (dz / dist) * step;
    // orientacion hacia el movimiento
    this.targetYaw = Math.atan2(dx, dz);
    return true;
  }

  /* ctx = {
       playerPos: Vector3, playerRunning: bool, flashlightPointing: bool,
       losToPlayer: bool (hay linea de vision entidad<->jugador),
       aggression: 0..1, allowManifest: bool, allowHunt: bool
     } */
  update(dt, ctx) {
    if (this.state === ENTITY_STATE.DORMANT) return;

    this.stateTimer += dt;
    this.distanceToPlayer = this.position.distanceTo(ctx.playerPos);

    // ---- Percepcion ----
    // oye correr cerca
    if (ctx.playerRunning && this.distanceToPlayer < CONFIG.entity.hearRunRadius) {
      this.awareness = Math.min(1, this.awareness + dt * 0.5);
    }
    // linterna encima
    if (ctx.flashlightPointing && ctx.losToPlayer) {
      this.flashlightExposure += dt;
      this.awareness = Math.min(1, this.awareness + dt * 0.4);
    } else {
      this.flashlightExposure = Math.max(0, this.flashlightExposure - dt * 0.5);
    }
    // decaimiento natural del conocimiento
    this.awareness = Math.max(0, this.awareness - dt * 0.04);

    // mas agresion (progreso) => sube percepcion base
    this.awareness = Math.max(this.awareness, ctx.aggression * 0.35);

    switch (this.state) {
      case ENTITY_STATE.STALK: this.updateStalk(dt, ctx); break;
      case ENTITY_STATE.MANIFEST: this.updateManifest(dt, ctx); break;
      case ENTITY_STATE.HUNT: this.updateHunt(dt, ctx); break;
    }

    // ---- Aplicar transform + animacion sutil ----
    this.mesh.position.copy(this.position);
    if (this.targetYaw != null) {
      // girar suave hacia la direccion de movimiento
      let d = this.targetYaw - this.mesh.rotation.y;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.mesh.rotation.y += d * Math.min(1, 8 * dt);
    }
    this.animateLimbs(dt);
  }

  updateStalk(dt, ctx) {
    // deambula
    this.repathTimer -= dt;
    const moving = this.followPath(dt, CONFIG.entity.stalkSpeed);
    if (!moving && this.repathTimer <= 0) {
      this.pickWanderTarget();
      this.repathTimer = 2.0;
    }

    // pasos lejanos audibles segun proximidad
    this.stepTimer -= dt;
    if (this.stepTimer <= 0) {
      this.stepTimer = 0.7;
      if (this.audio) this.audio.entityStep(this.distanceToPlayer, false);
    }

    // escalado: si esta muy consciente y se permite, manifestarse o cazar
    if (this.flashlightExposure > CONFIG.entity.flashlightAggroTime && ctx.allowHunt) {
      this.setState(ENTITY_STATE.HUNT);
      return;
    }
    if (this.awareness >= 1 && ctx.allowHunt) {
      this.setState(ENTITY_STATE.HUNT);
      return;
    }
    if (this.awareness > 0.6 && ctx.allowManifest && this.distanceToPlayer > 10) {
      this.tryManifest(ctx);
    }
  }

  // Reubica la entidad a un punto lejano y visible (fin de pasillo) y se muestra
  tryManifest(ctx) {
    let chosen = null;
    for (let i = 0; i < 12; i++) {
      const cell = this.map.randomFloorCellFar(ctx.playerPos, 12);
      if (!cell) continue;
      const los = this.map.lineOfSight(ctx.playerPos.x, ctx.playerPos.z, cell.world.x, cell.world.z);
      if (los) { chosen = cell; break; }
      if (!chosen) chosen = cell;
    }
    if (chosen) {
      this.position.copy(chosen.world);
      this.mesh.position.copy(this.position);
      // mira hacia el jugador
      this.targetYaw = Math.atan2(ctx.playerPos.x - this.position.x, ctx.playerPos.z - this.position.z);
      this.mesh.rotation.y = this.targetYaw;
      this.setState(ENTITY_STATE.MANIFEST);
    }
  }

  updateManifest(dt, ctx) {
    // permanece quieta, mirando al jugador
    this.targetYaw = Math.atan2(ctx.playerPos.x - this.position.x, ctx.playerPos.z - this.position.z);

    // si la miras con linterna mucho tiempo, o pasa el tiempo y hay agresion -> caza
    const stared = ctx.flashlightPointing && ctx.losToPlayer && this.flashlightExposure > 1.2;
    if (this.stateTimer > CONFIG.entity.manifestDuration) {
      if ((ctx.allowHunt && (this.awareness > 0.7 || ctx.aggression > 0.4)) || stared) {
        this.setState(ENTITY_STATE.HUNT);
      } else {
        this.setState(ENTITY_STATE.STALK);
      }
    } else if (stared && ctx.allowHunt) {
      this.setState(ENTITY_STATE.HUNT);
    }
  }

  updateHunt(dt, ctx) {
    this.repathTimer -= dt;
    if (this.repathTimer <= 0) {
      const pc = this.map.worldToGrid(ctx.playerPos.x, ctx.playerPos.z);
      this.path = this.bfs(this.cell(), pc);
      this.repathTimer = CONFIG.entity.repathInterval;
    }
    // velocidad de caza escala levemente con agresion
    const speed = CONFIG.entity.huntSpeed * (0.9 + ctx.aggression * 0.25);
    this.followPath(dt, speed);

    // pasos de caza (mas frecuentes/cercanos)
    this.stepTimer -= dt;
    if (this.stepTimer <= 0) {
      this.stepTimer = 0.34;
      if (this.audio) this.audio.entityStep(this.distanceToPlayer, true);
    }

    // atrapa al jugador
    if (this.distanceToPlayer < CONFIG.entity.catchRadius) {
      if (this.onCatch) this.onCatch();
      return;
    }

    // pierde la pista: si no te ve y estas lejos, abandona
    if (ctx.losToPlayer && this.distanceToPlayer < 18) {
      this.loseSightTimer = 0;
    } else {
      this.loseSightTimer += dt;
      if (this.loseSightTimer > CONFIG.entity.loseSightTime) {
        this.loseSightTimer = 0;
        this.awareness = 0.3;
        // se retira lejos y vuelve a acechar
        const far = this.map.randomFloorCellFar(ctx.playerPos, CONFIG.entity.spawnMinDistance);
        if (far) { this.position.copy(far.world); }
        this.setState(ENTITY_STATE.STALK);
      }
    }
  }

  animateLimbs(dt) {
    if (!this.mesh.visible) return;
    const t = performance.now() * 0.004;
    const moving = this.state === ENTITY_STATE.HUNT || this.state === ENTITY_STATE.STALK;
    const amp = moving ? 0.5 : 0.05;
    this.limbs.armL.rotation.x = Math.sin(t) * amp;
    this.limbs.armR.rotation.x = -Math.sin(t) * amp;
    this.limbs.legL.rotation.x = -Math.sin(t) * amp;
    this.limbs.legR.rotation.x = Math.sin(t) * amp;
    // leve flotacion inquietante
    this.mesh.position.y = Math.sin(t * 0.7) * 0.03;
  }

  retreatDormant() {
    this.setState(ENTITY_STATE.DORMANT);
    this.mesh.visible = false;
  }
}
