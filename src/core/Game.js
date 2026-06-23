/* ============================================================
   UMBRAL 09 - Game (orquestador principal)
   ------------------------------------------------------------
   Une todos los sistemas: render, escena, iluminacion, post-
   procesado VHS, entrada de teclado/mouse, bucle principal,
   cordura, interaccion, eventos, victoria y muerte.
   ============================================================ */

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { CONFIG, PHASE, ZONE, ENTITY_STATE } from '../config.js';
import { GameState } from './GameState.js';
import { MapGenerator } from '../map/MapGenerator.js';
import { Player } from '../player/Player.js';
import { Flashlight } from '../player/Flashlight.js';
import { Entity } from '../entity/Entity.js';
import { StillFigures } from '../entity/StillFigures.js';
import { AudioSystem } from '../audio/AudioSystem.js';
import { Items } from '../items/Items.js';
import { HorrorDirector } from '../events/HorrorDirector.js';
import { VHSEffects } from '../postprocessing/VHSPass.js';
import { UI } from '../ui/UI.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Ajustes visuales por zona (ambiente, niebla, color)
const ZONE_LOOK = {
  [ZONE.YELLOW_HALLS]: { ambient: 0.50, fog: 0.045, color: 0x171206 },
  [ZONE.OFFICES]:      { ambient: 0.46, fog: 0.048, color: 0x14110a },
  [ZONE.TV_ROOM]:      { ambient: 0.40, fog: 0.050, color: 0x100f12 },
  [ZONE.MAINTENANCE]:  { ambient: 0.13, fog: 0.075, color: 0x070707 },
  [ZONE.FLOODED]:      { ambient: 0.22, fog: 0.055, color: 0x0a1013 },
  [ZONE.CORRUPT]:      { ambient: 0.14, fog: 0.070, color: 0x0b0705 }
};

export class Game {
  constructor(canvas, uiRoot, appEl) {
    this.canvas = canvas;
    this.appEl = appEl;
    this.phase = PHASE.MENU;
    this.time = 0;
    this.audioOn = true;

    // estado e interfaz
    this.state = new GameState();
    this.audio = new AudioSystem();
    this.ui = new UI(uiRoot);

    // entrada
    this.keys = { forward: false, back: false, left: false, right: false, run: false, crouch: false };
    this.currentInteract = null;
    this.idleTimer = 0;
    this.shakeAmp = 0;
    this.prevHuntActive = false;

    // vectores reutilizables
    this._eye = new THREE.Vector3();
    this._feet = new THREE.Vector3();
    this._camDir = new THREE.Vector3();
    this._tmp = new THREE.Vector3();

    this.setupRenderer();
    this.setupScene();
    this.setupPost();
    this.setupApparition();
    this.setupInput();
    this.setupUI();

    this.clock = new THREE.Clock();
    this.ui.showStart();
    this.renderLoop = this.renderLoop.bind(this);
    requestAnimationFrame(this.renderLoop);
    window.addEventListener('resize', () => this.onResize());
  }

  // ------------------------------------------------------------
  setupRenderer() {
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, CONFIG.render.pixelRatioCap));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
  }

  setupScene() {
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x120e07, 0.05);

    this.camera = new THREE.PerspectiveCamera(
      CONFIG.render.fov, window.innerWidth / window.innerHeight, CONFIG.render.near, CONFIG.render.far
    );
    this.scene.add(this.camera); // necesario para que la linterna (hija) se renderice

    // luz ambiente + hemisferica (base; el look plano lo dan los paneles emisivos)
    this.ambient = new THREE.AmbientLight(0xffe9c4, 0.45);
    this.scene.add(this.ambient);
    this.hemi = new THREE.HemisphereLight(0xfff0d0, 0x0a0905, 0.3);
    this.scene.add(this.hemi);

    // pool de luces puntuales que siguen a las luminarias cercanas al jugador
    this.lightPool = [];
    for (let i = 0; i < 6; i++) {
      const pl = new THREE.PointLight(0xfff0cc, 0, CONFIG.map.tile * 4.5, 2);
      pl.castShadow = false;
      this.scene.add(pl);
      this.lightPool.push(pl);
    }

    // contenedor del "mundo" (mapa/items/entidad) que se reconstruye cada partida
    this.world = new THREE.Group();
    this.scene.add(this.world);
  }

  setupPost() {
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.vhs = new VHSEffects(window.innerWidth, window.innerHeight);
    this.composer.addPass(this.vhs.pass);
    this.composer.addPass(new OutputPass()); // tonemapping + sRGB al final
  }

  // Silueta reutilizable para apariciones falsas (sombras que cruzan)
  setupApparition() {
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 1.2, 4, 8), mat);
    body.position.y = 1.5; g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), mat);
    head.position.y = 2.25; g.add(head);
    g.visible = false;
    this.scene.add(g);
    this.apparition = g;
    this.apparitionTimer = 0;
  }

  // ------------------------------------------------------------
  setupInput() {
    window.addEventListener('keydown', (e) => this.onKeyDown(e));
    window.addEventListener('keyup', (e) => this.onKeyUp(e));
    this.canvas.addEventListener('mousedown', (e) => { if (e.button === 0) this.onClick(); });
  }

  setupUI() {
    this.ui.onStart = () => this.start();
    this.ui.onResume = () => this.resume();
    this.ui.onRestart = () => this.restart();
    this.ui.onMenu = () => this.toMenu();
    this.ui.onToggleAudio = () => this.toggleAudio();
    this.ui.onEndingDone = () => this.toMenu();
  }

  // ------------------------------------------------------------
  // CICLO DE PARTIDA
  // ------------------------------------------------------------
  newRun() {
    // limpiar mundo anterior
    this.disposeGroup(this.world);
    // desconecta los controles anteriores (evita listeners duplicados que
    // multiplicarian la sensibilidad del mouse tras reiniciar)
    if (this.player) this.player.controls.dispose();
    // la linterna anterior era hija de la camara (persistente): quitarla
    if (this.flashlight) {
      this.camera.remove(this.flashlight.spot);
      this.camera.remove(this.flashlight.spot.target);
    }

    this.state.reset();

    // mapa
    this.map = new MapGenerator(this.world, CONFIG.map.seed);
    this.map.generate();

    // jugador + linterna
    this.player = new Player(this.camera, this.canvas, this.map, this.audio);
    this.player.controls.addEventListener('unlock', () => this.onUnlock());
    this.flashlight = new Flashlight(this.camera, this.scene);
    this.player.spawn(this.map.spawn, this.map.spawnAngle);
    this.camera.fov = CONFIG.render.fov;
    this.camera.updateProjectionMatrix();

    // entidad principal (acechador)
    this.entity = new Entity(this.world, this.map, this.audio, { variant: 'stalker' });
    this.entity.onCatch = () => this.die('caught');
    this.entity.onManifest = () => { this.vhs.spike(0.4); this.audio.playWhisper(); };

    // segundo mob: el reptante (despierta en la caza final, panel 3)
    this.crawler = new Entity(this.world, this.map, this.audio, { variant: 'crawler' });
    this.crawler.onCatch = () => this.die('caught');

    // figuras inmoviles ("no parpadees")
    this.stillFigures = new StillFigures(this.world, this.map, this.audio);
    this.stillFigures.build();
    this.stillFigures.onCatch = (pos) => this.die('figure', pos);

    this.prevHuntActive = false;
    this.apparition.visible = false;

    // objetos
    this.items = new Items(this.world, this.map, this.state, this.audio);
    this.items.build();

    // director del terror
    this.director = new HorrorDirector(this.map, this.audio, this.entity, this.state, {
      cameraShake: (a, t) => this.cameraShake(a, t),
      apparition: (pos) => this.spawnApparition(pos),
      subtitle: (txt) => this.ui.subtitle(txt),
      flickerNearbyLights: (pos, dur) => this.flickerNearbyLights(pos, dur),
      screamer: () => this.screamer(),
      getPlayerPos: () => this._feet.clone()
    });

    this.state.refreshObjective();
    this.idleTimer = 0;
    this.shakeAmp = 0;
  }

  start() {
    this.audio.init();
    this.audio.resume();
    this.setAudio(this.audioOn);
    this.newRun();
    this.phase = PHASE.PLAYING;
    this.ui.hideAll();
    this.ui.showHUD();
    this.appEl.classList.add('playing');
    this.audio.startAmbient();
    this.player.controls.lock();
  }

  restart() {
    this.ui.fadeToBlack(false);
    this.audio.stopHunt();
    this.start();
  }

  toMenu() {
    this.phase = PHASE.MENU;
    this.audio.stopHunt();
    this.audio.stopAmbient();
    this.setAudio(this.audioOn);
    this.ui.fadeToBlack(false);
    this.ui.hideAll();
    this.ui.showStart();
    this.appEl.classList.remove('playing');
    if (this.player && this.player.controls.isLocked) {
      this._ignoreUnlock = true;
      this.player.controls.unlock();
    }
  }

  pause() {
    if (this.phase !== PHASE.PLAYING) return;
    this.phase = PHASE.PAUSED;
    this.ui.showPause();
    this.appEl.classList.remove('playing');
    this.audio.suspend();
  }

  resume() {
    if (this.phase !== PHASE.PAUSED) return;
    this.ui.hidePause();
    this.phase = PHASE.PLAYING;
    this.appEl.classList.add('playing');
    this.audio.resume();
    this.player.controls.lock();
  }

  toggleAudio() {
    this.audioOn = !this.audioOn;
    this.setAudio(this.audioOn);
    this.ui.setAudioLabel(this.audioOn);
  }
  setAudio(on) {
    this.audio.setMasterVolume(on ? 0.85 : 0.0);
    this.ui.setAudioLabel(on);
  }

  // ------------------------------------------------------------
  // ENTRADA
  // ------------------------------------------------------------
  onKeyDown(e) {
    switch (e.code) {
      case 'KeyW': case 'ArrowUp': this.keys.forward = true; break;
      case 'KeyS': case 'ArrowDown': this.keys.back = true; break;
      case 'KeyA': case 'ArrowLeft': this.keys.left = true; break;
      case 'KeyD': case 'ArrowRight': this.keys.right = true; break;
      case 'ShiftLeft': case 'ShiftRight': this.keys.run = true; break;
      case 'ControlLeft': case 'ControlRight': case 'KeyC': this.keys.crouch = true; e.preventDefault(); break;
      case 'KeyE': if (!e.repeat) this.onInteractKey(); break;
      case 'KeyF': if (!e.repeat) this.onFlashlightKey(); break;
      case 'KeyR': if (!e.repeat) this.onReviewKey(); break;
      case 'Escape': if (!e.repeat) this.onEscape(); break;
    }
  }

  onKeyUp(e) {
    switch (e.code) {
      case 'KeyW': case 'ArrowUp': this.keys.forward = false; break;
      case 'KeyS': case 'ArrowDown': this.keys.back = false; break;
      case 'KeyA': case 'ArrowLeft': this.keys.left = false; break;
      case 'KeyD': case 'ArrowRight': this.keys.right = false; break;
      case 'ShiftLeft': case 'ShiftRight': this.keys.run = false; break;
      case 'ControlLeft': case 'ControlRight': case 'KeyC': this.keys.crouch = false; break;
    }
  }

  onInteractKey() {
    if (this.phase === PHASE.TAPE) { this.closeViewer(); return; }
    if (this.phase === PHASE.PLAYING && this.currentInteract) {
      this.doInteract(this.currentInteract.ref);
    }
  }

  onFlashlightKey() {
    if (this.phase !== PHASE.PLAYING) return;
    this.flashlight.toggle();
  }

  onReviewKey() {
    if (this.phase !== PHASE.PLAYING) return;
    this.ui.toast(this.state.refreshObjective());
  }

  onEscape() {
    if (this.phase === PHASE.TAPE) { this.closeViewer(); return; }
    if (this.phase === PHASE.PAUSED) { this.resume(); return; }
    if (this.phase === PHASE.PLAYING) { this.pause(); return; }
  }

  onClick() {
    if (this.phase === PHASE.PLAYING) {
      if (!this.player.controls.isLocked) { this.player.controls.lock(); return; }
      if (this.currentInteract) this.doInteract(this.currentInteract.ref);
    } else if (this.phase === PHASE.TAPE) {
      this.closeViewer();
    }
  }

  // PointerLockControls dispara 'unlock' (p.ej. al pulsar Esc) -> pausa
  onUnlock() {
    if (this._ignoreUnlock) { this._ignoreUnlock = false; return; }
    if (this.phase === PHASE.PLAYING) this.pause();
  }

  // ------------------------------------------------------------
  // INTERACCION
  // ------------------------------------------------------------
  doInteract(ref) {
    const result = this.items.interact(ref);
    if (!result) return;

    switch (result.type) {
      case 'tape':
        this.openTape(result.tape);
        this.director.onObjective();
        this.afterObjective();
        this.ui.toast('CINTA VHS RECUPERADA');
        break;
      case 'battery':
        this.flashlight.addBattery(result.amount);
        this.ui.toast('PILA · BATERIA RECARGADA');
        break;
      case 'panel':
        this.handlePanel(result.id);
        break;
      case 'note':
        this.openNote(result.text);
        break;
      case 'radio':
        this.ui.subtitle('...interferencia... una voz repite numeros...');
        break;
      case 'exit':
        this.win();
        break;
    }
  }

  handlePanel(id) {
    this.director.onObjective(25);
    if (id === 0) {
      this.map.setLightsBoosted(true);
      this.state.lightsBoosted = true;
      this.ui.toast('PANEL 1 · ENERGIA PARCIAL. LA ACTIVIDAD AUMENTA.');
    } else if (id === 1) {
      this.map.unlockFlooded();
      this.state.floodedUnlocked = true;
      this.ui.toast('PANEL 2 · EL SECTOR INUNDADO SE HA ABIERTO.');
    } else if (id === 2) {
      this.state.finalHuntStarted = true;
      this.ui.toast('PANEL 3 · LA SALIDA CEDE. ALGO DESPIERTA.');
      this.director.triggerFinalHunt();
      this.spawnCrawler();
      this.vhs.spike(0.9);
      this.cameraShake(0.4, 0.7);
      this.screamer();
    }
    this.afterObjective();
  }

  afterObjective() {
    this.state.refreshObjective();
    this.checkEscapeReveal();
  }

  checkEscapeReveal() {
    if (this.state.canEscape && this.items.exit && !this.items.exit.revealed) {
      this.items.revealExit();
      this.ui.toast('UNA SALIDA HA APARECIDO. NO TE DETENGAS.');
      this.director.onObjective(30);
    }
  }

  openTape(tape) {
    this._ignoreUnlock = true;
    this.player.controls.unlock();
    this.phase = PHASE.TAPE;
    this.appEl.classList.remove('playing');
    this.ui.showTape(tape);
    this._tapeStatic = this.audio.playStatic(120, 0.07);
  }

  openNote(text) {
    this._ignoreUnlock = true;
    this.player.controls.unlock();
    this.phase = PHASE.TAPE;
    this.appEl.classList.remove('playing');
    this.ui.showNote(text);
    this._tapeStatic = this.audio.playStatic(120, 0.04);
  }

  closeViewer() {
    this.ui.hideTapeViewer();
    if (this._tapeStatic) { try { this._tapeStatic.src.stop(); } catch (e) {} this._tapeStatic = null; }
    this.phase = PHASE.PLAYING;
    this.appEl.classList.add('playing');
    this.player.controls.lock();
  }

  // ------------------------------------------------------------
  // EFECTOS (callbacks para el director)
  // ------------------------------------------------------------
  cameraShake(amp, time) {
    this.shakeAmp = Math.max(this.shakeAmp, amp);
  }

  spawnApparition(pos) {
    // coloca la silueta en una celda cercana visible y la muestra un instante
    let chosen = null;
    for (let i = 0; i < 8; i++) {
      const cell = this.map.randomFloorCellFar(pos, 5);
      if (!cell) continue;
      if (this.map.lineOfSight(pos.x, pos.z, cell.world.x, cell.world.z)) { chosen = cell; break; }
      if (!chosen) chosen = cell;
    }
    if (!chosen) return;
    this.apparition.position.set(chosen.world.x, 0, chosen.world.z);
    this.apparition.rotation.y = Math.atan2(pos.x - chosen.world.x, pos.z - chosen.world.z);
    this.apparition.visible = true;
    this.apparitionTimer = 0.4 + Math.random() * 0.5;
    this.state.sanity = Math.max(0, this.state.sanity - 3);
    if (Math.random() < 0.5) this.audio.playWhisper();
  }

  flickerNearbyLights(pos, duration) {
    for (const f of this.map.lightFixtures) {
      if (f.broken) continue;
      if (f.pos.distanceTo(pos) < 12) f.forceFlickerUntil = this.time + duration;
    }
  }

  // ------------------------------------------------------------
  // BUCLE PRINCIPAL
  // ------------------------------------------------------------
  renderLoop() {
    requestAnimationFrame(this.renderLoop);
    const dt = Math.min(0.05, this.clock.getDelta());
    this.time += dt;

    if (this.phase === PHASE.PLAYING) {
      this.updatePlaying(dt);
    }

    // audio y postproceso se actualizan siempre (tambien en menus/pausa visual)
    this.audio.update(dt);
    const hunt = this.entity && this.entity.state === ENTITY_STATE.HUNT ? 1 : 0;
    this.vhs.update(dt, {
      sanity: this.state.sanity / 100,
      hunt,
      dead: this.phase === PHASE.DEAD
    });

    this.composer.render();
  }

  updatePlaying(dt) {
    // movimiento
    this.player.update(dt, this.keys);

    // posiciones del jugador (tras moverse)
    this.player.getEyePosition(this._eye);
    this._feet.set(this.player.position.x, 0, this.player.position.z);
    const g = this.map.worldToGrid(this.player.position.x, this.player.position.z);
    this.currentZone = this.map.zoneOfGrid(g.gx, g.gz);

    // iluminacion (calcula tambien nearestLitDist)
    this.updateLighting(dt);

    // direccion de la camara y oscuridad
    this.camera.getWorldDirection(this._camDir);
    const inDarkness = !this.flashlight.on && this.nearestLitDist > 6.5;

    // percepcion de cada criatura
    const mainP = this.entityPerception(this.entity);
    const crawlerActive = this.crawler && this.crawler.state !== ENTITY_STATE.DORMANT;
    const crawlerP = crawlerActive ? this.entityPerception(this.crawler) : null;
    const huntActive = this.entity.state === ENTITY_STATE.HUNT ||
      (crawlerActive && this.crawler.state === ENTITY_STATE.HUNT);

    // linterna (puede fallar segun actividad paranormal)
    const paranormal = clamp(
      (1 - this.state.sanity / 100) * 0.4 + this.director.tension / 100 * 0.35 +
      (huntActive ? 0.6 : 0) + (this.currentZone === ZONE.CORRUPT ? 0.2 : 0), 0, 1
    );
    this.flashlight.update(dt, paranormal);

    // entidad principal
    const perms = this.director.getEntityPermissions();
    this.entity.update(dt, {
      playerPos: this._feet,
      playerRunning: this.player.isRunning,
      flashlightPointing: mainP.flPointing,
      losToPlayer: mainP.los,
      aggression: perms.aggression,
      allowManifest: perms.allowManifest,
      allowHunt: perms.allowHunt
    });

    // reptante (cuando esta activo siempre persigue)
    if (crawlerActive) {
      this.crawler.update(dt, {
        playerPos: this._feet,
        playerRunning: this.player.isRunning,
        flashlightPointing: crawlerP.flPointing,
        losToPlayer: crawlerP.los,
        aggression: 1,
        allowManifest: false,
        allowHunt: true
      });
    }

    this.updateThreatAudio(huntActive);

    // FOV extra durante la caza
    if (huntActive) this.player.applyFovToward(CONFIG.render.fovHunt, dt, 3);

    // figuras inmoviles ("no parpadees")
    this.stillFigures.update(dt, { eye: this._eye, feet: this._feet, camDir: this._camDir });

    // director del terror
    const inSafeZone = !inDarkness &&
      (this.currentZone === ZONE.YELLOW_HALLS || this.currentZone === ZONE.OFFICES || this.currentZone === ZONE.TV_ROOM) &&
      this.entity.distanceToPlayer > 22 && !huntActive;
    this.director.update(dt, {
      playerPos: this._feet,
      camera: this.camera,
      inDarkness,
      isMoving: this.player.isMoving,
      isRunning: this.player.isRunning,
      zone: this.currentZone,
      entityState: this.entity.state,
      entityDist: this.entity.distanceToPlayer,
      inSafeZone
    });

    // objetos + mapa
    this.items.update(dt, this._feet);
    this.map.update(dt);

    // cordura
    const lookingAtEntity = mainP.looking || (crawlerP && crawlerP.looking);
    this.updateSanity(dt, { inDarkness, lookingAtEntity });

    // latido cardiaco + ambiente por zona
    this.updateHeartbeatAndZone(huntActive);

    // aparicion temporal
    if (this.apparition.visible) {
      this.apparitionTimer -= dt;
      if (this.apparitionTimer <= 0) this.apparition.visible = false;
    }

    // interaccion + progreso
    this.updateInteractionPrompt();
    this.checkEscapeReveal();
    this.checkExitReached();

    // temblor de camara (tras fijar la posicion de la camara)
    this.applyCameraShake(dt);

    // HUD + tiempo
    this.state.elapsed += dt;
    this.updateHUD();
  }

  // ------------------------------------------------------------
  // Percepcion de una criatura: linea de vista, mirada y linterna encima
  entityPerception(e) {
    const out = { los: false, looking: false, flPointing: false };
    if (e.state === ENTITY_STATE.DORMANT) return out;
    out.los = this.map.lineOfSight(this._eye.x, this._eye.z, e.position.x, e.position.z);
    if (out.los) {
      const h = e.eyeHeight || 1.5;
      this._tmp.set(e.position.x, h, e.position.z);
      out.flPointing = this.flashlight.isPointingAt(this._tmp);
      if (e.mesh.visible) {
        const to = this._tmp.clone().sub(this._eye);
        const dist = to.length();
        to.normalize();
        if (dist < 36 && this._camDir.dot(to) > 0.55) out.looking = true;
      }
    }
    return out;
  }

  // ------------------------------------------------------------
  updateLighting(dt) {
    const fixtures = this.map.lightFixtures;
    const lowSan = 1 - this.state.sanity / 100;
    const flickBoost = lowSan * 0.5 + this.director.tension / 100 * 0.3;

    let nearest = Infinity;
    // recoge candidatas para el pool (encendidas y cercanas)
    this._poolCandidates = this._poolCandidates || [];
    const cand = this._poolCandidates;
    cand.length = 0;

    for (const f of fixtures) {
      if (f.broken) { f.mat.color.setScalar(0.02); f.currentLevel = 0; continue; }

      let level = f.base * (0.86 + 0.14 * Math.sin(this.time * f.flickerRate + f.flickerPhase));
      // parpadeo aleatorio (mas con baja cordura/alta tension)
      if (Math.random() < 0.008 + flickBoost * 0.05) level *= 0.18 + Math.random() * 0.3;
      // parpadeo forzado por evento
      if (f.forceFlickerUntil && this.time < f.forceFlickerUntil) {
        level *= (Math.random() < 0.5) ? 0.1 : 0.6;
      }
      f.currentLevel = level;
      f.mat.color.setRGB(level, level * 0.96, level * 0.82);

      const d = f.pos.distanceTo(this._eye);
      if (d < nearest) nearest = d;
      if (d < 20) cand.push({ f, d });
    }
    this.nearestLitDist = nearest;

    // asigna el pool a las luminarias encendidas mas cercanas
    cand.sort((a, b) => a.d - b.d);
    for (let i = 0; i < this.lightPool.length; i++) {
      const pl = this.lightPool[i];
      const c = cand[i];
      if (c) {
        pl.position.copy(c.f.pos);
        pl.intensity = 11 * c.f.currentLevel;
      } else {
        pl.intensity = 0;
      }
    }

    // ambiente y niebla objetivo segun zona
    const look = ZONE_LOOK[this.currentZone] || ZONE_LOOK[ZONE.YELLOW_HALLS];
    const huntExtra = this.entity.state === ENTITY_STATE.HUNT ? 0.02 : 0;
    this.ambient.intensity += (look.ambient - this.ambient.intensity) * Math.min(1, 2 * dt);
    this.scene.fog.density += (look.fog + huntExtra - this.scene.fog.density) * Math.min(1, 1.5 * dt);
    this._fogColor = this._fogColor || new THREE.Color();
    this._fogColor.setHex(look.color);
    this.scene.fog.color.lerp(this._fogColor, Math.min(1, 1.5 * dt));
    this.renderer.setClearColor(this.scene.fog.color, 1);
  }

  // ------------------------------------------------------------
  updateSanity(dt, ctx) {
    const s = CONFIG.sanity;
    let drain = 0;
    if (ctx.inDarkness) drain += s.darknessDrain;
    if (ctx.lookingAtEntity) drain += s.stareDrain;
    if (this.currentZone === ZONE.CORRUPT) drain += s.corruptZoneDrain;

    if (!this.player.isMoving) {
      this.idleTimer += dt;
      if (this.idleTimer > s.idleTimeBeforeDrain) drain += s.idleDrain;
    } else {
      this.idleTimer = 0;
    }

    if (drain > 0) {
      this.state.sanity -= drain * dt;
    } else if ((this.flashlight.on || this.nearestLitDist < 5) && this.player.isMoving) {
      this.state.sanity += s.regen * dt;
    }
    this.state.sanity = clamp(this.state.sanity, 0, s.max);

    this.audio.setSanity(this.state.sanity / 100);
    this.ui.setSanityVignette(1 - this.state.sanity / 100);

    // susurros extra y sombras falsas con baja cordura
    if (this.state.sanity < 35) {
      if (Math.random() < 0.004) this.audio.playWhisper();
      if (Math.random() < 0.0015) this.spawnApparition(this._feet);
    }

    if (this.state.sanity <= 0) this.die('sanity');
  }

  // ------------------------------------------------------------
  // Audio/efectos de amenaza segun el flanco de subida/bajada de la caza
  updateThreatAudio(huntActive) {
    if (huntActive && !this.prevHuntActive) {
      this.audio.startHunt();
      this.vhs.spike(0.5);
      this.cameraShake(0.25, 0.5);
      this.ui.subtitle('algo viene por ti');
    } else if (!huntActive && this.prevHuntActive) {
      this.audio.stopHunt();
    }
    this.prevHuntActive = huntActive;

    if (huntActive) {
      let nearest = Infinity;
      if (this.entity.state === ENTITY_STATE.HUNT) nearest = Math.min(nearest, this.entity.distanceToPlayer);
      if (this.crawler && this.crawler.state === ENTITY_STATE.HUNT) nearest = Math.min(nearest, this.crawler.distanceToPlayer);
      const prox = clamp(1 - nearest / 20, 0, 1);
      this.shakeAmp = Math.max(this.shakeAmp, 0.015 + prox * 0.06);
    }
  }

  // Latido cardiaco segun cercania de amenazas / cordura baja + ambiente de zona
  updateHeartbeatAndZone(huntActive) {
    let nearest = Infinity;
    if (this.entity.state !== ENTITY_STATE.DORMANT) nearest = Math.min(nearest, this.entity.distanceToPlayer);
    if (this.crawler && this.crawler.state !== ENTITY_STATE.DORMANT) nearest = Math.min(nearest, this.crawler.distanceToPlayer);
    const prox = clamp(1 - nearest / 16, 0, 1);
    const lowSan = clamp((40 - this.state.sanity) / 40, 0, 1);
    this.audio.setHeartbeat(Math.max(prox, lowSan * 0.7, huntActive ? 0.7 : 0));
    this.audio.setZone(this.currentZone);
  }

  // Despierta al reptante (caza final)
  spawnCrawler() {
    if (!this.crawler) return;
    this.crawler.spawnStalk(this._feet);
    this.crawler.setState(ENTITY_STATE.HUNT);
  }

  // Screamer ambiental (cara + grito) durante el juego
  screamer() {
    if (this.phase !== PHASE.PLAYING) return;
    this.ui.showScreamer(CONFIG.screamer.durationMs);
    this.audio.playScream();
    this.vhs.spike(0.9);
    this.cameraShake(0.4, 0.5);
    this.state.sanity = Math.max(0, this.state.sanity - 8);
  }

  applyCameraShake(dt, ctx) {
    if (this.shakeAmp > 0.0005) {
      this.camera.position.x += (Math.random() - 0.5) * this.shakeAmp;
      this.camera.position.y += (Math.random() - 0.5) * this.shakeAmp;
      this.camera.position.z += (Math.random() - 0.5) * this.shakeAmp;
      this.shakeAmp *= Math.exp(-dt * 5);
    }
  }

  // ------------------------------------------------------------
  updateInteractionPrompt() {
    const best = this.items.getNearestInteractable(this._feet, this.camera);
    this.currentInteract = best;
    this.ui.showInteract(best ? best.label : null);
  }

  checkExitReached() {
    const ex = this.items.exit;
    if (ex && ex.revealed) {
      const d = Math.hypot(ex.worldPos.x - this._feet.x, ex.worldPos.z - this._feet.z);
      if (d < 1.6) this.win();
    }
  }

  formatTimecode(t) {
    const h = String(Math.floor(t / 3600)).padStart(2, '0');
    const m = String(Math.floor((t % 3600) / 60)).padStart(2, '0');
    const s = String(Math.floor(t % 60)).padStart(2, '0');
    return `${h}:${m}:${s}`;
  }

  updateHUD() {
    this.ui.setHUD({
      battery: this.flashlight.battery,
      batteryLow: this.flashlight.isLow,
      objective: this.state.objectiveText,
      tapes: this.state.tapesFound,
      totalTapes: CONFIG.objectives.totalTapes,
      panels: this.state.panelsActivated,
      totalPanels: CONFIG.objectives.totalPanels,
      timecode: this.formatTimecode(this.state.elapsed)
    });
  }

  // ------------------------------------------------------------
  // MUERTE
  // ------------------------------------------------------------
  die(reason, pos) {
    if (this.phase === PHASE.DEAD || this.phase === PHASE.WON) return;
    this.phase = PHASE.DEAD;
    this.audio.stopHunt();
    this.audio.setHeartbeat(0);
    this.ui.showScreamer(950);   // cara a pantalla completa
    this.audio.playScream();
    this.vhs.spike(1.0);
    this.shakeAmp = 0.5;
    this.appEl.classList.remove('playing');

    // bloquea la camara hacia el causante de la muerte
    let look = null;
    if (reason === 'caught') {
      const e = (this.crawler && this.crawler.state === ENTITY_STATE.HUNT &&
        this.crawler.distanceToPlayer < this.entity.distanceToPlayer) ? this.crawler : this.entity;
      e.mesh.visible = true;
      look = e.position;
    } else if (reason === 'figure' && pos) {
      look = pos;
    }
    if (look) this.camera.lookAt(look.x, 1.6, look.z);

    this._ignoreUnlock = true;
    if (this.player.controls.isLocked) this.player.controls.unlock();

    setTimeout(() => this.ui.fadeToBlack(true), 950);
    setTimeout(() => { this.ui.fadeToBlack(false); this.ui.showDeath(); }, 2000);
  }

  // ------------------------------------------------------------
  // VICTORIA / FINAL
  // ------------------------------------------------------------
  win() {
    if (this.phase === PHASE.WON || this.phase === PHASE.DEAD) return;
    this.phase = PHASE.WON;
    // "se corta el sonido"
    this.audio.stopHunt();
    this.audio.setHeartbeat(0);
    this.audio.playStatic(0.5, 0.2);
    this.audio.stopAmbient();
    this.audio.setMasterVolume(0.0);
    this.vhs.spike(1.0);
    this.appEl.classList.remove('playing');

    this._ignoreUnlock = true;
    if (this.player.controls.isLocked) this.player.controls.unlock();

    setTimeout(() => this.ui.showEnding(), 1400);
  }

  // ------------------------------------------------------------
  onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.vhs.setSize(w, h);
  }

  // Libera geometrias/materiales del grupo (no toca texturas compartidas)
  disposeGroup(group) {
    for (let i = group.children.length - 1; i >= 0; i--) {
      const child = group.children[i];
      child.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          mats.forEach(m => m.dispose());
        }
      });
      group.remove(child);
    }
  }
}
