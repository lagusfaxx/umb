/* ============================================================
   UMBRAL 09 - Controlador del jugador (primera persona)
   ------------------------------------------------------------
   - Movimiento WASD pesado y realista (aceleracion/friccion).
   - Correr con stamina, agacharse, head bob, respiracion, FOV.
   - Colision por muestreo contra la rejilla del mapa.
   - Mouse look mediante PointerLockControls.
   ============================================================ */

import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { CONFIG } from '../config.js';

export class Player {
  constructor(camera, domElement, map, audio) {
    this.camera = camera;
    this.map = map;
    this.audio = audio;

    this.controls = new PointerLockControls(camera, domElement);
    this.controls.pointerSpeed = CONFIG.player.mouseSensitivity / 0.002;

    // Posicion logica (pies, y = 0). La altura de ojos se aplica a la camara.
    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();

    this.eyeHeight = CONFIG.player.height;
    this.targetHeight = CONFIG.player.height;

    this.stamina = CONFIG.player.staminaMax;
    this.exhausted = false;        // tras agotar stamina, espera a recuperar algo

    this.isRunning = false;
    this.isCrouching = false;
    this.isMoving = false;
    this.speed = 0;

    this.bobTime = 0;
    this.bobOffset = 0;
    this.stepDistance = 0;         // acumulador para pasos
    this.breath = 0;               // intensidad de respiracion 0..1

    this.currentFov = CONFIG.render.fov;

    // vectores reutilizables (evita garbage)
    this._forward = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._wish = new THREE.Vector3();
  }

  get object() { return this.controls.object; }

  spawn(pos, angle = 0) {
    this.position.set(pos.x, 0, pos.z);
    this.velocity.set(0, 0, 0);
    this.camera.position.copy(this.position);
    this.camera.position.y = this.eyeHeight;
    this.controls.object.rotation.set(0, angle, 0);
    this.stamina = CONFIG.player.staminaMax;
  }

  lock() { this.controls.lock(); }
  unlock() { this.controls.unlock(); }
  get isLocked() { return this.controls.isLocked; }

  // Comprueba colision en una posicion (x,z) muestreando el contorno del jugador
  collidesAt(x, z) {
    const r = CONFIG.player.radius;
    const pts = [
      [r, 0], [-r, 0], [0, r], [0, -r],
      [r * 0.7, r * 0.7], [-r * 0.7, r * 0.7], [r * 0.7, -r * 0.7], [-r * 0.7, -r * 0.7]
    ];
    for (const [ox, oz] of pts) {
      if (this.map.isSolidWorld(x + ox, z + oz)) return true;
    }
    return false;
  }

  // Movimiento con resolucion de colision por ejes (deslizamiento sobre muros)
  moveResolved(dx, dz) {
    const nx = this.position.x + dx;
    if (!this.collidesAt(nx, this.position.z)) this.position.x = nx;
    const nz = this.position.z + dz;
    if (!this.collidesAt(this.position.x, nz)) this.position.z = nz;
  }

  update(dt, input) {
    if (!this.controls.isLocked) {
      // sin captura de mouse: solo amortigua velocidad
      this.velocity.multiplyScalar(0.8);
      return;
    }

    // ---- Direccion deseada a partir de la orientacion de la camara ----
    this.camera.getWorldDirection(this._forward);
    this._forward.y = 0;
    this._forward.normalize();
    this._right.crossVectors(this._forward, this.camera.up).normalize();

    this._wish.set(0, 0, 0);
    if (input.forward) this._wish.add(this._forward);
    if (input.back) this._wish.sub(this._forward);
    if (input.right) this._wish.add(this._right);
    if (input.left) this._wish.sub(this._right);
    const wishLen = this._wish.length();
    if (wishLen > 0) this._wish.divideScalar(wishLen);

    // ---- Agacharse ----
    this.isCrouching = !!input.crouch;
    this.targetHeight = this.isCrouching ? CONFIG.player.crouchHeight : CONFIG.player.height;

    // ---- Correr y stamina ----
    const wantsRun = input.run && !this.isCrouching && wishLen > 0;
    if (this.exhausted && this.stamina > CONFIG.player.staminaRunThreshold + 10) {
      this.exhausted = false;
    }
    this.isRunning = wantsRun && !this.exhausted && this.stamina > 0;

    if (this.isRunning) {
      this.stamina -= CONFIG.player.staminaDrain * dt;
      if (this.stamina <= 0) { this.stamina = 0; this.exhausted = true; this.isRunning = false; }
    } else {
      this.stamina = Math.min(CONFIG.player.staminaMax, this.stamina + CONFIG.player.staminaRegen * dt);
    }

    // ---- Velocidad objetivo ----
    let targetSpeed = CONFIG.player.walkSpeed;
    if (this.isCrouching) targetSpeed = CONFIG.player.crouchSpeed;
    else if (this.isRunning) targetSpeed = CONFIG.player.runSpeed;

    // aceleracion / friccion hacia la velocidad deseada
    const desired = this._wish.clone().multiplyScalar(targetSpeed);
    const accel = wishLen > 0 ? CONFIG.player.accel : CONFIG.player.friction;
    this.velocity.x += (desired.x - this.velocity.x) * Math.min(1, accel * dt);
    this.velocity.z += (desired.z - this.velocity.z) * Math.min(1, accel * dt);

    // ---- Aplicar movimiento con colision ----
    this.moveResolved(this.velocity.x * dt, this.velocity.z * dt);

    this.speed = Math.hypot(this.velocity.x, this.velocity.z);
    this.isMoving = this.speed > 0.4;

    // ---- Altura de ojos (transicion suave al agacharse) ----
    this.eyeHeight += (this.targetHeight - this.eyeHeight) * Math.min(1, 10 * dt);

    // ---- Head bob ----
    if (this.isMoving) {
      const bobSpeed = CONFIG.player.headBobSpeed * (this.isRunning ? 1.4 : 1.0);
      this.bobTime += dt * bobSpeed;
      const amt = CONFIG.player.headBobAmount * (this.isRunning ? 1.7 : 1.0);
      this.bobOffset = Math.sin(this.bobTime) * amt;
    } else {
      this.bobTime = 0;
      this.bobOffset += (0 - this.bobOffset) * Math.min(1, 8 * dt);
    }

    // ---- Pasos (audio) ----
    this.stepDistance += this.speed * dt;
    const stepLen = this.isRunning ? 1.5 : (this.isCrouching ? 2.4 : 1.9);
    if (this.isMoving && this.stepDistance >= stepLen) {
      this.stepDistance = 0;
      if (this.audio) this.audio.footstep(this.isRunning, this.isCrouching);
    }

    // ---- Respiracion (mas intensa al correr / poca stamina) ----
    let targetBreath = 0.1;
    if (this.isRunning) targetBreath = 0.6;
    if (this.exhausted || this.stamina < 25) targetBreath = 1.0;
    this.breath += (targetBreath - this.breath) * Math.min(1, 2 * dt);
    if (this.audio) this.audio.setBreath(this.breath);

    // ---- FOV dinamico (sube al correr) ----
    let targetFov = CONFIG.render.fov;
    if (this.isRunning) targetFov = CONFIG.render.fovRun;
    this.applyFovToward(targetFov, dt, 6);

    // ---- Posicionar camara (pos logica + altura + bob) ----
    this.camera.position.x = this.position.x;
    this.camera.position.z = this.position.z;
    this.camera.position.y = this.eyeHeight + this.bobOffset;
  }

  // Fuerza un FOV objetivo (usado tambien por la caza desde el exterior)
  applyFovToward(target, dt, rate = 6) {
    if (Math.abs(this.camera.fov - target) > 0.05) {
      this.camera.fov += (target - this.camera.fov) * Math.min(1, rate * dt);
      this.camera.updateProjectionMatrix();
    }
  }

  // Posicion de ojos en el mundo (para distancias y raycast)
  getEyePosition(out = new THREE.Vector3()) {
    return out.set(this.position.x, this.eyeHeight, this.position.z);
  }
}
