/* ============================================================
   UMBRAL 09 - Estado del juego
   Guarda el progreso (cintas, paneles, cordura) y la fase actual.
   No contiene logica de render; solo datos y transiciones.
   ============================================================ */

import { CONFIG, PHASE } from '../config.js';

export class GameState {
  constructor() {
    this.reset();
  }

  reset() {
    this.phase = PHASE.MENU;

    // Progreso de objetivos
    this.tapesFound = 0;
    this.tapesCollected = new Set();   // ids de cintas ya recogidas
    this.panelsActivated = 0;
    this.panelsDone = new Set();       // ids de paneles activados
    this.exitUnlocked = false;
    this.escapeRouteRevealed = false;

    // Recursos
    this.battery = CONFIG.flashlight.batteryMax;
    this.sanity = CONFIG.sanity.start;
    this.stamina = CONFIG.player.staminaMax;

    // Tension del Horror Director
    this.tension = 0;

    // Banderas de cambios de mapa provocados por paneles
    this.floodedUnlocked = false;      // panel 2
    this.lightsBoosted = false;        // panel 1
    this.finalHuntStarted = false;     // panel 3

    // Texto del objetivo actual mostrado en HUD
    this.objectiveText = 'Encontrar una salida.';

    // Tiempo de partida (para timecode VHS)
    this.elapsed = 0;
  }

  // Dificultad escala con el progreso: mas cintas + paneles => entidad mas agresiva
  get aggression() {
    // 0..1 segun progreso total
    const tapePart = this.tapesFound / CONFIG.objectives.totalTapes;
    const panelPart = this.panelsActivated / CONFIG.objectives.totalPanels;
    return Math.min(1, tapePart * 0.5 + panelPart * 0.5);
  }

  // Indice de corrupcion del mapa (mas paneles => mas corrupto)
  get corruption() {
    return this.panelsActivated / CONFIG.objectives.totalPanels;
  }

  get allTapesFound() {
    return this.tapesFound >= CONFIG.objectives.totalTapes;
  }

  get allPanelsActivated() {
    return this.panelsActivated >= CONFIG.objectives.totalPanels;
  }

  get canEscape() {
    return this.allTapesFound && this.allPanelsActivated;
  }

  collectTape(id) {
    if (this.tapesCollected.has(id)) return false;
    this.tapesCollected.add(id);
    this.tapesFound = this.tapesCollected.size;
    return true;
  }

  activatePanel(id) {
    if (this.panelsDone.has(id)) return false;
    this.panelsDone.add(id);
    this.panelsActivated = this.panelsDone.size;
    return true;
  }

  // Calcula el texto del objetivo en funcion del progreso
  refreshObjective() {
    if (this.canEscape) {
      this.objectiveText = 'La ruta de escape esta abierta. Encuentra la SALIDA.';
    } else if (this.allTapesFound) {
      this.objectiveText = `Activar paneles electricos (${this.panelsActivated}/${CONFIG.objectives.totalPanels}).`;
    } else if (this.allPanelsActivated) {
      this.objectiveText = `Recuperar cintas VHS (${this.tapesFound}/${CONFIG.objectives.totalTapes}).`;
    } else {
      this.objectiveText =
        `Recuperar cintas (${this.tapesFound}/${CONFIG.objectives.totalTapes}) y activar paneles (${this.panelsActivated}/${CONFIG.objectives.totalPanels}).`;
    }
    return this.objectiveText;
  }
}
