/* ============================================================
   UMBRAL 09 - Figuras inmoviles ("no parpadees")
   ------------------------------------------------------------
   Maniquies palidos repartidos por las zonas oscuras. Se CONGELAN
   mientras los miras; cuando dejas de observarlos, giran y avanzan
   hacia ti. Si te alcanzan -> screamer + muerte. Tienen contrajuego:
   mantenerlos a la vista. Solo cobran vida dentro de un radio.
   ============================================================ */

import * as THREE from 'three';
import { CONFIG, ZONE } from '../config.js';
import { getSharedTextures } from '../map/Textures.js';

export class StillFigures {
  constructor(scene, map, audio) {
    this.scene = scene;
    this.map = map;
    this.audio = audio;
    this.figures = [];
    this.onCatch = null;

    this.group = new THREE.Group();
    this.group.name = 'stillFigures';
    scene.add(this.group);

    this._toEye = new THREE.Vector3();
    this._dir = new THREE.Vector3();
  }

  build() {
    const zones = [ZONE.CORRUPT, ZONE.MAINTENANCE, ZONE.FLOODED, ZONE.TV_ROOM, ZONE.CORRUPT, ZONE.MAINTENANCE, ZONE.CORRUPT];
    for (let i = 0; i < CONFIG.stillFigures.count; i++) {
      const zone = zones[i % zones.length];
      const cell = this.pickCell(zone);
      if (!cell) continue;
      const mesh = this.buildFigure();
      const w = this.map.gridToWorld(cell.gx, cell.gz);
      mesh.position.set(w.x, 0, w.z);
      mesh.rotation.y = Math.random() * Math.PI * 2;
      this.group.add(mesh);
      this.figures.push({
        mesh,
        pos: new THREE.Vector3(w.x, 0, w.z),
        home: new THREE.Vector3(w.x, 0, w.z)
      });
    }
  }

  pickCell(zone) {
    const list = this.map.floorByZone[zone];
    if (!list || !list.length) return null;
    for (let t = 0; t < 60; t++) {
      const c = list[Math.floor(Math.random() * list.length)];
      const w = this.map.gridToWorld(c[0], c[1]);
      // lejos del spawn para no asustar al instante
      if (Math.hypot(w.x - this.map.spawn.x, w.z - this.map.spawn.z) > 16) return { gx: c[0], gz: c[1] };
    }
    const c = list[0];
    return { gx: c[0], gz: c[1] };
  }

  buildFigure() {
    const g = new THREE.Group();
    const dark = new THREE.MeshStandardMaterial({ color: 0x16140f, roughness: 0.85 });

    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.22, 0.8, 9), dark);
    torso.position.y = 1.05; g.add(torso);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), dark);
    head.position.y = 1.62; g.add(head);
    const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.13, 0.95, 9), dark);
    legs.position.y = 0.48; g.add(legs);
    // brazos pegados al cuerpo
    const armGeo = new THREE.CapsuleGeometry(0.06, 0.7, 3, 6);
    const armL = new THREE.Mesh(armGeo, dark); armL.position.set(-0.22, 1.05, 0); g.add(armL);
    const armR = new THREE.Mesh(armGeo, dark); armR.position.set(0.22, 1.05, 0); g.add(armR);

    // rostro palido emisivo
    const tex = getSharedTextures().face;
    const faceMat = new THREE.MeshStandardMaterial({
      color: 0x0a0a0a, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.5, roughness: 1.0
    });
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.34), faceMat);
    face.position.set(0, 1.63, 0.155);
    g.add(face);

    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    return g;
  }

  // movimiento con deslizamiento simple contra muros
  moveResolved(fig, dx, dz) {
    const r = 0.3;
    const nx = fig.pos.x + dx;
    if (!this.map.isSolidWorld(nx + Math.sign(dx) * r, fig.pos.z)) fig.pos.x = nx;
    const nz = fig.pos.z + dz;
    if (!this.map.isSolidWorld(fig.pos.x, nz + Math.sign(dz) * r)) fig.pos.z = nz;
  }

  /* ctx = { eye: Vector3, feet: Vector3, camDir: Vector3 } */
  update(dt, ctx) {
    const cfg = CONFIG.stillFigures;
    for (const fig of this.figures) {
      const dx = ctx.feet.x - fig.pos.x;
      const dz = ctx.feet.z - fig.pos.z;
      const dist = Math.hypot(dx, dz);

      if (dist > cfg.activateRadius) continue; // dormida fuera de rango

      // ¿la estoy observando? (en el cono de vision + linea de vista)
      this._toEye.set(fig.pos.x, 1.55, fig.pos.z).sub(ctx.eye);
      const d3 = this._toEye.length();
      this._toEye.normalize();
      const facing = ctx.camDir.dot(this._toEye);
      const observed = facing > cfg.observeDot && d3 < cfg.observeRange &&
        this.map.lineOfSight(ctx.eye.x, ctx.eye.z, fig.pos.x, fig.pos.z);

      // mientras la miras esta CONGELADA y no puede atraparte (contrajuego justo)
      if (observed) continue;

      // solo te atrapa cuando NO la observas
      if (dist < cfg.catchRadius) {
        if (this.onCatch) this.onCatch(fig.pos.clone());
        return;
      }

      // gira hacia ti y avanza
      const yaw = Math.atan2(dx, dz);
      fig.mesh.rotation.y = yaw;
      const step = cfg.moveSpeed * dt;
      this.moveResolved(fig, (dx / dist) * step, (dz / dist) * step);
      fig.mesh.position.set(fig.pos.x, 0, fig.pos.z);
      // susurro tenue ocasional al acercarse
      if (this.audio && dist < 8 && Math.random() < 0.01) this.audio.playWhisper();
    }
  }
}
