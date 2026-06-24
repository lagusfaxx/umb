/* ============================================================
   UMBRAL 09 - Generador de mapa liminal (semi-procedural)
   ------------------------------------------------------------
   - Laberinto por backtracker recursivo, por regiones.
   - 6 zonas con materiales/iluminacion propios.
   - Rejilla de colision (solid[x][z]) + puertas dinamicas.
   - El sector inundado queda tras puertas bloqueadas hasta el panel 2.
   - Geometria fusionada (merge) para bajar draw calls (rendimiento PC).
   ============================================================ */

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CONFIG, ZONE } from '../config.js';
import { getSharedTextures, staticTexture } from './Textures.js';

const T = CONFIG.map.tile;
const WALL_H = CONFIG.map.wallHeight;
const CEIL_H = CONFIG.map.ceilingHeight;

// Generador aleatorio reproducible (mulberry32)
function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class MapGenerator {
  constructor(scene, seed = null) {
    this.scene = scene;
    this.seed = seed == null ? Math.floor(Math.random() * 1e9) : seed;
    this.rng = makeRng(this.seed);

    // Disposicion de zonas: 3 columnas x 2 filas de regiones
    this.roomCols = 18;   // columnas de "habitaciones" del laberinto
    this.roomRows = 16;   // filas de habitaciones
    this.gridW = this.roomCols * 2 + 1;
    this.gridH = this.roomRows * 2 + 1;

    // Limites de banda en coordenadas de grid
    this.colBand = [12, 24];  // x < 12 -> col0; <24 -> col1; resto col2
    this.rowBand = [16];      // z < 16 -> row0; resto row1

    this.solid = [];          // [x][z] true = muro
    this.lightFixtures = [];  // luminarias de techo (parpadeo)
    this.doors = [];          // puertas dinamicas
    this.tvs = [];            // televisores antiguos (eventos)
    this.blocked = new Set(); // celdas bloqueadas por puertas cerradas
    this.floodedLocked = true; // el sector inundado empieza sellado
    this.itemSpawns = { tapes: [], panels: [], batteries: [], exit: null };

    this.group = new THREE.Group();
    this.group.name = 'map';
    scene.add(this.group);

    this.tex = getSharedTextures();
    this.t = 0; // tiempo acumulado para animaciones
  }

  // ---- Conversiones grid <-> mundo (centro de celda) ----
  gridToWorld(gx, gz) {
    return { x: (gx - this.gridW / 2 + 0.5) * T, z: (gz - this.gridH / 2 + 0.5) * T };
  }
  worldToGrid(x, z) {
    return {
      gx: Math.floor(x / T + this.gridW / 2),
      gz: Math.floor(z / T + this.gridH / 2)
    };
  }

  zoneOfGrid(gx, gz) {
    const col = gx < this.colBand[0] ? 0 : gx < this.colBand[1] ? 1 : 2;
    const row = gz < this.rowBand[0] ? 0 : 1;
    const table = [
      [ZONE.YELLOW_HALLS, ZONE.MAINTENANCE],
      [ZONE.OFFICES, ZONE.FLOODED],
      [ZONE.TV_ROOM, ZONE.CORRUPT]
    ];
    return table[col][row];
  }

  // Colision: muro fijo o celda bloqueada por puerta
  isSolidWorld(x, z) {
    const { gx, gz } = this.worldToGrid(x, z);
    if (gx < 0 || gz < 0 || gx >= this.gridW || gz >= this.gridH) return true;
    if (this.blocked.has(gx + ',' + gz)) return true;
    return this.solid[gx][gz];
  }
  isSolidGrid(gx, gz) {
    if (gx < 0 || gz < 0 || gx >= this.gridW || gz >= this.gridH) return true;
    if (this.blocked.has(gx + ',' + gz)) return true;
    return this.solid[gx][gz];
  }

  // Linea de vision entre dos puntos del mundo (muestreo sobre la rejilla)
  lineOfSight(x0, z0, x1, z1) {
    const dx = x1 - x0, dz = z1 - z0;
    const dist = Math.hypot(dx, dz);
    const steps = Math.ceil(dist / (T * 0.5));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (this.isSolidWorld(x0 + dx * t, z0 + dz * t)) return false;
    }
    return true;
  }

  // ------------------------------------------------------------
  // GENERACION
  // ------------------------------------------------------------
  generate() {
    // 1) Todo solido
    for (let x = 0; x < this.gridW; x++) {
      this.solid[x] = new Array(this.gridH).fill(true);
    }

    // 2) Definir regiones (en coordenadas de habitacion)
    //    cols: [0-5][6-11][12-17]  rows: [0-7][8-15]
    const regions = [
      { zone: ZONE.YELLOW_HALLS, c0: 0, c1: 5, r0: 0, r1: 7, open: 0.05 },
      { zone: ZONE.OFFICES, c0: 6, c1: 11, r0: 0, r1: 7, open: 0.5 },
      { zone: ZONE.TV_ROOM, c0: 12, c1: 17, r0: 0, r1: 7, open: 0.45 },
      { zone: ZONE.MAINTENANCE, c0: 0, c1: 5, r0: 8, r1: 15, open: 0.0 },
      { zone: ZONE.FLOODED, c0: 6, c1: 11, r0: 8, r1: 15, open: 0.4 },
      { zone: ZONE.CORRUPT, c0: 12, c1: 17, r0: 8, r1: 15, open: 0.3 }
    ];
    this.regions = {};
    for (const reg of regions) {
      this.carveRegion(reg);
      this.regions[reg.zone] = reg;
    }

    // 3) Conexiones entre regiones (puertas)
    //    Estructura conexa sin el sector inundado:
    this.connectRooms(5, 3, 6, 3);    // TL <-> TM
    this.connectRooms(11, 4, 12, 4);  // TM <-> TR
    this.connectRooms(2, 7, 2, 8);    // TL <-> MAINT
    this.connectRooms(14, 7, 14, 8);  // TR <-> CORRUPT
    this.connectRooms(8, 2, 8, 1);    // refuerzo interno TM
    this.connectRooms(4, 11, 4, 12);  // refuerzo interno MAINT

    // 4) Puertas BLOQUEADAS hacia el sector inundado (se abren con panel 2)
    this.floodDoors = [];
    this.floodDoors.push(this.connectRooms(8, 7, 8, 8, true));   // OFFICES -> FLOODED
    this.floodDoors.push(this.connectRooms(5, 11, 6, 11, true)); // MAINT -> FLOODED

    // 5) Indexar celdas de piso por zona (para spawns)
    this.floorByZone = {};
    for (const k of Object.values(ZONE)) this.floorByZone[k] = [];
    for (let x = 1; x < this.gridW - 1; x++) {
      for (let z = 1; z < this.gridH - 1; z++) {
        if (!this.solid[x][z]) {
          const zone = this.zoneOfGrid(x, z);
          this.floorByZone[zone].push([x, z]);
        }
      }
    }

    // 6) Punto de aparicion en pasillos amarillos
    const sp = this.gridToWorld(5, 7);
    this.spawn = new THREE.Vector3(sp.x, CONFIG.player.height, sp.z);
    this.spawnAngle = Math.PI; // mirando hacia -Z (interior del mapa)

    // 7) Construir geometria y luces
    this.buildGeometry();
    this.placeLightFixtures();
    this.placeObjectiveSpawns();
    this.scatterProps();
    this.addDynamicDoors();

    return this;
  }

  // Backtracker recursivo dentro de una region (subred de habitaciones)
  carveRegion(reg) {
    const { c0, c1, r0, r1 } = reg;
    const visited = new Set();
    const key = (c, r) => c + '_' + r;
    const stack = [[c0, r0]];
    visited.add(key(c0, r0));
    // habitacion inicial a piso
    let g = this.roomToGrid(c0, r0);
    this.solid[g.x][g.z] = false;

    const dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]];
    while (stack.length) {
      const [c, r] = stack[stack.length - 1];
      // vecinos no visitados
      const opts = [];
      for (const [dc, dr] of dirs) {
        const nc = c + dc, nr = r + dr;
        if (nc < c0 || nc > c1 || nr < r0 || nr > r1) continue;
        if (visited.has(key(nc, nr))) continue;
        opts.push([nc, nr, dc, dr]);
      }
      if (opts.length === 0) { stack.pop(); continue; }
      const [nc, nr, dc, dr] = opts[Math.floor(this.rng() * opts.length)];
      visited.add(key(nc, nr));
      // abrir habitacion destino + muro intermedio
      const gd = this.roomToGrid(nc, nr);
      this.solid[gd.x][gd.z] = false;
      const wx = (this.roomToGrid(c, r).x + gd.x) / 2;
      const wz = (this.roomToGrid(c, r).z + gd.z) / 2;
      this.solid[wx][wz] = false;
      stack.push([nc, nr]);
    }

    // Aperturas extra: quitar muros interiores para crear salas abiertas
    if (reg.open > 0) {
      for (let c = c0; c < c1; c++) {
        for (let r = r0; r <= r1; r++) {
          if (this.rng() < reg.open) {
            const a = this.roomToGrid(c, r), b = this.roomToGrid(c + 1, r);
            this.solid[(a.x + b.x) / 2][a.z] = false;
          }
        }
      }
      for (let c = c0; c <= c1; c++) {
        for (let r = r0; r < r1; r++) {
          if (this.rng() < reg.open) {
            const a = this.roomToGrid(c, r), b = this.roomToGrid(c, r + 1);
            this.solid[a.x][(a.z + b.z) / 2] = false;
          }
        }
      }
    }
  }

  roomToGrid(c, r) {
    return { x: c * 2 + 1, z: r * 2 + 1 };
  }

  // Carva el muro entre dos habitaciones adyacentes. Si locked, queda bloqueado.
  connectRooms(c1, r1, c2, r2, locked = false) {
    const a = this.roomToGrid(c1, r1);
    const b = this.roomToGrid(c2, r2);
    const wx = (a.x + b.x) / 2;
    const wz = (a.z + b.z) / 2;
    this.solid[wx][wz] = false;       // hay piso ahi
    this.solid[a.x][a.z] = false;
    this.solid[b.x][b.z] = false;
    if (locked) this.blocked.add(wx + ',' + wz);
    return { gx: wx, gz: wz, locked };
  }

  // ------------------------------------------------------------
  // MATERIALES
  // ------------------------------------------------------------
  makeMaterials() {
    const t = this.tex;
    const m = {};
    m.wallpaper = new THREE.MeshStandardMaterial({
      map: t.wallpaper, normalMap: t.wallpaperN, normalScale: new THREE.Vector2(0.7, 0.7),
      roughness: 0.95, metalness: 0.0
    });
    m.carpet = new THREE.MeshStandardMaterial({
      map: t.carpet, normalMap: t.carpetN, normalScale: new THREE.Vector2(0.5, 0.5),
      roughness: 0.98, metalness: 0.0
    });
    m.ceiling = new THREE.MeshStandardMaterial({
      map: t.ceiling, normalMap: t.ceilingN, normalScale: new THREE.Vector2(0.4, 0.4),
      roughness: 0.9, metalness: 0.0
    });
    m.concrete = new THREE.MeshStandardMaterial({
      map: t.concrete, normalMap: t.concreteN, normalScale: new THREE.Vector2(0.8, 0.8),
      roughness: 0.95, metalness: 0.06
    });
    // Piso inundado: oscuro y "mojado" (baja rugosidad => brillos de linterna)
    m.flooded = new THREE.MeshStandardMaterial({
      map: t.carpet, normalMap: t.carpetN, normalScale: new THREE.Vector2(0.3, 0.3),
      color: 0x3a444c, roughness: 0.22, metalness: 0.15
    });
    m.corruptWall = new THREE.MeshStandardMaterial({
      map: t.wallpaper, normalMap: t.wallpaperN, normalScale: new THREE.Vector2(0.7, 0.7),
      color: 0x6b5e44, roughness: 0.97
    });
    return m;
  }

  zoneFloorMat(zone, mats) {
    if (zone === ZONE.FLOODED) return mats.flooded;
    if (zone === ZONE.MAINTENANCE) return mats.concrete;
    return mats.carpet;
  }
  zoneCeilMat(zone, mats) {
    if (zone === ZONE.MAINTENANCE || zone === ZONE.FLOODED) return mats.concrete;
    return mats.ceiling;
  }
  zoneWallMat(zone, mats) {
    if (zone === ZONE.MAINTENANCE || zone === ZONE.FLOODED) return mats.concrete;
    if (zone === ZONE.CORRUPT) return mats.corruptWall;
    return mats.wallpaper;
  }

  // ------------------------------------------------------------
  // GEOMETRIA (fusionada por material)
  // ------------------------------------------------------------
  buildGeometry() {
    const mats = this.makeMaterials();
    this.materials = mats;
    // Buckets de geometrias por material
    const buckets = new Map(); // material -> [geometries]
    const push = (mat, geo) => {
      if (!buckets.has(mat)) buckets.set(mat, []);
      buckets.get(mat).push(geo);
    };

    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (let x = 0; x < this.gridW; x++) {
      for (let z = 0; z < this.gridH; z++) {
        if (this.solid[x][z]) continue; // los muros se construyen desde el lado del piso
        const w = this.gridToWorld(x, z);
        const zone = this.zoneOfGrid(x, z);

        // Piso
        const f = new THREE.PlaneGeometry(T, T);
        f.rotateX(-Math.PI / 2); f.translate(w.x, 0, w.z);
        push(this.zoneFloorMat(zone, mats), f);
        // Techo
        const c = new THREE.PlaneGeometry(T, T);
        c.rotateX(Math.PI / 2); c.translate(w.x, CEIL_H, w.z);
        push(this.zoneCeilMat(zone, mats), c);

        // Muros: una cara plana por cada vecino solido (sin solapes ni z-fighting)
        for (const [dx, dz] of dirs) {
          const nx = x + dx, nz = z + dz;
          if (nx < 0 || nz < 0 || nx >= this.gridW || nz >= this.gridH || this.solid[nx][nz]) {
            push(this.zoneWallMat(zone, mats), this.makeWallFace(w.x, w.z, dx, dz));
          }
        }
      }
    }

    for (const [mat, geos] of buckets) {
      if (geos.length === 0) continue;
      const merged = mergeGeometries(geos, false);
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);
    }
  }

  // Cara de muro orientada hacia la celda de piso, con UV repetido (mejor detalle)
  makeWallFace(wx, wz, dx, dz) {
    const repeatU = T / 2; // el papel se repite cada 2m a lo ancho
    const g = new THREE.PlaneGeometry(T, WALL_H);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * repeatU);
    uv.needsUpdate = true;
    if (dx === 1) { g.rotateY(-Math.PI / 2); g.translate(wx + T / 2, WALL_H / 2, wz); }
    else if (dx === -1) { g.rotateY(Math.PI / 2); g.translate(wx - T / 2, WALL_H / 2, wz); }
    else if (dz === 1) { g.rotateY(Math.PI); g.translate(wx, WALL_H / 2, wz + T / 2); }
    else { g.translate(wx, WALL_H / 2, wz - T / 2); }
    return g;
  }

  // ------------------------------------------------------------
  // LUMINARIAS DE TECHO (paneles emisivos + parpadeo)
  // ------------------------------------------------------------
  placeLightFixtures() {
    const fixtureGeo = new THREE.BoxGeometry(T * 0.55, 0.08, T * 0.18);
    // Material emisivo (se clona por luminaria para variar el parpadeo)
    for (let x = 1; x < this.gridW - 1; x += 1) {
      for (let z = 1; z < this.gridH - 1; z += 1) {
        if (this.solid[x][z]) continue;
        const zone = this.zoneOfGrid(x, z);
        // Densidad de luminarias por zona
        let chance = 0.32;
        if (zone === ZONE.MAINTENANCE) chance = 0.10;
        if (zone === ZONE.CORRUPT) chance = 0.14;
        if (zone === ZONE.FLOODED) chance = 0.16;
        if (this.rng() > chance) continue;

        const w = this.gridToWorld(x, z);
        const base = zone === ZONE.MAINTENANCE || zone === ZONE.CORRUPT ? 0.6 : 1.0;
        const mat = new THREE.MeshBasicMaterial({ color: 0xfff4d0 });
        const mesh = new THREE.Mesh(fixtureGeo, mat);
        mesh.position.set(w.x, CEIL_H - 0.06, w.z);
        this.group.add(mesh);

        this.lightFixtures.push({
          mesh, mat,
          pos: new THREE.Vector3(w.x, CEIL_H - 0.2, w.z),
          base,
          on: true,
          flickerPhase: this.rng() * 100,
          flickerRate: 0.4 + this.rng() * 2.0,
          broken: false,
          zone
        });
      }
    }
  }

  // ------------------------------------------------------------
  // SPAWNS DE OBJETIVOS (cintas, paneles, pilas, salida)
  // ------------------------------------------------------------
  placeObjectiveSpawns() {
    const used = new Set();
    const pick = (zone, minFromSpawn = 0) => {
      const list = this.floorByZone[zone];
      for (let tries = 0; tries < 200; tries++) {
        const cell = list[Math.floor(this.rng() * list.length)];
        const k = cell[0] + ',' + cell[1];
        if (used.has(k)) continue;
        const w = this.gridToWorld(cell[0], cell[1]);
        if (minFromSpawn > 0) {
          const d = Math.hypot(w.x - this.spawn.x, w.z - this.spawn.z);
          if (d < minFromSpawn) continue;
        }
        used.add(k);
        return { gx: cell[0], gz: cell[1], zone };
      }
      // fallback
      const cell = list[0];
      return { gx: cell[0], gz: cell[1], zone };
    };

    // 6 cintas, una por zona (la 5 en FLOODED requiere panel 2)
    this.itemSpawns.tapes = [
      { id: 0, ...pick(ZONE.YELLOW_HALLS, 14) },
      { id: 1, ...pick(ZONE.OFFICES) },
      { id: 2, ...pick(ZONE.TV_ROOM) },
      { id: 3, ...pick(ZONE.MAINTENANCE) },
      { id: 4, ...pick(ZONE.FLOODED) },
      { id: 5, ...pick(ZONE.CORRUPT) }
    ];

    // 3 paneles
    this.itemSpawns.panels = [
      { id: 0, ...pick(ZONE.YELLOW_HALLS, 10) },  // panel 1
      { id: 1, ...pick(ZONE.OFFICES) },           // panel 2 (abre inundado)
      { id: 2, ...pick(ZONE.CORRUPT) }            // panel 3 (salida + caza)
    ];

    // pilas repartidas
    const zones = Object.values(ZONE);
    for (let i = 0; i < CONFIG.objectives.batteryPickups; i++) {
      this.itemSpawns.batteries.push({ id: i, ...pick(zones[i % zones.length]) });
    }

    // salida en zona corrupta, lejos de todo
    this.itemSpawns.exit = pick(ZONE.CORRUPT, 0);
  }

  // ------------------------------------------------------------
  // PROPS (sillas, archivadores, cajas, TVs, maniquies, cables)
  // ------------------------------------------------------------
  scatterProps() {
    const propGroup = new THREE.Group();
    propGroup.name = 'props';
    this.group.add(propGroup);

    const placeOnFloor = (zone, builder, count, scaleJitter = true) => {
      const list = this.floorByZone[zone];
      for (let i = 0; i < count; i++) {
        const cell = list[Math.floor(this.rng() * list.length)];
        if (!cell) continue;
        const w = this.gridToWorld(cell[0], cell[1]);
        const obj = builder();
        // conserva la altura propia del prop (no la pisamos -> nada flotante/hundido)
        obj.position.x = w.x + (this.rng() - 0.5) * (T * 0.4);
        obj.position.z = w.z + (this.rng() - 0.5) * (T * 0.4);
        obj.rotation.y = this.rng() * Math.PI * 2;
        if (scaleJitter) {
          const s = 0.92 + this.rng() * 0.16;
          obj.scale.setScalar(s);
        }
        propGroup.add(obj);
      }
    };

    placeOnFloor(ZONE.OFFICES, () => this.makeChair(), 10);
    placeOnFloor(ZONE.OFFICES, () => this.makeCabinet(), 7);
    placeOnFloor(ZONE.OFFICES, () => this.makeBox(), 5);
    placeOnFloor(ZONE.YELLOW_HALLS, () => this.makeBox(), 5);
    placeOnFloor(ZONE.YELLOW_HALLS, () => this.makeChair(), 3);
    placeOnFloor(ZONE.TV_ROOM, () => this.makeTV(), 9, false);
    placeOnFloor(ZONE.TV_ROOM, () => this.makeChair(), 5);
    placeOnFloor(ZONE.MAINTENANCE, () => this.makeBox(), 6);
    placeOnFloor(ZONE.MAINTENANCE, () => this.makePipe(), 8, false);
    placeOnFloor(ZONE.CORRUPT, () => this.makeMannequin(), 6, false);
    placeOnFloor(ZONE.CORRUPT, () => this.makeChair(), 4);
    placeOnFloor(ZONE.FLOODED, () => this.makeBox(), 4);
    placeOnFloor(ZONE.FLOODED, () => this.makeCabinet(), 3);
  }

  makeChair() {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x2a2620, roughness: 0.9 });
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.5), mat);
    seat.position.y = 0.5; g.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.55, 0.08), mat);
    back.position.set(0, 0.78, -0.21); g.add(back);
    const legGeo = new THREE.BoxGeometry(0.06, 0.5, 0.06);
    for (const [dx, dz] of [[0.2, 0.2], [-0.2, 0.2], [0.2, -0.2], [-0.2, -0.2]]) {
      const leg = new THREE.Mesh(legGeo, mat);
      leg.position.set(dx, 0.25, dz); g.add(leg);
    }
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    return g;
  }

  makeCabinet() {
    const mat = new THREE.MeshStandardMaterial({ color: 0x3b3a36, roughness: 0.7, metalness: 0.3 });
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.4, 0.6), mat);
    m.position.y = 0.7;
    m.castShadow = true; m.receiveShadow = true;
    return m;
  }

  makeBox() {
    const mat = new THREE.MeshStandardMaterial({ color: 0x6a5634, roughness: 0.95 });
    const s = 0.4 + this.rng() * 0.3;
    const m = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), mat);
    m.position.y = s / 2;
    m.castShadow = true; m.receiveShadow = true;
    return m;
  }

  makePipe() {
    // tuberia apoyada en el suelo (horizontal), no flotando
    const mat = new THREE.MeshStandardMaterial({ color: 0x4a4640, roughness: 0.6, metalness: 0.5 });
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 2.6, 10), mat);
    m.rotation.z = Math.PI / 2;
    m.position.y = 0.13;
    m.castShadow = true; m.receiveShadow = true;
    return m;
  }

  makeTV() {
    const g = new THREE.Group();
    const body = new THREE.MeshStandardMaterial({ color: 0x1c1a17, roughness: 0.8 });
    // mueble/soporte apoyado en el suelo
    const stand = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.45, 0.45),
      new THREE.MeshStandardMaterial({ color: 0x241f18, roughness: 0.9 }));
    stand.position.y = 0.225; stand.castShadow = true; stand.receiveShadow = true; g.add(stand);
    // carcasa del televisor sobre el mueble
    const shell = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.6, 0.6), body);
    shell.position.y = 0.75; shell.castShadow = true; g.add(shell);
    const screenTex = staticTexture(128);
    const screenMat = new THREE.MeshStandardMaterial({
      map: screenTex, emissive: 0x9fb7c8, emissiveMap: screenTex, emissiveIntensity: 0.0, color: 0x000000
    });
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.42), screenMat);
    screen.position.set(0, 0.77, 0.31);
    g.add(screen);
    g.userData.tv = { screenMat, screenTex, on: false };
    this.tvs.push(g.userData.tv);
    return g;
  }

  makeMannequin() {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x9a9388, roughness: 0.7 });
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.7, 8), mat);
    torso.position.y = 1.0; g.add(torso);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), mat);
    head.position.y = 1.5; g.add(head);
    const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.12, 0.9, 8), mat);
    legs.position.y = 0.45; g.add(legs);
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; } });
    return g;
  }

  // ------------------------------------------------------------
  // PUERTAS DINAMICAS (algunas se cierran solas via Horror Director)
  // ------------------------------------------------------------
  addDynamicDoors() {
    const doorMat = new THREE.MeshStandardMaterial({ color: 0x4a4540, roughness: 0.7, metalness: 0.3 });
    // Puertas del sector inundado: persianas metalicas cerradas hasta panel 2
    for (const fd of this.floodDoors) {
      const w = this.gridToWorld(fd.gx, fd.gz);
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(T * 0.98, WALL_H, 0.25), doorMat.clone());
      mesh.material.color.set(0x5a4a3a);
      mesh.position.set(w.x, WALL_H / 2, w.z);
      // orienta segun el eje de la pared
      if (this.isSolidGrid(fd.gx - 1, fd.gz) || this.isSolidGrid(fd.gx + 1, fd.gz)) {
        mesh.rotation.y = Math.PI / 2;
      }
      mesh.castShadow = true; mesh.receiveShadow = true;
      this.group.add(mesh);
      this.doors.push({ mesh, gx: fd.gx, gz: fd.gz, locked: true, isFlood: true, open: false, closedY: WALL_H / 2 });
    }

    // Algunas puertas de pasillo que el director puede cerrar
    const candidates = [];
    for (let x = 2; x < this.gridW - 2; x++) {
      for (let z = 2; z < this.gridH - 2; z++) {
        if (this.solid[x][z]) continue;
        // celda con piso a izq/der y muros arriba/abajo => pasillo horizontal
        const corridorH = !this.solid[x - 1][z] && !this.solid[x + 1][z] && this.solid[x][z - 1] && this.solid[x][z + 1];
        const corridorV = !this.solid[x][z - 1] && !this.solid[x][z + 1] && this.solid[x - 1][z] && this.solid[x + 1][z];
        if (corridorH || corridorV) candidates.push([x, z, corridorV]);
      }
    }
    // elegir ~6 puertas
    for (let i = 0; i < 6 && candidates.length; i++) {
      const idx = Math.floor(this.rng() * candidates.length);
      const [gx, gz, vertical] = candidates.splice(idx, 1)[0];
      const w = this.gridToWorld(gx, gz);
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(T * 0.95, WALL_H * 0.98, 0.18), doorMat.clone());
      mesh.position.set(w.x, WALL_H / 2, w.z);
      if (vertical) mesh.rotation.y = Math.PI / 2;
      mesh.visible = false; // oculta hasta que se cierra
      mesh.castShadow = true;
      this.group.add(mesh);
      this.doors.push({ mesh, gx, gz, locked: false, isFlood: false, open: true, vertical });
    }
  }

  // Abre las persianas del sector inundado (panel 2)
  unlockFlooded() {
    this.floodedLocked = false;
    for (const d of this.doors) {
      if (d.isFlood) {
        d.locked = false;
        d.open = true;
        this.blocked.delete(d.gx + ',' + d.gz);
        d.targetY = WALL_H * 1.6; // sube la persiana
      }
    }
  }

  // Cierra una puerta de pasillo cerca de una posicion (evento de horror)
  closeRandomDoorNear(pos, maxDist = 22) {
    let best = null, bestD = Infinity;
    for (const d of this.doors) {
      if (d.isFlood || !d.open) continue;
      const w = this.gridToWorld(d.gx, d.gz);
      const dist = Math.hypot(w.x - pos.x, w.z - pos.z);
      // que no sea justo encima del jugador
      if (dist > 5 && dist < maxDist && dist < bestD) { bestD = dist; best = d; }
    }
    if (best) {
      best.open = false;
      best.mesh.visible = true;
      this.blocked.add(best.gx + ',' + best.gz);
      return this.gridToWorld(best.gx, best.gz);
    }
    return null;
  }

  // Refuerza luminarias (panel 1: enciende mas luces)
  setLightsBoosted(on) {
    for (const f of this.lightFixtures) {
      if (f.broken) continue;
      if (on && (f.zone === ZONE.MAINTENANCE || f.zone === ZONE.CORRUPT)) {
        f.base = 1.0;
      }
    }
  }

  // Rompe (apaga) una luminaria cerca de pos (evento)
  breakLightNear(pos, maxDist = 18) {
    let best = null, bestD = Infinity;
    for (const f of this.lightFixtures) {
      if (f.broken || !f.on) continue;
      const dist = f.pos.distanceTo(pos);
      if (dist < maxDist && dist < bestD) { bestD = dist; best = f; }
    }
    if (best) { best.broken = true; best.on = false; best.mat.color.setScalar(0.02); return best.pos.clone(); }
    return null;
  }

  // Enciende un TV cercano (evento)
  turnOnTVNear(pos, maxDist = 16) {
    let best = null, bestD = Infinity, bestG = null;
    this.group.traverse(o => {
      if (o.userData && o.userData.tv && !o.userData.tv.on) {
        const dist = o.getWorldPosition(new THREE.Vector3()).distanceTo(pos);
        if (dist < maxDist && dist < bestD) { bestD = dist; best = o.userData.tv; bestG = o; }
      }
    });
    if (best) {
      best.on = true;
      best.screenMat.emissiveIntensity = 1.0;
      return bestG.getWorldPosition(new THREE.Vector3());
    }
    return null;
  }

  // Devuelve una celda de piso aleatoria a cierta distancia del jugador (spawn entidad)
  randomFloorCellFar(fromWorld, minDist) {
    for (let i = 0; i < 300; i++) {
      const zoneKeys = Object.values(ZONE);
      const zone = zoneKeys[Math.floor(this.rng() * zoneKeys.length)];
      if (zone === ZONE.FLOODED && this.floodedLocked) continue; // evita zona aun sellada
      const list = this.floorByZone[zone];
      if (!list || !list.length) continue;
      const cell = list[Math.floor(this.rng() * list.length)];
      const w = this.gridToWorld(cell[0], cell[1]);
      if (Math.hypot(w.x - fromWorld.x, w.z - fromWorld.z) >= minDist) {
        return { gx: cell[0], gz: cell[1], world: new THREE.Vector3(w.x, 0, w.z) };
      }
    }
    return null;
  }

  // ------------------------------------------------------------
  // ACTUALIZACION (animacion de puertas, estatica de TVs)
  // ------------------------------------------------------------
  update(dt) {
    this.t += dt;
    // animar persianas que suben
    for (const d of this.doors) {
      if (d.targetY != null) {
        d.mesh.position.y += (d.targetY - d.mesh.position.y) * Math.min(1, dt * 2);
        if (Math.abs(d.mesh.position.y - d.targetY) < 0.05) d.targetY = null;
      }
    }
    // estatica de TVs encendidos: desplaza el offset del ruido (barato) + parpadeo
    for (const tv of this.tvs) {
      if (tv.on) {
        tv.screenTex.offset.set(Math.random(), Math.random());
        tv.screenMat.emissiveIntensity = 0.7 + Math.random() * 0.5;
      }
    }
  }
}
