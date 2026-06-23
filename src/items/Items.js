/* ============================================================
   UMBRAL 09 - Objetos e interacciones
   ------------------------------------------------------------
   Cintas VHS (6), pilas, paneles electricos (3), notas, radio y
   la salida. Gestiona meshes, deteccion de interaccion (proximidad
   + mirada) y los efectos de cada accion sobre el estado.
   ============================================================ */

import * as THREE from 'three';
import { CONFIG } from '../config.js';

// --- Fragmentos de historia de las 6 cintas (orden narrativo) ---
export const TAPE_TEXTS = [
  {
    title: 'CINTA 01 — INGRESO',
    body:
      'Equipo tecnico 4. Descenso al Nivel 09 completado.\n' +
      'La instalacion lleva clausurada desde el 94.\n' +
      'Vamos a revisar los paneles y restaurar energia.\n' +
      'Todo en orden. Solo es mantenimiento.'
  },
  {
    title: 'CINTA 02 — PRIMER FALLO',
    body:
      'Las luces del sector amarillo fallaron sin causa.\n' +
      'El medidor marca consumo en pasillos vacios.\n' +
      'Reyes dice que escucho el zumbido cambiar de tono.\n' +
      'No hay nadie mas aqui abajo. No deberia haberlo.'
  },
  {
    title: 'CINTA 03 — DENTRO DE LAS PAREDES',
    body:
      'Hay pasos. Vienen de dentro del muro.\n' +
      'Lentos. Siguen nuestro ritmo cuando caminamos.\n' +
      'Golpeamos la pared. Algo golpeo de vuelta.\n' +
      'Nadie quiere quedarse solo en los corredores.'
  },
  {
    title: 'CINTA 04 — GEOMETRIA',
    body:
      'Los pasillos se repiten. Marcamos una puerta con cinta\n' +
      'y volvimos a pasar por ella tres veces seguidas.\n' +
      'Medimos un corredor: 40 metros. A la vuelta: 90.\n' +
      'El lugar no quiere que salgamos.'
  },
  {
    title: 'CINTA 05 — NO LA MIRES',
    body:
      'Aparece al final de los pasillos. No te acerques.\n' +
      'Mirarla demasiado tiempo... deteriora la mente.\n' +
      'Vega la observo nueve segundos. Ya no habla.\n' +
      'Si la ves, baja la vista y sigue caminando.'
  },
  {
    title: 'CINTA 06 — ADVERTENCIA FINAL',
    body:
      'NO activen el tercer panel.\n' +
      'Abre la salida, si. Pero tambien la despierta del todo.\n' +
      'Lo que sale a cazar despues no se detiene.\n' +
      'Si llegaste hasta aqui... lo siento. Corre.'
  }
];

export const NOTE_TEXTS = [
  'PROTOCOLO 09: NO PERMANECER QUIETO. EL MOVIMIENTO REDUCE LA EXPOSICION.',
  'LA SALIDA NO ES UNA PUERTA. ES UNA DECISION. — anotado a mano',
  'SI LAS LUCES SE ENCIENDEN SOLAS, APAGA LA LINTERNA Y NO RESPIRES.'
];

export class Items {
  constructor(scene, map, gameState, audio) {
    this.scene = scene;
    this.map = map;
    this.state = gameState;
    this.audio = audio;

    this.tapes = [];
    this.batteries = [];
    this.panels = [];
    this.notes = [];
    this.radios = [];
    this.lockers = [];
    this.exit = null;

    this.group = new THREE.Group();
    this.group.name = 'items';
    scene.add(this.group);

    this.t = 0;
  }

  build() {
    const S = this.map.itemSpawns;

    // ---- Cintas VHS ----
    for (const tp of S.tapes) {
      const mesh = this.makeTapeMesh();
      const w = this.map.gridToWorld(tp.gx, tp.gz);
      mesh.position.set(w.x, 1.0, w.z);
      this.group.add(mesh);
      this.tapes.push({ id: tp.id, mesh, collected: false, baseY: 1.0 });
    }

    // ---- Pilas ----
    for (const bp of S.batteries) {
      const mesh = this.makeBatteryMesh();
      const w = this.map.gridToWorld(bp.gx, bp.gz);
      mesh.position.set(w.x, 0.9, w.z);
      this.group.add(mesh);
      this.batteries.push({ id: bp.id, mesh, collected: false, baseY: 0.9 });
    }

    // ---- Paneles electricos ----
    for (const pp of S.panels) {
      const grp = this.makePanelMesh();
      const w = this.map.gridToWorld(pp.gx, pp.gz);
      grp.position.set(w.x, 1.3, w.z);
      // orientar hacia el centro (aprox) girando hacia el pasillo
      grp.rotation.y = Math.atan2(-w.x, -w.z);
      this.group.add(grp);
      this.panels.push({ id: pp.id, grp, indicator: grp.userData.indicator, activated: false });
    }

    // ---- Notas (carteles distorsionados) ----
    for (let i = 0; i < NOTE_TEXTS.length; i++) {
      const cell = this.map.randomFloorCellFar(this.map.spawn, 8);
      if (!cell) continue;
      const mesh = this.makeNoteMesh();
      const w = this.map.gridToWorld(cell.gx, cell.gz);
      mesh.position.set(w.x, 1.2, w.z);
      mesh.rotation.y = Math.random() * Math.PI * 2;
      this.group.add(mesh);
      this.notes.push({ id: i, mesh, text: NOTE_TEXTS[i] });
    }

    // ---- Radio (interferencias) ----
    {
      const cell = this.map.randomFloorCellFar(this.map.spawn, 10);
      if (cell) {
        const mesh = this.makeRadioMesh();
        const w = this.map.gridToWorld(cell.gx, cell.gz);
        mesh.position.set(w.x, 0.95, w.z);
        this.group.add(mesh);
        this.radios.push({ mesh });
      }
    }

    // ---- Casilleros para esconderse ----
    this.buildLockers();

    // ---- Salida (oculta hasta poder escapar) ----
    this.buildExit();
  }

  // Coloca casilleros contra las paredes, repartidos por el mapa
  buildLockers() {
    const wantedDirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const candidates = [];
    for (let gx = 1; gx < this.map.gridW - 1; gx++) {
      for (let gz = 1; gz < this.map.gridH - 1; gz++) {
        if (this.map.isSolidGrid(gx, gz)) continue;
        // celda de piso con exactamente una pared ortogonal (buen rincon)
        let wall = null, walls = 0;
        for (const [dx, dz] of wantedDirs) {
          if (this.map.isSolidGrid(gx + dx, gz + dz)) { walls++; wall = [dx, dz]; }
        }
        if (walls === 1) candidates.push({ gx, gz, wall });
      }
    }
    // baraja
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }
    const placed = [];
    for (const c of candidates) {
      if (this.lockers.length >= CONFIG.hiding.lockerCount) break;
      const w = this.map.gridToWorld(c.gx, c.gz);
      // separacion minima entre casilleros
      if (placed.some(p => Math.hypot(p.x - w.x, p.z - w.z) < 10)) continue;
      placed.push(w);
      const [wx, wz] = c.wall;
      const faceYaw = Math.atan2(wx, wz); // mirar hacia la abertura (lejos de la pared)
      const mesh = this.makeLockerMesh();
      mesh.position.set(w.x + wx * 0.15, 0, w.z + wz * 0.15);
      mesh.rotation.y = Math.atan2(-wx, -wz); // frente del casillero hacia el cuarto
      this.group.add(mesh);
      this.lockers.push({ mesh, pos: new THREE.Vector3(w.x, 0, w.z), faceYaw });
    }
  }

  makeLockerMesh() {
    const g = new THREE.Group();
    const metal = new THREE.MeshStandardMaterial({ color: 0x394038, roughness: 0.6, metalness: 0.4 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 2.0, 0.6), metal);
    body.position.y = 1.0; g.add(body);
    // puerta con rejilla (lineas)
    const doorMat = new THREE.MeshStandardMaterial({ color: 0x2f352e, roughness: 0.7, metalness: 0.3 });
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.74, 1.9, 0.05), doorMat);
    door.position.set(0, 1.05, 0.3); g.add(door);
    for (let i = 0; i < 4; i++) {
      const vent = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.03, 0.06),
        new THREE.MeshStandardMaterial({ color: 0x14160f }));
      vent.position.set(0, 1.7 - i * 0.12, 0.32); g.add(vent);
    }
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    return g;
  }

  // ---- Fabricas de meshes ----
  makeTapeMesh() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.19, 0.032, 0.11),
      new THREE.MeshStandardMaterial({ color: 0x0c0c0c, roughness: 0.6, emissive: 0x3a2c0a, emissiveIntensity: 0.5 })
    );
    g.add(body);
    const label = new THREE.Mesh(
      new THREE.PlaneGeometry(0.13, 0.05),
      new THREE.MeshStandardMaterial({ color: 0xd8c98a, emissive: 0x6a5a2a, emissiveIntensity: 0.6 })
    );
    label.rotation.x = -Math.PI / 2; label.position.y = 0.017;
    g.add(label);
    g.castShadow = true;
    return g;
  }

  makeBatteryMesh() {
    const m = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.04, 0.16, 10),
      new THREE.MeshStandardMaterial({ color: 0x1c3a1c, roughness: 0.5, emissive: 0x123012, emissiveIntensity: 0.5 })
    );
    m.castShadow = true;
    return m;
  }

  makePanelMesh() {
    const g = new THREE.Group();
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.9, 0.18),
      new THREE.MeshStandardMaterial({ color: 0x2a2925, roughness: 0.6, metalness: 0.4 })
    );
    g.add(box);
    // indicador (rojo = apagado)
    const indicator = new THREE.Mesh(
      new THREE.CircleGeometry(0.06, 12),
      new THREE.MeshBasicMaterial({ color: 0xff2a1a })
    );
    indicator.position.set(0, 0.18, 0.1);
    g.add(indicator);
    // palanca
    const lever = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.22, 0.05),
      new THREE.MeshStandardMaterial({ color: 0x555049, metalness: 0.6, roughness: 0.4 })
    );
    lever.position.set(0, -0.15, 0.12); lever.rotation.x = 0.5;
    g.add(lever);
    g.userData.indicator = indicator;
    g.userData.lever = lever;
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    return g;
  }

  makeNoteMesh() {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(0.3, 0.42),
      new THREE.MeshStandardMaterial({ color: 0xb8ad88, roughness: 0.9, side: THREE.DoubleSide, emissive: 0x2a2618, emissiveIntensity: 0.3 })
    );
    return m;
  }

  makeRadioMesh() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 0.18, 0.16),
      new THREE.MeshStandardMaterial({ color: 0x2c2722, roughness: 0.7 })
    );
    g.add(body);
    const dial = new THREE.Mesh(
      new THREE.CircleGeometry(0.03, 10),
      new THREE.MeshBasicMaterial({ color: 0x6a5a2a })
    );
    dial.position.set(0.08, 0, 0.081);
    g.add(dial);
    g.castShadow = true;
    return g;
  }

  buildExit() {
    const g = new THREE.Group();
    const ex = this.map.itemSpawns.exit;
    const w = this.map.gridToWorld(ex.gx, ex.gz);

    // marco luminoso
    const frame = new THREE.Mesh(
      new THREE.PlaneGeometry(1.6, 2.6),
      new THREE.MeshBasicMaterial({ color: 0xfff4d0, side: THREE.DoubleSide })
    );
    frame.position.set(0, 1.3, 0);
    g.add(frame);

    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(0.9, 0.3),
      new THREE.MeshBasicMaterial({ color: 0x9fd1a8 })
    );
    sign.position.set(0, 2.5, 0.02);
    g.add(sign);

    const light = new THREE.PointLight(0xfff0c8, 0, 12, 2);
    light.position.set(0, 2, 0);
    g.add(light);

    g.position.set(w.x, 0, w.z);
    g.visible = false;
    this.group.add(g);
    this.exit = { group: g, light, gx: ex.gx, gz: ex.gz, revealed: false, worldPos: new THREE.Vector3(w.x, 0, w.z) };
  }

  revealExit() {
    if (!this.exit || this.exit.revealed) return;
    this.exit.revealed = true;
    this.exit.group.visible = true;
    this.exit.light.intensity = 6;
    this.state.escapeRouteRevealed = true;
  }

  // ---- Deteccion del interactuable mas cercano (proximidad + mirada) ----
  getNearestInteractable(playerPos, camera) {
    const range = 2.4;
    const camDir = new THREE.Vector3();
    camera.getWorldDirection(camDir);
    let best = null, bestScore = -Infinity;

    const consider = (worldPos, ref, label) => {
      const to = worldPos.clone().sub(playerPos);
      const dist = to.length();
      if (dist > range) return;
      to.normalize();
      const facing = to.dot(camDir);
      if (facing < 0.35) return; // debe estar mirandolo
      const score = facing - dist * 0.1;
      if (score > bestScore) { bestScore = score; best = { ref, label, dist }; }
    };

    for (const t of this.tapes) {
      if (t.collected) continue;
      consider(t.mesh.position, { type: 'tape', obj: t }, '[E] Recoger cinta VHS');
    }
    for (const b of this.batteries) {
      if (b.collected) continue;
      consider(b.mesh.position, { type: 'battery', obj: b }, '[E] Recoger pila');
    }
    for (const p of this.panels) {
      if (p.activated) continue;
      const wp = new THREE.Vector3(); p.grp.getWorldPosition(wp);
      consider(wp, { type: 'panel', obj: p }, `[E] Activar panel ${p.id + 1}`);
    }
    for (const n of this.notes) {
      consider(n.mesh.position, { type: 'note', obj: n }, '[E] Leer');
    }
    for (const r of this.radios) {
      const wp = new THREE.Vector3(); r.mesh.getWorldPosition(wp);
      consider(wp, { type: 'radio', obj: r }, '[E] Encender radio');
    }
    for (const l of this.lockers) {
      consider(l.pos, { type: 'locker', obj: l }, '[E] Esconderse');
    }
    if (this.exit && this.exit.revealed) {
      consider(this.exit.worldPos, { type: 'exit' }, '[E] SALIR');
    }
    return best;
  }

  /* Ejecuta la interaccion. Devuelve un descriptor para que Game aplique
     efectos de audio/UI/director. Modifica meshes y estado de progreso. */
  interact(ref) {
    switch (ref.type) {
      case 'tape': {
        const t = ref.obj;
        if (t.collected) return null;
        t.collected = true;
        t.mesh.visible = false;
        this.state.collectTape(t.id);
        if (this.audio) this.audio.playPickup();
        return { type: 'tape', id: t.id, tape: TAPE_TEXTS[t.id] };
      }
      case 'battery': {
        const b = ref.obj;
        if (b.collected) return null;
        b.collected = true;
        b.mesh.visible = false;
        if (this.audio) this.audio.playPickup();
        return { type: 'battery', amount: CONFIG.flashlight.batteryPerPickup };
      }
      case 'panel': {
        const p = ref.obj;
        if (p.activated) return null;
        p.activated = true;
        p.indicator.material.color.set(0x33ff66); // verde
        p.grp.userData.lever.rotation.x = -0.5;    // baja la palanca
        this.state.activatePanel(p.id);
        if (this.audio) this.audio.playPanel();
        return { type: 'panel', id: p.id };
      }
      case 'note': {
        return { type: 'note', text: ref.obj.text };
      }
      case 'radio': {
        if (this.audio) this.audio.playRadioInterference(3.0);
        return { type: 'radio' };
      }
      case 'locker': {
        return { type: 'locker', locker: ref.obj };
      }
      case 'exit': {
        return { type: 'exit' };
      }
    }
    return null;
  }

  update(dt, playerPos) {
    this.t += dt;
    // bob + rotacion de pickups para destacarlos
    for (const t of this.tapes) {
      if (t.collected) continue;
      t.mesh.rotation.y += dt * 0.8;
      t.mesh.position.y = t.baseY + Math.sin(this.t * 2 + t.id) * 0.04;
    }
    for (const b of this.batteries) {
      if (b.collected) continue;
      b.mesh.rotation.y += dt * 1.2;
      b.mesh.position.y = b.baseY + Math.sin(this.t * 2.2 + b.id) * 0.03;
    }
    // pulso del indicador de paneles apagados
    for (const p of this.panels) {
      if (p.activated) continue;
      const pulse = 0.5 + 0.5 * Math.sin(this.t * 4);
      p.indicator.material.color.setRGB(0.6 + pulse * 0.4, 0.1, 0.05);
    }
    // pulso de la salida
    if (this.exit && this.exit.revealed) {
      this.exit.light.intensity = 5 + Math.sin(this.t * 3) * 1.5;
    }
  }
}
