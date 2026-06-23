/* ============================================================
   UMBRAL 09 - Entidad hostil
   ------------------------------------------------------------
   Aterra mas por sonido/ausencia que por mostrarse.
   Estados: STALK (acecho) -> MANIFEST (manifestacion) -> HUNT (caza).
   Variantes: 'stalker' (alta, demacrada) y 'crawler' (reptante rapido).
   El rostro palido (textura procedural) flota en la oscuridad.
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
    this.huntSpeed = this.variant === 'crawler' ? CONFIG.entity.crawlerHuntSpeed : CONFIG.entity.huntSpeed;

    this.state = ENTITY_STATE.DORMANT;
    this.position = new THREE.Vector3(0, 0, 0);
    this.targetCell = null;
    this.path = [];
    this.repathTimer = 0;
    this.stateTimer = 0;

    this.awareness = 0;
    this.flashlightExposure = 0;
    this.loseSightTimer = 0;
    this.stepTimer = 0;
    this.twitch = 0;

    this.isVisibleToPlayer = false;
    this.distanceToPlayer = Infinity;

    this.onCatch = null;
    this.onManifest = null;
    this.onHuntStart = null;

    this.mesh = this.buildMesh();
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  buildMesh() {
    return this.variant === 'crawler' ? this.buildCrawler() : this.buildStalker();
  }

  // Material oscuro de cuerpo (lee como silueta/vacio)
  bodyMat() {
    return new THREE.MeshStandardMaterial({ color: 0x040406, roughness: 0.55, metalness: 0.0 });
  }

  // Plano con el rostro palido, emisivo (visible en la oscuridad)
  makeFace(w = 0.42, h = 0.52) {
    const tex = getSharedTextures().face;
    const mat = new THREE.MeshStandardMaterial({
      color: 0x0a0a0a,
      emissive: 0xffffff,
      emissiveMap: tex,
      emissiveIntensity: 0.55,
      roughness: 1.0
    });
    const face = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    this.faceMat = mat;
    return face;
  }

  // ---- Acechador: alto, delgado, encorvado, brazos larguisimos ----
  buildStalker() {
    const g = new THREE.Group();
    const dark = this.bodyMat();

    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 1.15, 4, 10), dark);
    torso.position.y = 1.55; torso.rotation.x = 0.12; g.add(torso);

    const headGroup = new THREE.Group();
    headGroup.position.set(0, 2.35, 0.04);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 12), dark);
    head.scale.set(0.92, 1.15, 0.95);
    headGroup.add(head);
    const face = this.makeFace(0.34, 0.46);
    face.position.set(0, 0.0, 0.18);
    headGroup.add(face);
    g.add(headGroup);
    this.head = headGroup;

    // brazos larguisimos casi al suelo
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

  // ---- Reptante: bajo, columna horizontal, cabeza adelantada ----
  buildCrawler() {
    const g = new THREE.Group();
    const dark = this.bodyMat();

    const spine = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 1.0, 4, 8), dark);
    spine.rotation.x = Math.PI / 2;
    spine.position.set(0, 0.55, 0); g.add(spine);

    const headGroup = new THREE.Group();
    headGroup.position.set(0, 0.5, 0.7);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 10), dark);
    head.scale.set(1.0, 0.8, 1.1);
    headGroup.add(head);
    const face = this.makeFace(0.3, 0.34);
    face.position.set(0, 0.0, 0.16);
    face.rotation.x = 0.3;
    headGroup.add(face);
    g.add(headGroup);
    this.head = headGroup;

    // 4 extremidades flexionadas
    const limbGeo = new THREE.CapsuleGeometry(0.06, 0.7, 3, 6);
    const mk = (x, z) => { const m = new THREE.Mesh(limbGeo, dark); m.position.set(x, 0.4, z); m.rotation.z = x > 0 ? -0.6 : 0.6; g.add(m); return m; };
    const armL = mk(-0.3, 0.5), armR = mk(0.3, 0.5), legL = mk(-0.3, -0.4), legR = mk(0.3, -0.4);

    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    this.limbs = { armL, armR, legL, legR };
    this.eyeHeight = 0.6;
    return g;
  }

  spawnStalk(playerPos) {
    const cell = this.map.randomFloorCellFar(playerPos, CONFIG.entity.spawnMinDistance);
    if (!cell) return;
    this.position.copy(cell.world);
    this.mesh.position.copy(this.position);
    this.mesh.visible = false;
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
      this.path = []; this.repathTimer = 0;
      if (this.onHuntStart) this.onHuntStart();
    } else if (s === ENTITY_STATE.STALK) {
      this.mesh.visible = false;
      this.path = []; this.pickWanderTarget();
    } else if (s === ENTITY_STATE.DORMANT) {
      this.mesh.visible = false;
    }
  }

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

  update(dt, ctx) {
    if (this.state === ENTITY_STATE.DORMANT) return;
    this.stateTimer += dt;
    this.distanceToPlayer = this.position.distanceTo(ctx.playerPos);

    // percepcion
    if (ctx.playerRunning && this.distanceToPlayer < CONFIG.entity.hearRunRadius) {
      this.awareness = Math.min(1, this.awareness + dt * 0.5);
    }
    if (ctx.flashlightPointing && ctx.losToPlayer) {
      this.flashlightExposure += dt;
      this.awareness = Math.min(1, this.awareness + dt * 0.4);
    } else {
      this.flashlightExposure = Math.max(0, this.flashlightExposure - dt * 0.5);
    }
    this.awareness = Math.max(0, this.awareness - dt * 0.04);
    this.awareness = Math.max(this.awareness, ctx.aggression * 0.35);

    switch (this.state) {
      case ENTITY_STATE.STALK: this.updateStalk(dt, ctx); break;
      case ENTITY_STATE.MANIFEST: this.updateManifest(dt, ctx); break;
      case ENTITY_STATE.HUNT: this.updateHunt(dt, ctx); break;
    }

    this.mesh.position.copy(this.position);
    if (this.targetYaw != null) {
      let d = this.targetYaw - this.mesh.rotation.y;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.mesh.rotation.y += d * Math.min(1, 8 * dt);
    }
    this.animate(dt);
  }

  updateStalk(dt, ctx) {
    this.repathTimer -= dt;
    const moving = this.followPath(dt, CONFIG.entity.stalkSpeed);
    if (!moving && this.repathTimer <= 0) { this.pickWanderTarget(); this.repathTimer = 2.0; }

    this.stepTimer -= dt;
    if (this.stepTimer <= 0) { this.stepTimer = 0.7; if (this.audio) this.audio.entityStep(this.distanceToPlayer, false); }

    if (this.flashlightExposure > CONFIG.entity.flashlightAggroTime && ctx.allowHunt) { this.setState(ENTITY_STATE.HUNT); return; }
    if (this.awareness >= 1 && ctx.allowHunt) { this.setState(ENTITY_STATE.HUNT); return; }
    if (this.awareness > 0.6 && ctx.allowManifest && this.distanceToPlayer > 10) this.tryManifest(ctx);
  }

  tryManifest(ctx) {
    let chosen = null;
    for (let i = 0; i < 12; i++) {
      const cell = this.map.randomFloorCellFar(ctx.playerPos, 12);
      if (!cell) continue;
      if (this.map.lineOfSight(ctx.playerPos.x, ctx.playerPos.z, cell.world.x, cell.world.z)) { chosen = cell; break; }
      if (!chosen) chosen = cell;
    }
    if (chosen) {
      this.position.copy(chosen.world);
      this.mesh.position.copy(this.position);
      this.targetYaw = Math.atan2(ctx.playerPos.x - this.position.x, ctx.playerPos.z - this.position.z);
      this.mesh.rotation.y = this.targetYaw;
      this.setState(ENTITY_STATE.MANIFEST);
    }
  }

  updateManifest(dt, ctx) {
    this.targetYaw = Math.atan2(ctx.playerPos.x - this.position.x, ctx.playerPos.z - this.position.z);
    const stared = ctx.flashlightPointing && ctx.losToPlayer && this.flashlightExposure > 1.2;
    if (this.stateTimer > CONFIG.entity.manifestDuration) {
      if ((ctx.allowHunt && (this.awareness > 0.7 || ctx.aggression > 0.4)) || stared) this.setState(ENTITY_STATE.HUNT);
      else this.setState(ENTITY_STATE.STALK);
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
    const speed = this.huntSpeed * (0.9 + ctx.aggression * 0.25);
    this.followPath(dt, speed);

    this.stepTimer -= dt;
    if (this.stepTimer <= 0) { this.stepTimer = 0.32; if (this.audio) this.audio.entityStep(this.distanceToPlayer, true); }

    if (this.distanceToPlayer < CONFIG.entity.catchRadius) { if (this.onCatch) this.onCatch(); return; }

    if (ctx.losToPlayer && this.distanceToPlayer < 18) {
      this.loseSightTimer = 0;
    } else {
      this.loseSightTimer += dt;
      if (this.loseSightTimer > CONFIG.entity.loseSightTime) {
        this.loseSightTimer = 0;
        this.awareness = 0.3;
        const far = this.map.randomFloorCellFar(ctx.playerPos, CONFIG.entity.spawnMinDistance);
        if (far) this.position.copy(far.world);
        this.setState(ENTITY_STATE.STALK);
      }
    }
  }

  animate(dt) {
    if (!this.mesh.visible) return;
    const t = performance.now() * 0.004;
    const moving = this.state === ENTITY_STATE.HUNT || this.state === ENTITY_STATE.STALK;
    const amp = moving ? (this.variant === 'crawler' ? 0.7 : 0.5) : 0.05;
    if (this.limbs) {
      this.limbs.armL.rotation.x = Math.sin(t) * amp;
      this.limbs.armR.rotation.x = -Math.sin(t) * amp;
      this.limbs.legL.rotation.x = -Math.sin(t) * amp;
      this.limbs.legR.rotation.x = Math.sin(t) * amp;
    }
    // flotacion inquietante
    this.mesh.position.y = (this.variant === 'crawler' ? 0 : 1) * Math.sin(t * 0.7) * 0.03;

    // tic de cabeza (snap brusco) — inquietante
    if (this.head) {
      if (this.twitch > 0) {
        this.twitch -= dt;
        this.head.rotation.z = (Math.random() - 0.5) * 0.5;
        this.head.rotation.x = (Math.random() - 0.5) * 0.3;
      } else {
        this.head.rotation.z *= 0.8;
        this.head.rotation.x *= 0.8;
        if (Math.random() < CONFIG.entity.headTwitchChance) this.twitch = 0.12 + Math.random() * 0.12;
      }
    }
  }

  retreatDormant() { this.setState(ENTITY_STATE.DORMANT); this.mesh.visible = false; }
}
