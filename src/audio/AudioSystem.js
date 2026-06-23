/* ============================================================
   UMBRAL 09 - Sistema de audio procedural (Web Audio API)
   ------------------------------------------------------------
   Todo el sonido se genera por codigo (sin archivos externos):
   zumbido fluorescente, pasos, respiracion, susurros, estatica,
   chirridos, golpes metalicos, goteo, drone de caza y jumpscare.
   Incluye reverb por convolucion con impulso generado.
   ============================================================ */

export class AudioSystem {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.noiseBuffer = null;
    this.breath = { intensity: 0, phase: 0, gain: null, src: null };
    this.hunt = { active: false, gain: null, nodes: [] };
    this.ambientTimers = { drip: 0, metal: 0, knock: 0 };
    this.tension = 0;
    this.sanity = 1;
    this.masterVolume = 0.85;
  }

  // Debe llamarse tras un gesto del usuario (autoplay policy)
  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();

    // Cadena maestra: master -> compresor -> destino
    this.master = this.ctx.createGain();
    this.master.gain.value = this.masterVolume;
    this.comp = this.ctx.createDynamicsCompressor();
    this.comp.threshold.value = -18;
    this.comp.ratio.value = 4;
    this.master.connect(this.comp);
    this.comp.connect(this.ctx.destination);

    // Bus de reverb
    this.reverb = this.ctx.createConvolver();
    this.reverb.buffer = this.makeImpulse(1.8, 2.6);
    this.reverbGain = this.ctx.createGain();
    this.reverbGain.gain.value = 0.5;
    this.reverb.connect(this.reverbGain);
    this.reverbGain.connect(this.master);

    this.noiseBuffer = this.makeNoise(2.0);
    this.ready = true;
  }

  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }
  suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend(); }
  setMasterVolume(v) { this.masterVolume = v; if (this.master) this.master.gain.value = v; }

  // ---- Generadores de buffers ----
  makeNoise(seconds) {
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  makeImpulse(seconds, decay) {
    const rate = this.ctx.sampleRate;
    const len = Math.floor(rate * seconds);
    const buf = this.ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return buf;
  }

  // Fuente de ruido (one-shot) hacia un nodo destino
  noiseSource() {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuffer;
    s.loop = true;
    return s;
  }

  // Envolvente de ganancia ADSR simple
  env(gainNode, t0, peak, attack, decay, sustainTime, release) {
    const g = gainNode.gain;
    g.cancelScheduledValues(t0);
    g.setValueAtTime(0.0001, t0);
    g.exponentialRampToValueAtTime(peak, t0 + attack);
    g.exponentialRampToValueAtTime(Math.max(0.0001, peak * 0.5), t0 + attack + decay);
    g.setValueAtTime(Math.max(0.0001, peak * 0.5), t0 + attack + decay + sustainTime);
    g.exponentialRampToValueAtTime(0.0001, t0 + attack + decay + sustainTime + release);
  }

  // ============================================================
  // AMBIENTE: zumbido fluorescente continuo
  // ============================================================
  startAmbient() {
    if (!this.ready) return;
    if (this.ambientOn) return;
    this.ambientOn = true;
    const t = this.ctx.currentTime;

    // zumbido electrico 60/120 Hz + armonico, filtrado
    this.humGain = this.ctx.createGain();
    this.humGain.gain.value = 0.06;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 600;
    this.humGain.connect(lp); lp.connect(this.master);

    const o1 = this.ctx.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 60;
    const o2 = this.ctx.createOscillator(); o2.type = 'square'; o2.frequency.value = 120;
    const o3 = this.ctx.createOscillator(); o3.type = 'sine'; o3.frequency.value = 119.5; // batido sutil
    o1.connect(this.humGain); o2.connect(this.humGain); o3.connect(this.humGain);
    o1.start(t); o2.start(t); o3.start(t);
    this.humOsc = [o1, o2, o3];

    // capa de aire/ruido de fondo muy tenue
    const air = this.noiseSource();
    const airF = this.ctx.createBiquadFilter(); airF.type = 'bandpass'; airF.frequency.value = 400; airF.Q.value = 0.4;
    const airG = this.ctx.createGain(); airG.gain.value = 0.012;
    air.connect(airF); airF.connect(airG); airG.connect(this.master);
    air.start(t);
    this.airSrc = air;

    this.startBreath();
    this.startDrone();
    this.startHeartbeat();

    // temporizadores de eventos ambientales (rellenan los silencios)
    this.ambientTimers = {
      groan: 5 + Math.random() * 8,
      boom: 14 + Math.random() * 12,
      voice: 16 + Math.random() * 16,
      drip: 3 + Math.random() * 4
    };
    this.zone = null;
  }

  stopAmbient() {
    if (!this.ambientOn) return;
    this.ambientOn = false;
    try { this.humOsc.forEach(o => o.stop()); } catch (e) {}
    try { this.airSrc.stop(); } catch (e) {}
    try { this.droneNodes.forEach(o => o.stop()); } catch (e) {}
    if (this.heart) this.heart.intensity = 0;
    this.ambientTimers = null;
    this.stopHunt();
  }

  // Drone grave continuo (quita el "aire muerto", inquieta de fondo)
  startDrone() {
    const t = this.ctx.currentTime;
    const g = this.ctx.createGain(); g.gain.value = 0.05; g.connect(this.master);
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 150;
    const o1 = this.ctx.createOscillator(); o1.type = 'sine'; o1.frequency.value = 38;
    const o2 = this.ctx.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = 55;
    const o2g = this.ctx.createGain(); o2g.gain.value = 0.3; o2.connect(o2g); o2g.connect(lp);
    o1.connect(lp); lp.connect(g);
    // LFO lento que hace "respirar" al drone
    const lfo = this.ctx.createOscillator(); lfo.frequency.value = 0.05;
    const lfoG = this.ctx.createGain(); lfoG.gain.value = 0.02; lfo.connect(lfoG); lfoG.connect(g.gain);
    [o1, o2, lfo].forEach(o => o.start(t));
    this.droneNodes = [o1, o2, lfo];
    this.droneGain = g;
  }

  // Latido: nodo persistente; setHeartbeat controla intensidad (0..1)
  startHeartbeat() {
    this.heart = { phase: 1, intensity: 0 };
  }
  setHeartbeat(v) { if (this.heart) this.heart.intensity = Math.min(1, v); }
  setZone(zone) { this.zone = zone; }

  beat(amp) {
    const t = this.ctx.currentTime;
    for (const [off, a] of [[0, 1], [0.17, 0.7]]) {
      const o = this.ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(72, t + off);
      o.frequency.exponentialRampToValueAtTime(40, t + off + 0.12);
      const g = this.ctx.createGain(); o.connect(g); g.connect(this.master);
      const vol = 0.13 * amp * a;
      g.gain.setValueAtTime(0.0001, t + off);
      g.gain.exponentialRampToValueAtTime(vol, t + off + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + off + 0.18);
      o.start(t + off); o.stop(t + off + 0.26);
    }
  }

  // Crujido estructural (metal/concreto que se queja)
  playGroan() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(55 + Math.random() * 30, t);
    o.frequency.exponentialRampToValueAtTime(28, t + 2.5);
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 220;
    const g = this.ctx.createGain(); o.connect(lp); lp.connect(g); g.connect(this.reverb); g.connect(this.master);
    this.env(g, t, 0.06, 0.6, 0.6, 1.2, 1.0);
    o.start(t); o.stop(t + 3.6);
  }

  // Golpe lejano profundo + escombros
  playDistantBoom() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(80, t); o.frequency.exponentialRampToValueAtTime(28, t + 0.6);
    const g = this.ctx.createGain(); o.connect(g); g.connect(this.reverb); g.connect(this.master);
    this.env(g, t, 0.16, 0.005, 0.3, 0.0, 0.6);
    o.start(t); o.stop(t + 1.2);
    const s = this.ctx.createBufferSource(); s.buffer = this.noiseBuffer;
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500;
    const g2 = this.ctx.createGain(); s.connect(lp); lp.connect(g2); g2.connect(this.reverb);
    this.env(g2, t, 0.05, 0.01, 0.4, 0.0, 0.5);
    s.start(t); s.stop(t + 1);
  }

  // Grito agudo para los SCREAMERS (encima del jumpscare)
  playScream() {
    if (!this.ready) return;
    this.playJumpscare();
    const t = this.ctx.currentTime;
    const g = this.ctx.createGain(); g.connect(this.master);
    this.env(g, t, 0.55, 0.005, 0.2, 0.15, 0.4);
    const o1 = this.ctx.createOscillator(); o1.type = 'sawtooth';
    o1.frequency.setValueAtTime(900, t); o1.frequency.exponentialRampToValueAtTime(200, t + 0.7);
    const o2 = this.ctx.createOscillator(); o2.type = 'sawtooth';
    o2.frequency.setValueAtTime(1300, t); o2.frequency.exponentialRampToValueAtTime(260, t + 0.7);
    const bp = this.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1500; bp.Q.value = 0.7;
    o1.connect(bp); o2.connect(bp); bp.connect(g);
    o1.start(t); o2.start(t); o1.stop(t + 0.9); o2.stop(t + 0.9);
  }

  // ============================================================
  // RESPIRACION dinamica (bucle modulado manualmente)
  // ============================================================
  startBreath() {
    const src = this.noiseSource();
    const bp = this.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 700; bp.Q.value = 1.2;
    const g = this.ctx.createGain(); g.gain.value = 0.0001;
    src.connect(bp); bp.connect(g); g.connect(this.master);
    src.start();
    this.breath.src = src;
    this.breath.gain = g;
    this.breath.filter = bp;
  }

  setBreath(intensity) { this.breath.intensity = intensity; }

  // ============================================================
  // PASOS del jugador
  // ============================================================
  footstep(running, crouching) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource(); src.buffer = this.noiseBuffer;
    src.playbackRate.value = 0.8 + Math.random() * 0.3;
    const bp = this.ctx.createBiquadFilter(); bp.type = 'lowpass';
    bp.frequency.value = running ? 1400 : 900;
    const g = this.ctx.createGain();
    const vol = crouching ? 0.05 : running ? 0.22 : 0.13;
    src.connect(bp); bp.connect(g); g.connect(this.master); g.connect(this.reverb);
    this.env(g, t, vol, 0.005, 0.06, 0.0, 0.05);
    src.start(t); src.stop(t + 0.2);
  }

  // ============================================================
  // PASOS de la entidad (volumen por distancia)
  // ============================================================
  entityStep(distance, hunting) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const maxD = hunting ? 30 : 22;
    if (distance > maxD) return;
    const prox = 1 - distance / maxD; // 0..1
    const src = this.ctx.createBufferSource(); src.buffer = this.noiseBuffer;
    src.playbackRate.value = 0.5 + Math.random() * 0.2;
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = hunting ? 500 : 320;
    const g = this.ctx.createGain();
    const vol = (hunting ? 0.5 : 0.28) * prox * prox;
    src.connect(lp); lp.connect(g); g.connect(this.master); g.connect(this.reverb);
    this.env(g, t, Math.max(0.001, vol), 0.005, 0.1, 0.0, 0.12);
    src.start(t); src.stop(t + 0.4);
  }

  // ============================================================
  // SUSURROS (voz invertida/etérea)
  // ============================================================
  playWhisper() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource(); src.buffer = this.noiseBuffer;
    src.playbackRate.value = 0.6 + Math.random() * 0.5;
    const bp = this.ctx.createBiquadFilter(); bp.type = 'bandpass';
    bp.frequency.value = 1000 + Math.random() * 1500; bp.Q.value = 5;
    // modulacion de formante con LFO
    const lfo = this.ctx.createOscillator(); lfo.frequency.value = 4 + Math.random() * 6;
    const lfoG = this.ctx.createGain(); lfoG.gain.value = 400;
    lfo.connect(lfoG); lfoG.connect(bp.frequency);
    const g = this.ctx.createGain();
    src.connect(bp); bp.connect(g); g.connect(this.reverb); g.connect(this.master);
    const dur = 0.8 + Math.random() * 1.0;
    this.env(g, t, 0.06, 0.3, 0.2, dur, 0.5);
    lfo.start(t); src.start(t);
    src.stop(t + dur + 1.2); lfo.stop(t + dur + 1.2);
  }

  // ============================================================
  // ESTATICA (TV / cintas VHS)
  // ============================================================
  playStatic(duration = 1.0, volume = 0.12) {
    if (!this.ready) return null;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource(); src.buffer = this.noiseBuffer; src.loop = true;
    const hp = this.ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1500;
    const g = this.ctx.createGain(); g.gain.value = volume;
    src.connect(hp); hp.connect(g); g.connect(this.master);
    src.start(t);
    src.stop(t + duration);
    return { src, g };
  }

  // ============================================================
  // CHIRRIDO de puerta
  // ============================================================
  playDoorCreak() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator(); osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.exponentialRampToValueAtTime(70, t + 1.1);
    const bp = this.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 600; bp.Q.value = 8;
    const g = this.ctx.createGain();
    osc.connect(bp); bp.connect(g); g.connect(this.master); g.connect(this.reverb);
    this.env(g, t, 0.08, 0.05, 0.2, 0.6, 0.3);
    osc.start(t); osc.stop(t + 1.3);
  }

  // ============================================================
  // GOLPE METALICO lejano
  // ============================================================
  playMetalDistant() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const freqs = [180, 277, 415, 622];
    freqs.forEach((f, i) => {
      const osc = this.ctx.createOscillator(); osc.type = 'sine'; osc.frequency.value = f * (1 + Math.random() * 0.01);
      const g = this.ctx.createGain();
      osc.connect(g); g.connect(this.reverb); g.connect(this.master);
      const peak = 0.05 / (i + 1);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.5 + Math.random());
      osc.start(t); osc.stop(t + 2.5);
    });
  }

  // ============================================================
  // GOLPE en pared (knock)
  // ============================================================
  playKnock() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator(); osc.type = 'sine';
    osc.frequency.setValueAtTime(120, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.18);
    const g = this.ctx.createGain();
    osc.connect(g); g.connect(this.master); g.connect(this.reverb);
    this.env(g, t, 0.35, 0.004, 0.12, 0.0, 0.1);
    osc.start(t); osc.stop(t + 0.4);
  }

  // ============================================================
  // GOTEO de agua
  // ============================================================
  playWaterDrip() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator(); osc.type = 'sine';
    osc.frequency.setValueAtTime(900 + Math.random() * 400, t);
    osc.frequency.exponentialRampToValueAtTime(300, t + 0.12);
    const g = this.ctx.createGain();
    osc.connect(g); g.connect(this.reverb); g.connect(this.master);
    this.env(g, t, 0.07, 0.002, 0.05, 0.0, 0.08);
    osc.start(t); osc.stop(t + 0.25);
  }

  // ============================================================
  // POP de luz que estalla
  // ============================================================
  playLightPop() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    // pop
    const src = this.ctx.createBufferSource(); src.buffer = this.noiseBuffer;
    const g = this.ctx.createGain();
    src.connect(g); g.connect(this.master);
    this.env(g, t, 0.3, 0.002, 0.04, 0.0, 0.03);
    src.start(t); src.stop(t + 0.1);
    // chispa/zumbido
    const osc = this.ctx.createOscillator(); osc.type = 'square'; osc.frequency.value = 8000;
    const g2 = this.ctx.createGain();
    osc.connect(g2); g2.connect(this.master);
    this.env(g2, t, 0.04, 0.001, 0.06, 0.0, 0.05);
    osc.start(t); osc.stop(t + 0.15);
  }

  // ============================================================
  // RECOGER objeto / ACTIVAR panel / RADIO
  // ============================================================
  playPickup() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator(); osc.type = 'sine'; osc.frequency.setValueAtTime(440, t);
    osc.frequency.exponentialRampToValueAtTime(660, t + 0.12);
    const g = this.ctx.createGain();
    osc.connect(g); g.connect(this.master);
    this.env(g, t, 0.07, 0.005, 0.08, 0.0, 0.1);
    osc.start(t); osc.stop(t + 0.3);
  }

  playPanel() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    // golpe de interruptor
    this.playKnock();
    // zumbido electrico que sube
    const osc = this.ctx.createOscillator(); osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(40, t);
    osc.frequency.exponentialRampToValueAtTime(180, t + 0.8);
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 800;
    const g = this.ctx.createGain();
    osc.connect(lp); lp.connect(g); g.connect(this.master);
    this.env(g, t, 0.12, 0.05, 0.3, 0.4, 0.6);
    osc.start(t); osc.stop(t + 1.6);
  }

  playRadioInterference(duration = 2.5) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource(); src.buffer = this.noiseBuffer; src.loop = true;
    const bp = this.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1800; bp.Q.value = 2;
    const lfo = this.ctx.createOscillator(); lfo.frequency.value = 3;
    const lfoG = this.ctx.createGain(); lfoG.gain.value = 1500;
    lfo.connect(lfoG); lfoG.connect(bp.frequency);
    const g = this.ctx.createGain(); g.gain.value = 0.08;
    src.connect(bp); bp.connect(g); g.connect(this.master);
    src.start(t); lfo.start(t);
    src.stop(t + duration); lfo.stop(t + duration);
  }

  // ============================================================
  // DRONE de caza (intenso y grave)
  // ============================================================
  startHunt() {
    if (!this.ready || this.hunt.active) return;
    this.hunt.active = true;
    const t = this.ctx.currentTime;
    const g = this.ctx.createGain(); g.gain.value = 0.0001;
    g.connect(this.master);
    this.hunt.gain = g;

    const o1 = this.ctx.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 44;
    const o2 = this.ctx.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = 44.6;
    const sub = this.ctx.createOscillator(); sub.type = 'sine'; sub.frequency.value = 28;
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 220;
    // LFO de tension que abre el filtro
    const lfo = this.ctx.createOscillator(); lfo.frequency.value = 0.7;
    const lfoG = this.ctx.createGain(); lfoG.gain.value = 120;
    lfo.connect(lfoG); lfoG.connect(lp.frequency);
    o1.connect(lp); o2.connect(lp); sub.connect(g); lp.connect(g);
    [o1, o2, sub, lfo].forEach(o => o.start(t));
    g.gain.exponentialRampToValueAtTime(0.18, t + 1.2);
    this.hunt.nodes = [o1, o2, sub, lfo];
  }

  stopHunt() {
    if (!this.hunt.active) return;
    this.hunt.active = false;
    const t = this.ctx.currentTime;
    if (this.hunt.gain) this.hunt.gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.0);
    const nodes = this.hunt.nodes;
    setTimeout(() => { try { nodes.forEach(o => o.stop()); } catch (e) {} }, 1200);
    this.hunt.nodes = [];
  }

  // ============================================================
  // JUMPSCARE (corto, fuerte, seco)
  // ============================================================
  playJumpscare() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    // golpe sub grave
    const sub = this.ctx.createOscillator(); sub.type = 'sine';
    sub.frequency.setValueAtTime(160, t); sub.frequency.exponentialRampToValueAtTime(35, t + 0.5);
    const sg = this.ctx.createGain();
    sub.connect(sg); sg.connect(this.master);
    this.env(sg, t, 0.9, 0.002, 0.2, 0.1, 0.4);
    sub.start(t); sub.stop(t + 0.9);
    // chillido (ruido filtrado agudo)
    const src = this.ctx.createBufferSource(); src.buffer = this.noiseBuffer;
    const bp = this.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 3000; bp.Q.value = 1;
    const g = this.ctx.createGain();
    src.connect(bp); bp.connect(g); g.connect(this.master);
    this.env(g, t, 0.7, 0.001, 0.15, 0.05, 0.2);
    src.start(t); src.stop(t + 0.6);
  }

  // ============================================================
  // ACTUALIZACION (respiracion, eventos ambientales, tinnitus)
  // ============================================================
  setTension(v) { this.tension = v; }
  setSanity(v) { this.sanity = v; }

  update(dt) {
    if (!this.ready) return;

    // Respiracion: modula ganancia y frecuencia segun intensidad
    if (this.breath.gain) {
      const rate = 0.4 + this.breath.intensity * 1.8; // ciclos/seg
      this.breath.phase += dt * rate * Math.PI * 2;
      const cycle = (Math.sin(this.breath.phase) * 0.5 + 0.5);
      const target = (0.004 + this.breath.intensity * 0.05) * cycle + 0.0005;
      this.breath.gain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.05);
      if (this.breath.filter) {
        this.breath.filter.frequency.setTargetAtTime(500 + cycle * 600, this.ctx.currentTime, 0.1);
      }
    }

    // Latido cardiaco: la frecuencia y el volumen suben con la intensidad
    if (this.heart && this.heart.intensity > 0.02) {
      const rate = 0.8 + this.heart.intensity * 1.7; // latidos/seg
      this.heart.phase += dt * rate;
      if (this.heart.phase >= 1) { this.heart.phase -= 1; this.beat(this.heart.intensity); }
    }

    // Eventos ambientales programados (rellenan los silencios incomodos)
    if (this.ambientOn && this.ambientTimers) {
      const T = this.ambientTimers;
      T.groan -= dt; if (T.groan <= 0) { T.groan = 10 + Math.random() * 16; this.playGroan(); }
      T.boom -= dt; if (T.boom <= 0) { T.boom = 16 + Math.random() * 18; this.playDistantBoom(); }
      T.voice -= dt; if (T.voice <= 0) { T.voice = 20 + Math.random() * 22; if (Math.random() < 0.6) this.playWhisper(); }
      T.drip -= dt; if (T.drip <= 0) {
        T.drip = (this.zone === 'flooded' ? 1.4 : 5) + Math.random() * 4;
        if (this.zone === 'flooded' || Math.random() < 0.5) this.playWaterDrip();
      }
    }
  }
}
