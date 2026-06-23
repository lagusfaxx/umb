/* ============================================================
   UMBRAL 09 - Linterna
   ------------------------------------------------------------
   - Cono de luz realista (SpotLight) atado a la camara.
   - Bateria limitada que baja con el uso.
   - Parpadeo cuando la bateria esta baja.
   - Fallos forzados en zonas de alta actividad / durante la caza.
   ============================================================ */

import * as THREE from 'three';
import { CONFIG } from '../config.js';

export class Flashlight {
  constructor(camera, scene) {
    this.camera = camera;
    this.battery = CONFIG.flashlight.batteryMax;
    this.on = false;

    const c = CONFIG.flashlight;
    this.spot = new THREE.SpotLight(0xfff1d0, c.intensity, c.distance, c.angle, c.penumbra, 1.7);
    this.spot.castShadow = true;
    this.spot.shadow.mapSize.set(CONFIG.render.shadowMapSize, CONFIG.render.shadowMapSize);
    this.spot.shadow.camera.near = 0.2;
    this.spot.shadow.camera.far = c.distance;
    this.spot.shadow.bias = -0.0008;
    this.spot.shadow.radius = 3;
    this.spot.visible = false;

    // La linterna cuelga ligeramente bajo/derecha de los ojos (mano)
    this.spot.position.set(0.18, -0.12, 0.1);
    camera.add(this.spot);

    // El objetivo del foco apunta hacia adelante de la camara
    this.spot.target.position.set(0, 0, -1);
    camera.add(this.spot.target);

    this.baseIntensity = c.intensity;
    this.flickerTimer = 0;      // tiempo restante de parpadeo forzado
    this.flickerStrength = 0;   // 0..1 intensidad del fallo
    this._noise = 0;
  }

  toggle() {
    if (this.battery <= 0) { this.on = false; this.spot.visible = false; return false; }
    this.on = !this.on;
    return this.on;
  }

  addBattery(amount) {
    this.battery = Math.min(CONFIG.flashlight.batteryMax, this.battery + amount);
  }

  // Provoca un fallo de linterna durante 'duration' segundos (eventos/caza)
  forceFlicker(duration, strength = 1.0) {
    this.flickerTimer = Math.max(this.flickerTimer, duration);
    this.flickerStrength = Math.max(this.flickerStrength, strength);
  }

  get batteryRatio() { return this.battery / CONFIG.flashlight.batteryMax; }
  get isLow() { return this.battery <= CONFIG.flashlight.lowThreshold; }

  // dt: delta; paranormal: 0..1 nivel de actividad (zona/tension)
  update(dt, paranormal = 0) {
    if (this.on && this.battery > 0) {
      this.battery -= CONFIG.flashlight.drainPerSecond * dt;
      if (this.battery <= 0) { this.battery = 0; this.on = false; }
    }

    if (!this.on || this.battery <= 0) {
      this.spot.visible = false;
      return;
    }

    this.spot.visible = true;
    let intensity = this.baseIntensity;

    // Parpadeo por bateria baja
    if (this.isLow) {
      const lowFactor = 1 - this.battery / CONFIG.flashlight.lowThreshold; // 0..1
      if (Math.random() < 0.05 + lowFactor * 0.18) {
        intensity *= 0.15 + Math.random() * 0.3;
      }
    }

    // Fallo forzado (zonas paranormales / caza)
    if (paranormal > 0.01 && Math.random() < paranormal * 0.08) {
      this.forceFlicker(0.1 + Math.random() * 0.25, 0.6 + paranormal * 0.4);
    }
    if (this.flickerTimer > 0) {
      this.flickerTimer -= dt;
      // fallo agresivo: a veces apagado total
      if (Math.random() < 0.5) intensity *= (1 - this.flickerStrength) * (0.2 + Math.random() * 0.3);
      else intensity *= 0.4 + Math.random() * 0.4;
      if (this.flickerTimer <= 0) this.flickerStrength = 0;
    }

    // pequeno temblor de intensidad para vida analogica
    this._noise = this._noise * 0.9 + (Math.random() - 0.5) * 0.1;
    intensity *= 1 + this._noise * 0.08;

    this.spot.intensity = Math.max(0, intensity);
  }

  // True si la linterna esta encendida y apuntando hacia worldPos dentro del cono
  isPointingAt(worldPos, maxExtraAngle = 0.15) {
    if (!this.on || !this.spot.visible) return false;
    const camPos = new THREE.Vector3();
    const camDir = new THREE.Vector3();
    this.camera.getWorldPosition(camPos);
    this.camera.getWorldDirection(camDir);
    const toTarget = worldPos.clone().sub(camPos);
    const dist = toTarget.length();
    if (dist > CONFIG.flashlight.distance) return false;
    toTarget.normalize();
    const angle = camDir.angleTo(toTarget);
    return angle < CONFIG.flashlight.angle + maxExtraAngle;
  }
}
