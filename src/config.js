/* ============================================================
   UMBRAL 09 - Configuracion global
   Constantes ajustables del juego (balance, render, mapa).
   Centralizar aqui facilita el tuneo sin tocar la logica.
   ============================================================ */

export const CONFIG = {
  // ---- Render ----
  render: {
    fov: 72,                 // FOV base de la camara
    fovRun: 80,              // FOV al correr (aumenta levemente)
    fovHunt: 88,             // FOV durante la caza
    near: 0.05,
    far: 90,
    pixelRatioCap: 1.6,      // limita devicePixelRatio para rendimiento en PC
    shadowMapSize: 1024
  },

  // ---- Jugador ----
  player: {
    height: 1.7,             // altura de ojos de pie (m)
    crouchHeight: 1.0,       // altura agachado
    radius: 0.34,            // radio de colision
    walkSpeed: 2.7,          // m/s
    runSpeed: 5.0,           // m/s con Shift
    crouchSpeed: 1.4,        // m/s agachado
    accel: 12,               // aceleracion
    friction: 9,             // friccion (desaceleracion)
    staminaMax: 100,
    staminaDrain: 22,        // por segundo corriendo
    staminaRegen: 13,        // por segundo descansando
    staminaRunThreshold: 12, // no puedes correr por debajo de esto
    headBobSpeed: 9.5,
    headBobAmount: 0.045,
    mouseSensitivity: 0.0022
  },

  // ---- Linterna ----
  flashlight: {
    batteryMax: 100,
    drainPerSecond: 1.7,     // consumo con linterna encendida
    batteryPerPickup: 45,    // recarga por pila recogida
    lowThreshold: 22,        // por debajo: parpadeo
    intensity: 20,           // candelas (sistema de luces fisico de three)
    distance: 20,
    angle: 0.46,             // radianes (semiangulo del cono)
    penumbra: 0.55
  },

  // ---- Cordura (atmosferica, NO letal: solo afecta visuales/audio) ----
  sanity: {
    max: 100,
    start: 100,
    darknessDrain: 1.6,      // por seg en oscuridad total
    stareDrain: 3.0,         // por seg mirando al acechador
    idleDrain: 0.6,          // por seg quieto demasiado tiempo
    corruptZoneDrain: 2.0,   // por seg en zona corrupta
    regen: 2.2,              // por seg en condiciones seguras (con luz, moviendose)
    idleTimeBeforeDrain: 12  // seg quieto antes de empezar a drenar
  },

  // ---- Entidad (acechador con vista + oido; patrulla -> sospecha -> caza) ----
  entity: {
    patrolSpeed: 1.5,
    searchSpeed: 2.4,
    huntSpeed: 4.3,           // < runSpeed (5.0): puedes escapar corriendo
    catchRadius: 1.5,         // te alcanza durante la persecucion
    sightRange: 14,           // alcance de vision base
    sightRangeLitBonus: 7,    // +alcance si llevas la linterna encendida
    sightConeDot: 0.30,       // cos del semiangulo de vision (~72 grados)
    peripheralDist: 3.5,      // a esta distancia te ve aunque no te apunte
    hearRunRadius: 16,        // te oye si corres dentro de este radio
    detectionRise: 1.8,       // subida de deteccion mientras te ve (por seg)
    detectionRiseChase: 3.0,
    detectionHear: 0.9,
    detectionFall: 0.6,       // bajada de deteccion sin verte
    chaseThreshold: 0.85,     // deteccion para iniciar la caza
    searchThreshold: 0.35,    // deteccion para ir a investigar
    searchTime: 9,            // seg buscando antes de volver a patrullar
    loseSightTime: 5.0,       // seg sin verte en caza antes de buscar
    repathInterval: 0.3,
    spawnMinDistance: 24,     // aparece lejos al empezar
    headTwitchChance: 0.02
  },

  // ---- Esconderse (casilleros) ----
  hiding: {
    lockerCount: 16,          // casilleros repartidos por el mapa
    seenCloseDist: 8          // si te ve esconderte a < esto, te encuentra
  },

  // ---- Screamers (sustos directos: cara + sonido). Sin abusar. ----
  screamer: {
    cooldown: 26,            // seg minimos entre screamers ambientales
    durationMs: 600,         // duracion del flash de la cara
    minTensionAmbient: 80    // tension minima para un screamer ambiental
  },

  // ---- Horror Director (tension 0..100) ----
  director: {
    tensionMax: 100,
    baseDecay: 1.6,          // la tension baja sola por seg
    objectiveBoost: 18,      // sube al cumplir objetivo
    darknessRate: 2.2,       // sube por seg en oscuridad
    runRate: 1.4,            // sube por seg corriendo
    idleRate: 1.1,           // sube por seg quieto
    eventCheckInterval: 4.0, // cada cuanto evalua disparar evento
    huntTensionThreshold: 82 // umbral para que pueda iniciar caza
  },

  // ---- Mapa ----
  map: {
    tile: 4.0,               // tamano de cada celda en el mundo (m)
    cols: 18,                // celdas de laberinto a lo ancho
    rows: 18,                // celdas de laberinto a lo alto
    wallHeight: 3.2,
    ceilingHeight: 3.2,
    seed: null               // null = aleatorio; o un numero para reproducible
  },

  // ---- Objetivos ----
  objectives: {
    totalTapes: 6,
    totalPanels: 3,
    batteryPickups: 8
  }
};

// Tipos de zona del mapa liminal
export const ZONE = {
  YELLOW_HALLS: 'yellow_halls',
  OFFICES: 'offices',
  TV_ROOM: 'tv_room',
  FLOODED: 'flooded',
  MAINTENANCE: 'maintenance',
  CORRUPT: 'corrupt'
};

// Estados de la entidad
export const ENTITY_STATE = {
  PATROL: 'patrol',   // ronda el mapa con calma
  SEARCH: 'search',   // oyo/medio vio algo: investiga
  CHASE: 'chase'      // te detecto: persecucion
};

// Fases del juego
export const PHASE = {
  MENU: 'menu',
  PLAYING: 'playing',
  PAUSED: 'paused',
  TAPE: 'tape',
  DEAD: 'dead',
  WON: 'won'
};
