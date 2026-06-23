/* ============================================================
   UMBRAL 09 - Punto de entrada
   ------------------------------------------------------------
   Inicializa el juego. SOLO PC (teclado + mouse): si detecta un
   dispositivo tactil sin puntero fino, muestra un aviso y no
   arranca (no hay soporte movil ni controles tactiles).
   ============================================================ */

import './styles.css';
import { Game } from './core/Game.js';

function isTouchOnly() {
  // puntero grueso (dedo) y sin puntero fino (mouse/trackpad)
  const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  const fine = window.matchMedia && window.matchMedia('(pointer: fine)').matches;
  return coarse && !fine;
}

function hasWebGL() {
  try {
    const canvas = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (canvas.getContext('webgl2') || canvas.getContext('webgl')));
  } catch (e) {
    return false;
  }
}

window.addEventListener('DOMContentLoaded', () => {
  const warning = document.getElementById('device-warning');

  if (isTouchOnly()) {
    warning.hidden = false;
    warning.innerHTML = 'UMBRAL 09 es un juego solo para PC.<br>Necesitas teclado y mouse.';
    return;
  }
  if (!hasWebGL()) {
    warning.hidden = false;
    warning.innerHTML = 'Tu navegador no soporta WebGL.<br>UMBRAL 09 no puede ejecutarse.';
    return;
  }

  const canvas = document.getElementById('game-canvas');
  const uiRoot = document.getElementById('ui-root');
  const appEl = document.getElementById('app');

  // expone el juego en window para depuracion
  window.UMBRAL = new Game(canvas, uiRoot, appEl);
});
