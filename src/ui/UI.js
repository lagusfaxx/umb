/* ============================================================
   UMBRAL 09 - Interfaz (UI)
   ------------------------------------------------------------
   UI minima y diegetica estilo camara VHS. Maneja:
   menu inicial, HUD, pausa, visor de cintas/notas, pantalla de
   muerte, pantalla final, subtitulos, avisos y vineta de cordura.
   ============================================================ */

import { drawFace } from '../map/Textures.js';

export class UI {
  constructor(root) {
    this.root = root;
    // callbacks que Game asigna
    this.onStart = () => {};
    this.onResume = () => {};
    this.onRestart = () => {};
    this.onMenu = () => {};
    this.onCloseTape = () => {};
    this.onToggleAudio = () => {};
    this.onEndingDone = () => {};

    this._toastTimer = null;
    this._subTimer = null;
    this.build();
  }

  build() {
    this.root.innerHTML = `
      <!-- VINETA DE CORDURA -->
      <div id="sanity-vignette"></div>

      <!-- HUD -->
      <div id="hud" class="hidden">
        <div class="hud-rec"><span class="rec-dot"></span> REC</div>
        <div class="hud-timecode" id="hud-timecode">00:00:00</div>
        <div class="hud-reticle"></div>
        <div class="hud-battery">
          <span class="battery-label">BAT</span>
          <div class="battery-shell"><div class="battery-fill" id="battery-fill"></div></div>
        </div>
        <div class="hud-objective">
          <div class="obj-line" id="obj-line">Encontrar una salida.</div>
          <div class="hud-progress" id="obj-progress">CINTAS 0/6 · PANELES 0/3</div>
        </div>
        <div class="hud-interact" id="hud-interact"></div>
        <div class="hud-toast" id="hud-toast"></div>
        <div class="hud-subtitle" id="hud-subtitle"></div>
      </div>

      <!-- MENU INICIAL -->
      <div id="start-screen" class="screen">
        <div class="rec-badge"><span class="rec-dot"></span> REC</div>
        <div class="timecode">SP · 00:00:00</div>
        <div class="title">UMBRAL 09</div>
        <div class="subtitle">nivel 09</div>
        <ul class="menu-list">
          <li class="menu-item clickable" id="btn-start">INICIAR DESCENSO</li>
          <li class="menu-item clickable" id="btn-controls">CONTROLES</li>
          <li class="menu-item clickable" id="btn-audio">AUDIO: ON</li>
        </ul>
        <div class="screen-note" id="controls-note" hidden>
          WASD · MOUSE · SHIFT correr · CTRL agacharse<br>
          E interactuar · F linterna · R objetivo · ESC pausa
        </div>
      </div>

      <!-- PAUSA -->
      <div id="pause-screen" class="screen hidden">
        <div class="title" style="font-size:clamp(36px,6vw,90px);">PAUSA</div>
        <ul class="menu-list">
          <li class="menu-item clickable" id="btn-resume">CONTINUAR</li>
          <li class="menu-item clickable" id="btn-restart">REINICIAR</li>
          <li class="menu-item clickable" id="btn-audio2">AUDIO: ON</li>
          <li class="menu-item clickable" id="btn-menu">MENU PRINCIPAL</li>
        </ul>
        <div class="screen-note">WASD · MOUSE · SHIFT · CTRL · E · F · R · ESC</div>
      </div>

      <!-- VISOR DE CINTAS / NOTAS -->
      <div id="tape-viewer" class="hidden">
        <div class="tape-frame">
          <div class="tape-header">
            <span id="tape-title">CINTA</span>
            <span><span class="rec-dot"></span> PLAY</span>
          </div>
          <div class="tape-body" id="tape-body"></div>
          <div class="tape-footer" id="tape-footer">▮ PULSA [E] O [ESC] PARA DETENER</div>
        </div>
      </div>

      <!-- PANTALLA DE MUERTE -->
      <div id="death-screen" class="screen hidden">
        <div class="death-text">NO MIRES DEMASIADO TIEMPO</div>
        <ul class="menu-list">
          <li class="menu-item clickable" id="btn-death-restart">REINICIAR</li>
          <li class="menu-item clickable" id="btn-death-menu">MENU PRINCIPAL</li>
        </ul>
      </div>

      <!-- PANTALLA FINAL -->
      <div id="ending-screen" class="screen hidden">
        <div class="ending-line" id="end1">SALIDA REGISTRADA</div>
        <div class="ending-line" id="end2">SUJETO: NO RECUPERADO</div>
        <div class="ending-line" id="end3">NIVEL 09 PERMANECE ABIERTO</div>
      </div>

      <!-- SCREAMER (cara a pantalla completa) -->
      <div id="screamer" class="hidden"><canvas id="screamer-canvas" width="512" height="512"></canvas></div>

      <!-- OVERLAY al esconderse (negro con rendijas) -->
      <div id="hide-overlay" class="hidden"></div>

      <!-- Indicador sutil de presencia / deteccion -->
      <div id="stalker-cue"></div>

      <!-- FUNDIDO A NEGRO -->
      <div class="fade-black" id="fade-black"></div>
    `;

    // referencias
    this.el = {
      hud: this.q('#hud'),
      timecode: this.q('#hud-timecode'),
      batteryFill: this.q('#battery-fill'),
      objLine: this.q('#obj-line'),
      objProgress: this.q('#obj-progress'),
      interact: this.q('#hud-interact'),
      toast: this.q('#hud-toast'),
      subtitle: this.q('#hud-subtitle'),
      sanity: this.q('#sanity-vignette'),
      start: this.q('#start-screen'),
      pause: this.q('#pause-screen'),
      tapeViewer: this.q('#tape-viewer'),
      tapeTitle: this.q('#tape-title'),
      tapeBody: this.q('#tape-body'),
      tapeFooter: this.q('#tape-footer'),
      death: this.q('#death-screen'),
      ending: this.q('#ending-screen'),
      fade: this.q('#fade-black'),
      controlsNote: this.q('#controls-note'),
      btnAudio: this.q('#btn-audio'),
      btnAudio2: this.q('#btn-audio2'),
      screamer: this.q('#screamer'),
      screamerCanvas: this.q('#screamer-canvas'),
      hideOverlay: this.q('#hide-overlay'),
      stalkerCue: this.q('#stalker-cue')
    };

    // listeners de menu
    this.q('#btn-start').onclick = () => this.onStart();
    this.q('#btn-controls').onclick = () => {
      this.el.controlsNote.hidden = !this.el.controlsNote.hidden;
    };
    this.q('#btn-resume').onclick = () => this.onResume();
    this.q('#btn-restart').onclick = () => this.onRestart();
    this.q('#btn-menu').onclick = () => this.onMenu();
    this.q('#btn-death-restart').onclick = () => this.onRestart();
    this.q('#btn-death-menu').onclick = () => this.onMenu();
    this.el.btnAudio.onclick = () => this.onToggleAudio();
    this.el.btnAudio2.onclick = () => this.onToggleAudio();
  }

  q(sel) { return this.root.querySelector(sel); }

  setAudioLabel(on) {
    const txt = 'AUDIO: ' + (on ? 'ON' : 'OFF');
    this.el.btnAudio.textContent = txt;
    this.el.btnAudio2.textContent = txt;
  }

  // ---- Control de pantallas ----
  showStart() { this.hideAll(); this.el.start.classList.remove('hidden'); }
  showPause() { this.el.pause.classList.remove('hidden'); }
  hidePause() { this.el.pause.classList.add('hidden'); }
  showHUD() { this.el.hud.classList.remove('hidden'); }
  hideHUD() { this.el.hud.classList.add('hidden'); }

  hideAll() {
    this.el.start.classList.add('hidden');
    this.el.pause.classList.add('hidden');
    this.el.death.classList.add('hidden');
    this.el.ending.classList.add('hidden');
    this.el.tapeViewer.classList.add('hidden');
    this.hideHUD();
  }

  // ---- HUD ----
  setHUD(d) {
    const pct = Math.max(0, Math.min(100, d.battery));
    this.el.batteryFill.style.width = pct + '%';
    this.el.batteryFill.classList.toggle('low', d.batteryLow);
    this.el.objLine.textContent = d.objective;
    this.el.objProgress.textContent =
      `CINTAS ${d.tapes}/${d.totalTapes} · PANELES ${d.panels}/${d.totalPanels}`;
    this.el.timecode.textContent = d.timecode;
  }

  setSanityVignette(level) {
    // level 0 (sano) .. 1 (al limite). Vineta roja que late en los bordes.
    const spread = Math.floor(level * 160);
    const alpha = (level * 0.5).toFixed(2);
    this.el.sanity.style.boxShadow = `inset 0 0 ${spread}px ${Math.floor(spread * 0.4)}px rgba(40,0,0,${alpha})`;
  }

  showInteract(label) {
    if (!label) { this.el.interact.classList.remove('show'); return; }
    // resaltar la tecla entre corchetes
    this.el.interact.innerHTML = label.replace(/\[(.+?)\]/, '<span class="key">$1</span>');
    this.el.interact.classList.add('show');
  }
  hideInteract() { this.el.interact.classList.remove('show'); }

  toast(text, duration = 3200) {
    this.el.toast.textContent = text;
    this.el.toast.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => this.el.toast.classList.remove('show'), duration);
  }

  subtitle(text, duration = 2600) {
    this.el.subtitle.textContent = text;
    this.el.subtitle.classList.add('show');
    clearTimeout(this._subTimer);
    this._subTimer = setTimeout(() => this.el.subtitle.classList.remove('show'), duration);
  }

  // ---- Visor de cintas ----
  showTape(tape) {
    this.el.tapeTitle.textContent = tape.title;
    this.el.tapeBody.textContent = '';
    this.el.tapeViewer.classList.remove('hidden');
    // efecto de tipeo con interferencia
    const text = tape.body;
    let i = 0;
    clearInterval(this._typeTimer);
    this._typeTimer = setInterval(() => {
      i += 2;
      this.el.tapeBody.textContent = text.slice(0, i);
      if (i >= text.length) clearInterval(this._typeTimer);
    }, 28);
  }

  showNote(text) {
    this.el.tapeTitle.textContent = 'NOTA';
    this.el.tapeBody.textContent = text;
    this.el.tapeFooter.textContent = '▮ PULSA [E] O [ESC] PARA CERRAR';
    this.el.tapeViewer.classList.remove('hidden');
  }

  hideTapeViewer() {
    clearInterval(this._typeTimer);
    this.el.tapeViewer.classList.add('hidden');
    this.el.tapeFooter.textContent = '▮ PULSA [E] O [ESC] PARA DETENER';
  }

  isTapeOpen() { return !this.el.tapeViewer.classList.contains('hidden'); }

  // ---- Muerte ----
  showDeath() {
    this.hideHUD();
    this.el.death.classList.remove('hidden');
  }

  // ---- Final (revela lineas en secuencia y vuelve al menu) ----
  showEnding() {
    this.hideHUD();
    this.el.ending.classList.remove('hidden');
    const lines = [this.q('#end1'), this.q('#end2'), this.q('#end3')];
    lines.forEach(l => (l.style.opacity = '0'));
    let delay = 800;
    lines.forEach((l) => {
      setTimeout(() => { l.style.transition = 'opacity 1.4s'; l.style.opacity = '0.9'; }, delay);
      delay += 1800;
    });
    setTimeout(() => this.onEndingDone(), delay + 3000);
  }

  // ---- Fundido ----
  fadeToBlack(on) {
    this.el.fade.classList.toggle('on', on);
  }

  // ---- Screamer: cara a pantalla completa con sacudida ----
  buildScreamerFace() {
    const c = this.el.screamerCanvas;
    drawFace(c.getContext('2d'), c.width, 0.7);
  }

  showScreamer(ms = 600) {
    this.buildScreamerFace();
    const el = this.el.screamer;
    el.classList.remove('hidden');
    // reinicia la animacion de sacudida
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = '';
    clearTimeout(this._screamerTimer);
    this._screamerTimer = setTimeout(() => el.classList.add('hidden'), ms);
  }

  // ---- Escondite (overlay con rendijas) ----
  showHide(on) {
    this.el.hideOverlay.classList.toggle('hidden', !on);
  }

  // ---- Indicador de presencia: 0 nada, 1 sospecha, 2 te ve ----
  setStalkerCue(level) {
    const el = this.el.stalkerCue;
    if (level <= 0) { el.classList.remove('show', 'danger'); return; }
    el.classList.add('show');
    if (level >= 2) { el.textContent = '▲ TE VE'; el.classList.add('danger'); }
    else { el.textContent = '▲ presencia'; el.classList.remove('danger'); }
  }
}
