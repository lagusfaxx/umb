/* ============================================================
   UMBRAL 09 - Entidad hostil (acechador)
   ------------------------------------------------------------
   Criatura SIEMPRE presente y visible que ronda el nivel.
   Te percibe por VISTA (cono + alcance, mas si llevas linterna)
   y OIDO (si corres). Maquina de estados clara y justa:
     PATROL  -> ronda con calma.
     SEARCH  -> oyo/medio vio algo: va al ultimo punto conocido.
     CHASE   -> te detecto: persecucion (mas lenta que correr).
   Solo te mata si te atrapa en CHASE y NO estas escondido.
   ============================================================ */

import * as THREE from 'three';
import { CONFIG, ENTITY_STATE } from '../config.js';
import { getSharedTextures } from '../map/Textures.js';

export class Entity {
  constructor(scene, map, audio, opts = {}) {
    this.scene = scene;
    this.map = map;
    this.audio = audio;
    this.variant = opts.variant || 'stalker';

    this.state = ENTITY_STATE.PATROL;
    this.position = new THREE.Vector3();
    this.path = [];
    this.repathTimer = 0;
    this.stepTimer = 0;
    this.twitch = 0;

    this.detection = 0;                 // 0..1 cuanto te ha percibido
    this.lastKnown = new THREE.Vector3();
    this.searchTimer = 0;
    this.searchYaw = 0;
    this.loseTimer = 0;
    this.enraged = false;

    this.distanceToPlayer = Infinity;
    this.targetYaw = null;

    this.onCatch = null;

    this.mesh = this.buildMesh();
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  get isChasing() { return this.state === ENTITY_STATE.CHASE; }

  // ============================================================
  // MODELO
  // ============================================================
  buildMesh() { return this.variant === 'crawler' ? this.buildCrawler() : this.buildStalker(); }

  bodyMat() { return new THREE.MeshStandardMaterial({ color: 0x040406, roughness: 0.55, metalness: 0.0 }); }

  makeFace(w = 0.42, h = 0.52) {
    const tex = getSharedTextures().face;
    const mat = new THREE.MeshStandardMaterial({
      color: 0x0a0a0a, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.55, roughness: 1.0
    });
    this.faceMat = mat;
    return new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  }

  buildStalker() {
    const g = new THREE.Group();
    const dark = this.bodyMat();

    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 1.15, 4, 10), dark);
    torso.position.y = 1.55; torso.rotation.x = 0.12; g.add(torso);

    const headGroup = new THREE.Group();
    headGroup.position.set(0, 2.35, 0.04);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 12), dark);
    head.scale.set(0.92, 1.15, 0.95); headGroup.add(head);
    const face = this.makeFace(0.34, 0.46); face.position.set(0, 0, 0.18); headGroup.add(face);
    g.add(headGroup); this.head = headGroup;

    const armGeo = new THREE.CapsuleGeometry(0.07, 1.5, 3, 6);
    const armL = new THREE.Mesh(armGeo, dark); armL.position.set(-0.32, 1.25, 0); armL.rotation.z = 0.1; g.add(armL);
    const armR = new THREE.Mesh(armGeo, dark); armR.position.set(0.32, 1.25, 0); armR.rotation.z = -0.1; g.add(armR);
    const legGeo = new THREE.CapsuleGeometry(0.1, 1.0, 3, 6);
    const legL = new THREE.Mesh(legGeo, dark); legL.position.set(-0.13, 0.6, 0); g.add(legL);
    const legR = new THREE.Mesh(legGeo, dark); legR.position.set(0.13, 0.6, 0); g.add(legR);

    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    this.limbs = { armL, armR, legL, legR };
    this.eyeHeight = 2.0;
    return g;
  }

  buildCrawler() {
    const g = new THREE.Group();
    const dark = this.bodyMat();
    const spine = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 1.0, 4, 8), dark);
    spine.rotation.x = Math.PI / 2; spine.position.set(0, 0.55, 0); g.add(spine);
    const headGroup = new THREE.Group(); headGroup.position.set(0, 0.5, 0.7);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 10), dark);
    head.scale.set(1.0, 0.8, 1.1); headGroup.add(head);
    const face = this.makeFace(0.3, 0.34); face.position.set(0, 0, 0.16); face.rotation.x = 0.3; headGroup.add(face);
    g.add(headGroup); this.head = headGroup;
    const limbGeo = new THREE.CapsuleGeometry(0.06, 0.7, 3, 6);
    const mk = (x, z) => { const m = new THREE.Mesh(limbGeo, dark); m.position.set(x, 0.4, z); m.rotation.z = x > 0 ? -0.6 : 0.6; g.add(m); return m; };
    this.limbs = { armL: mk(-0.3, 0.5), armR: mk(0.3, 0.5), legL: mk(-0.3, -0.4), legR: mk(0.3, -0.4) };
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    this.eyeHeight = 0.6;
    return g;
  }

  // ============================================================
  // APARICION
  // ============================================================
  spawnPatrol(playerPos) {
    const cell = this.map.randomFloorCellFar(playerPos, CONFIG.entity.spawnMinDistance);
    if (cell) this.position.copy(cell.world);
    this.mesh.position.copy(this.position);
    this.mesh.visible = true;     // siempre visible (lo veras rondar)
    this.detection = 0;
    this.startPatrol();
  }

  // ============================================================
  // NAVEGACION
  // ============================================================
  cell() { return this.map.worldToGrid(this.position.x, this.position.z); }

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
    const path = [];
    let ck = key(to.gx, to.gz);
    while (ck !== key(from.gx, from.gz) && ck >= 0) {
      path.unshift({ gx: Math.floor(ck / H), gz: ck % H });
      ck = prev[ck];
    }
    return path;
  }

  pathTo(worldPos) {
    const to = this.map.worldToGrid(worldPos.x, worldPos.z);
    this.path = this.bfs(this.cell(), to);
  }

  followPath(dt, speed) {
    if (!this.path || this.path.length === 0) return false;
    const next = this.path[0];
    const w = this.map.gridToWorld(next.gx, next.gz);
    const dx = w.x - this.position.x, dz = w.z - this.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.18) { this.path.shift(); return this.path.length > 0; }
    const step = speed * dt;
    this.position.x += (dx / dist) * step;
    this.position.z += (dz / dist) * step;
    this.targetYaw = Math.atan2(dx, dz);
    return true;
  }

  pickPatrolTarget() {
    const cell = this.map.randomFloorCellFar(this.position, 8);
    if (cell) this.pathTo(cell.world);
  }

  // ============================================================
  // PERCEPCION
  // ============================================================
  senses(dt, ctx) {
    const C = CONFIG.entity;
    let see = false;
    if (!ctx.playerHidden && ctx.losToPlayer) {
      const dist = this.distanceToPlayer;
      let range = C.sightRange + (this.enraged ? 6 : 0) + (ctx.aggression || 0) * 5;
      if (ctx.flashlightOn) range += C.sightRangeLitBonus;
      if (ctx.playerCrouching) range -= 3;
      if (dist <= range) {
        if (dist <= C.peripheralDist) {
          see = true;
        } else {
          const fy = this.mesh.rotation.y;
          const fdx = Math.sin(fy), fdz = Math.cos(fy);
          const ddx = ctx.playerPos.x - this.position.x;
          const ddz = ctx.playerPos.z - this.position.z;
          const dl = Math.hypot(ddx, ddz) || 1;
          if ((fdx * ddx + fdz * ddz) / dl > C.sightConeDot) see = true;
        }
      }
    }
    let hear = false;
    if (!ctx.playerHidden && ctx.playerRunning && this.distanceToPlayer < C.hearRunRadius) hear = true;

    if (see) {
      const rise = (this.state === ENTITY_STATE.CHASE ? C.detectionRiseChase : C.detectionRise) * (this.enraged ? 1.5 : 1);
      this.detection = Math.min(1, this.detection + dt * rise);
    } else if (hear) {
      this.detection = Math.min(1, this.detection + dt * C.detectionHear);
    } else {
      this.detection = Math.max(0, this.detection - dt * C.detectionFall);
    }
    return { see, hear };
  }

  // ============================================================
  // ESTADOS
  // ============================================================
  startPatrol() { this.state = ENTITY_STATE.PATROL; this.pickPatrolTarget(); this.repathTimer = 3; }
  startSearch(pos) {
    this.state = ENTITY_STATE.SEARCH;
    this.lastKnown.copy(pos);
    this.searchTimer = CONFIG.entity.searchTime;
    this.pathTo(pos);
  }
  startChase(pos) {
    this.state = ENTITY_STATE.CHASE;
    this.lastKnown.copy(pos);
    this.loseTimer = 0; this.repathTimer = 0; this.path = [];
  }

  // El director puede atraerla hacia el jugador (asegura encuentros)
  lureTo(pos) { if (this.state === ENTITY_STATE.PATROL) this.startSearch(pos); }
  // Caza final (panel 3)
  enrage(playerPos) { this.enraged = true; this.detection = 1; this.startChase(playerPos); }

  update(dt, ctx) {
    this.distanceToPlayer = this.position.distanceTo(ctx.playerPos);
    const C = CONFIG.entity;
    const { see, hear } = this.senses(dt, ctx);

    if (this.state === ENTITY_STATE.PATROL) this.updatePatrol(dt, ctx, see, hear);
    else if (this.state === ENTITY_STATE.SEARCH) this.updateSearch(dt, ctx, see, hear);
    else this.updateChase(dt, ctx, see, hear);

    this.mesh.position.copy(this.position);
    if (this.targetYaw != null) {
      let d = this.targetYaw - this.mesh.rotation.y;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.mesh.rotation.y += d * Math.min(1, 8 * dt);
    }
    this.animate(dt);
  }

  updatePatrol(dt, ctx, see, hear) {
    const C = CONFIG.entity;
    this.repathTimer -= dt;
    const moving = this.followPath(dt, C.patrolSpeed);
    if (!moving || this.repathTimer <= 0) { this.pickPatrolTarget(); this.repathTimer = 3; }

    this.stepTimer -= dt;
    if (this.stepTimer <= 0) { this.stepTimer = 0.8; if (this.audio) this.audio.entityStep(this.distanceToPlayer, false); }

    if (this.detection >= C.chaseThreshold) this.startChase(ctx.playerPos);
    else if (this.detection >= C.searchThreshold) this.startSearch(ctx.playerPos);
  }

  updateSearch(dt, ctx, see, hear) {
    const C = CONFIG.entity;
    if (this.detection >= C.chaseThreshold || see) { this.startChase(ctx.playerPos); return; }

    if (see || hear) { this.lastKnown.copy(ctx.playerPos); this.pathTo(this.lastKnown); }
    const moving = this.followPath(dt, C.searchSpeed);

    this.stepTimer -= dt;
    if (this.stepTimer <= 0) { this.stepTimer = 0.6; if (this.audio) this.audio.entityStep(this.distanceToPlayer, false); }

    if (!moving) {
      // llego al ultimo punto: mira alrededor
      this.searchYaw += dt * 1.6;
      this.targetYaw = this.searchYaw;
      this.searchTimer -= dt;
      if (this.searchTimer <= 0) this.startPatrol();
    } else {
      this.searchTimer -= dt * 0.3;
      if (this.searchTimer <= 0) this.startPatrol();
    }
  }

  updateChase(dt, ctx, see, hear) {
    const C = CONFIG.entity;
    if (see) { this.lastKnown.copy(ctx.playerPos); this.loseTimer = 0; }
    else { this.loseTimer += dt; }

    this.repathTimer -= dt;
    if (this.repathTimer <= 0) { this.pathTo(this.lastKnown); this.repathTimer = C.repathInterval; }

    const speed = C.huntSpeed * (1 + (ctx.aggression || 0) * 0.08) * (this.enraged ? 1.12 : 1);
    this.followPath(dt, speed);

    this.stepTimer -= dt;
    if (this.stepTimer <= 0) { this.stepTimer = 0.34; if (this.audio) this.audio.entityStep(this.distanceToPlayer, true); }

    if (this.distanceToPlayer < C.catchRadius && !ctx.playerHidden) { if (this.onCatch) this.onCatch(); return; }

    if (this.loseTimer > C.loseSightTime) this.startSearch(this.lastKnown.clone());
  }

  animate(dt) {
    if (!this.mesh.visible) return;
    const t = performance.now() * 0.004;
    const fast = this.state === ENTITY_STATE.CHASE;
    const amp = fast ? 0.7 : 0.4;
    if (this.limbs) {
      this.limbs.armL.rotation.x = Math.sin(t) * amp;
      this.limbs.armR.rotation.x = -Math.sin(t) * amp;
      this.limbs.legL.rotation.x = -Math.sin(t) * amp;
      this.limbs.legR.rotation.x = Math.sin(t) * amp;
    }
    this.mesh.position.y = (this.variant === 'crawler' ? 0 : 1) * Math.sin(t * 0.7) * 0.03;

    if (this.head) {
      if (this.twitch > 0) {
        this.twitch -= dt;
        this.head.rotation.z = (Math.random() - 0.5) * 0.5;
      } else {
        this.head.rotation.z *= 0.8;
        if (Math.random() < CONFIG.entity.headTwitchChance) this.twitch = 0.12 + Math.random() * 0.12;
      }
    }
  }
}
