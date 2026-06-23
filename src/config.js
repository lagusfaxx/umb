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

  // ---- Cordura ----
  sanity: {
    max: 100,
    start: 100,
    darknessDrain: 3.2,      // por seg en oscuridad
    stareDrain: 7.0,         // por seg mirando a la entidad
    idleDrain: 1.6,          // por seg quieto demasiado tiempo
    corruptZoneDrain: 4.5,   // por seg en zona corrupta
    regen: 1.1,              // por seg en condiciones seguras (con luz, moviendose)
    idleTimeBeforeDrain: 9,  // seg quieto antes de empezar a drenar
    loudSoundHit: 6          // golpe instantaneo por susto fuerte
  },

  // ---- Entidad ----
  entity: {
    stalkSpeed: 1.6,
    huntSpeed: 4.4,          // mas lento que correr (5.0) -> el jugador puede escapar
    manifestSpeed: 0.0,
    catchRadius: 1.3,        // distancia a la que atrapa durante la caza
    hearRunRadius: 26,       // si corres dentro de este radio, te oye
    flashlightAggroTime: 2.4,// seg apuntandole con la linterna para enfurecerla
    repathInterval: 0.35,    // recalculo de ruta (BFS) en seg
    manifestDuration: 2.2,   // cuanto dura visible en estado Manifestacion
    loseSightTime: 6.0,      // seg sin ver al jugador antes de abandonar la caza
    spawnMinDistance: 18     // no aparece mas cerca que esto del jugador
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
  DORMANT: 'dormant',
  STALK: 'stalk',
  MANIFEST: 'manifest',
  HUNT: 'hunt'
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
