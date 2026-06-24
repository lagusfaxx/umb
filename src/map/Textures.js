/* ============================================================
   UMBRAL 09 - Texturas procedurales (Canvas 2D, sin assets)
   ------------------------------------------------------------
   Estetica liminal: papel mural amarillo manchado con zocalo,
   alfombra humeda, techo modular con rejillas, concreto con oxido.
   Incluye generador de ROSTRO para las criaturas y screamers.
   ============================================================ */

import * as THREE from 'three';

function rand(seed) {
  const x = Math.sin(seed * 99991.137) * 43758.5453;
  return x - Math.floor(x);
}

function makeCanvas(size = 512) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  return { canvas, ctx: canvas.getContext('2d') };
}

function addGrain(ctx, size, amount = 18) {
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * amount;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

function stain(ctx, x, y, r, color) {
  const g = ctx.createRadialGradient(x, y, r * 0.1, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

// Veta/escurrimiento vertical de humedad
function streak(ctx, x, topY, len, w, color) {
  const g = ctx.createLinearGradient(x, topY, x, topY + len);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(0.5, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(x - w / 2, topY, w, len);
}

function toTexture(canvas, repeatX = 1, repeatY = 1) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = 8;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---- Papel mural amarillo sucio, con zocalo y escurrimientos ----
export function wallpaperTexture(seed = 1) {
  const size = 1024;
  const { canvas, ctx } = makeCanvas(size);

  // base amarilla
  ctx.fillStyle = '#b3a25c';
  ctx.fillRect(0, 0, size, size);

  // patron de rayas verticales del papel
  for (let x = 0; x < size; x += 26) {
    ctx.fillStyle = (Math.floor(x / 26) % 2) ? 'rgba(138,122,64,0.12)' : 'rgba(200,183,106,0.10)';
    ctx.fillRect(x, 0, 13, size);
  }
  // motivo damasco tenue (rombos)
  ctx.strokeStyle = 'rgba(90,78,40,0.10)';
  ctx.lineWidth = 2;
  for (let y = 0; y < size; y += 64) {
    for (let x = 0; x < size; x += 64) {
      ctx.beginPath();
      ctx.moveTo(x + 32, y); ctx.lineTo(x + 64, y + 32);
      ctx.lineTo(x + 32, y + 64); ctx.lineTo(x, y + 32);
      ctx.closePath(); ctx.stroke();
    }
  }

  // gradiente: mas oscuro y humedo hacia abajo
  const grd = ctx.createLinearGradient(0, 0, 0, size);
  grd.addColorStop(0, 'rgba(150,135,70,0.0)');
  grd.addColorStop(0.65, 'rgba(70,60,30,0.18)');
  grd.addColorStop(1, 'rgba(30,24,12,0.55)');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, size, size);

  // escurrimientos de agua desde arriba
  for (let i = 0; i < 14; i++) {
    const x = rand(seed + i * 1.7) * size;
    const len = 200 + rand(seed + i) * 600;
    streak(ctx, x, 0, len, 6 + rand(seed + i * 2) * 10, 'rgba(40,30,14,0.30)');
  }
  // manchas de humedad / moho
  for (let i = 0; i < 26; i++) {
    const x = rand(seed + i) * size;
    const y = rand(seed + i * 3.3) * size;
    const r = 24 + rand(seed + i * 7.7) * 90;
    stain(ctx, x, y, r, 'rgba(45,35,18,0.5)');
  }
  for (let i = 0; i < 8; i++) {
    const x = rand(seed + 200 + i) * size;
    const y = size * 0.55 + rand(seed + 300 + i) * size * 0.45;
    stain(ctx, x, y, 40 + rand(seed + i) * 70, 'rgba(18,30,12,0.45)'); // moho verdoso
  }

  // zocalo inferior (madera oscura) + linea de division
  ctx.fillStyle = '#2c2417';
  ctx.fillRect(0, size - 90, size, 90);
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.fillRect(0, size - 96, size, 6);
  // rayado del zocalo
  for (let x = 0; x < size; x += 4) {
    ctx.fillStyle = `rgba(0,0,0,${0.1 + Math.random() * 0.15})`;
    ctx.fillRect(x, size - 90, 1, 90);
  }

  addGrain(ctx, size, 26);
  return toTexture(canvas, 1, 1);
}

// ---- Alfombra antigua mojada ----
export function carpetTexture(seed = 2) {
  const size = 512;
  const { canvas, ctx } = makeCanvas(size);

  ctx.fillStyle = '#473c20';
  ctx.fillRect(0, 0, size, size);

  // fibra
  for (let i = 0; i < 14000; i++) {
    const x = Math.random() * size, y = Math.random() * size;
    const l = 2 + Math.random() * 4;
    const sh = 28 + Math.random() * 44;
    ctx.strokeStyle = `rgba(${sh + 22},${sh + 12},${sh - 6},0.45)`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (Math.random() - 0.5) * l, y + l);
    ctx.stroke();
  }
  // patron geometrico desgastado
  ctx.strokeStyle = 'rgba(20,16,8,0.25)';
  ctx.lineWidth = 3;
  for (let i = 0; i < size; i += 128) {
    ctx.strokeRect(i + 8, 8, 112, size - 16);
  }
  // manchas oscuras humedas
  for (let i = 0; i < 18; i++) {
    stain(ctx, rand(seed + i) * size, rand(seed + i * 5.1) * size, 28 + rand(seed + i * 2.7) * 80, 'rgba(8,6,3,0.7)');
  }
  // brillos de humedad (puntos claros)
  for (let i = 0; i < 200; i++) {
    ctx.fillStyle = 'rgba(120,120,110,0.06)';
    ctx.fillRect(Math.random() * size, Math.random() * size, 2, 2);
  }

  addGrain(ctx, size, 22);
  return toTexture(canvas, 1, 1);
}

// ---- Techo modular de oficina con rejillas ----
export function ceilingTexture(seed = 3) {
  const size = 512;
  const { canvas, ctx } = makeCanvas(size);

  ctx.fillStyle = '#cfc7a8';
  ctx.fillRect(0, 0, size, size);

  const cell = size / 2;
  ctx.strokeStyle = '#4a4636';
  ctx.lineWidth = 7;
  for (let i = 0; i <= 2; i++) {
    ctx.beginPath();
    ctx.moveTo(i * cell, 0); ctx.lineTo(i * cell, size);
    ctx.moveTo(0, i * cell); ctx.lineTo(size, i * cell);
    ctx.stroke();
  }
  // textura de placa
  ctx.fillStyle = 'rgba(90,84,64,0.5)';
  for (let i = 0; i < 4000; i++) ctx.fillRect(Math.random() * size, Math.random() * size, 1, 1);

  // rejilla de ventilacion en una placa
  ctx.fillStyle = '#3a382e';
  ctx.fillRect(cell + 30, 30, cell - 60, cell - 60);
  ctx.strokeStyle = '#1c1b16';
  ctx.lineWidth = 3;
  for (let y = 40; y < cell - 30; y += 10) {
    ctx.beginPath(); ctx.moveTo(cell + 36, y); ctx.lineTo(2 * cell - 36, y); ctx.stroke();
  }
  // tornillos en esquinas de placas
  ctx.fillStyle = '#2a2820';
  for (const [cx, cy] of [[10, 10], [cell - 10, 10], [10, cell - 10], [cell - 10, cell - 10]]) {
    ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI * 2); ctx.fill();
  }
  // filtraciones amarillas
  for (let i = 0; i < 8; i++) {
    stain(ctx, rand(seed + i) * size, rand(seed + i * 3.1) * size, 24 + rand(seed + i) * 60, 'rgba(120,90,30,0.4)');
  }

  addGrain(ctx, size, 16);
  return toTexture(canvas, 1, 1);
}

// ---- Concreto humedo con oxido (mantenimiento / inundado) ----
export function concreteTexture(seed = 4) {
  const size = 512;
  const { canvas, ctx } = makeCanvas(size);

  ctx.fillStyle = '#3a3833';
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 40; i++) {
    stain(ctx, rand(seed + i) * size, rand(seed + i * 4.3) * size, 30 + rand(seed + i * 2.2) * 100, `rgba(${8 + (i % 6)},${8},${6},0.4)`);
  }
  // escurrimientos de oxido
  for (let i = 0; i < 10; i++) {
    streak(ctx, rand(seed + i * 2.1) * size, rand(seed + i) * size * 0.4, 120 + rand(seed + i) * 300, 5 + rand(seed + i) * 8, 'rgba(90,45,20,0.30)');
  }
  // grietas
  ctx.strokeStyle = 'rgba(8,8,8,0.7)';
  for (let i = 0; i < 10; i++) {
    ctx.lineWidth = 1 + Math.random() * 1.5;
    ctx.beginPath();
    let x = rand(seed + 50 + i) * size, y = rand(seed + 60 + i) * size;
    ctx.moveTo(x, y);
    for (let s = 0; s < 9; s++) { x += (Math.random() - 0.5) * 70; y += (Math.random() - 0.5) * 70; ctx.lineTo(x, y); }
    ctx.stroke();
  }
  addGrain(ctx, size, 24);
  return toTexture(canvas, 1, 1);
}

// ---- Estatica (TVs / cintas) ----
export function staticTexture(size = 256) {
  const { canvas, ctx } = makeCanvas(size);
  const img = ctx.createImageData(size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const v = Math.random() * 255;
    d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/* ---- ROSTRO del screamer (found-footage: cara que emerge de la negrura) ----
   Claroscuro duro, boca gritando, sangre, grano pesado. Se redibuja cada
   frame del screamer para que "viva" y parpadee. */
export function drawFace(ctx, size) {
  const cx = size / 2;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, size, size);

  // volumen base de la cabeza (gris muy apagado que se funde en negro)
  let g = ctx.createRadialGradient(cx, size * 0.46, size * 0.04, cx, size * 0.5, size * 0.55);
  g.addColorStop(0, '#574e45');
  g.addColorStop(0.5, '#241f1b');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.ellipse(cx, size * 0.5, size * 0.31, size * 0.46, 0, 0, Math.PI * 2); ctx.fill();

  // luces altas (frente, pomulos, nariz) -> sensacion de piel iluminada de golpe
  const hi = (x, y, rx, ry, a) => {
    const gg = ctx.createRadialGradient(x, y, 1, x, y, Math.max(rx, ry));
    gg.addColorStop(0, `rgba(206,198,184,${a})`);
    gg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gg;
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
  };
  hi(cx + (Math.random() - 0.5) * 4, size * 0.30, size * 0.17, size * 0.10, 0.5);
  hi(cx - size * 0.17, size * 0.51, size * 0.09, size * 0.14, 0.4);
  hi(cx + size * 0.17, size * 0.51, size * 0.09, size * 0.14, 0.4);
  hi(cx, size * 0.52, size * 0.035, size * 0.15, 0.5);

  // cuencas oculares: agujeros negros profundos con un destello humedo
  for (const sx of [-1, 1]) {
    const ex = cx + sx * size * 0.145, ey = size * 0.44;
    const gg = ctx.createRadialGradient(ex, ey, 1, ex, ey, size * 0.13);
    gg.addColorStop(0, '#000'); gg.addColorStop(0.72, '#000'); gg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gg;
    ctx.beginPath(); ctx.ellipse(ex, ey, size * 0.095, size * 0.125, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(220,212,205,0.55)';
    ctx.beginPath(); ctx.arc(ex + sx * size * 0.02, ey - size * 0.012, size * 0.008, 0, Math.PI * 2); ctx.fill();
  }
  // ceja/sombra superior
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(cx - size * 0.25, size * 0.355, size * 0.5, size * 0.028);

  // boca gritando: hueco grande e irregular
  ctx.fillStyle = '#070504';
  ctx.beginPath(); ctx.ellipse(cx, size * 0.75, size * 0.115, size * 0.17, 0, 0, Math.PI * 2); ctx.fill();
  const mg = ctx.createRadialGradient(cx, size * 0.79, 1, cx, size * 0.79, size * 0.13);
  mg.addColorStop(0, '#000'); mg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = mg;
  ctx.beginPath(); ctx.ellipse(cx, size * 0.79, size * 0.095, size * 0.14, 0, 0, Math.PI * 2); ctx.fill();
  // dientes sugeridos (irregulares)
  ctx.fillStyle = 'rgba(150,140,120,0.32)';
  for (let i = -2; i <= 2; i++) ctx.fillRect(cx + i * size * 0.036, size * 0.66, size * 0.02, size * 0.04 * (0.6 + Math.random() * 0.8));

  // sangre
  for (let i = 0; i < 6; i++) {
    const x = cx + (Math.random() - 0.5) * size * 0.5;
    streak(ctx, x, size * (0.3 + Math.random() * 0.25), size * (0.15 + Math.random() * 0.35), 3 + Math.random() * 5, 'rgba(60,4,4,0.6)');
  }
  // venas/grietas en la piel
  ctx.strokeStyle = 'rgba(28,18,22,0.4)'; ctx.lineWidth = 1;
  for (let i = 0; i < 22; i++) {
    ctx.beginPath();
    let x = cx + (Math.random() - 0.5) * size * 0.5, y = size * (0.25 + Math.random() * 0.5);
    ctx.moveTo(x, y);
    for (let s = 0; s < 5; s++) { x += (Math.random() - 0.5) * 22; y += (Math.random() - 0.5) * 22; ctx.lineTo(x, y); }
    ctx.stroke();
  }

  // tinte rojizo + scanlines + vineta dura
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = 'rgba(45,0,0,0.10)'; ctx.fillRect(0, 0, size, size);
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  for (let y = 0; y < size; y += 3) ctx.fillRect(0, y, size, 1);
  const vg = ctx.createRadialGradient(cx, size * 0.5, size * 0.18, cx, size * 0.5, size * 0.62);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.96)');
  ctx.fillStyle = vg; ctx.fillRect(0, 0, size, size);

  addGrain(ctx, size, 64);
}

export function faceTexture() {
  const size = 256;
  const { canvas, ctx } = makeCanvas(size);
  drawFace(ctx, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---- Normal map a partir de la luminancia de un canvas (relieve para la linterna) ----
function normalFromCanvas(srcCanvas, strength = 2.2) {
  const size = srcCanvas.width;
  const data = srcCanvas.getContext('2d').getImageData(0, 0, size, size).data;
  const lum = new Float32Array(size * size);
  for (let i = 0; i < size * size; i++) {
    lum[i] = (data[i * 4] * 0.299 + data[i * 4 + 1] * 0.587 + data[i * 4 + 2] * 0.114) / 255;
  }
  const at = (x, y) => lum[((y + size) % size) * size + ((x + size) % size)];
  const { canvas, ctx } = makeCanvas(size);
  const out = ctx.createImageData(size, size);
  const d = out.data;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      let nx = -dx, ny = -dy, nz = 1;
      const l = Math.hypot(nx, ny, nz) || 1;
      const i = (y * size + x) * 4;
      d[i] = (nx / l * 0.5 + 0.5) * 255;
      d[i + 1] = (ny / l * 0.5 + 0.5) * 255;
      d[i + 2] = (nz / l * 0.5 + 0.5) * 255;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);
  const tex = new THREE.CanvasTexture(canvas); // normal map: dejar en espacio lineal
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// Cache de texturas compartidas (color + relieve)
const cache = {};
export function getSharedTextures() {
  if (!cache.ready) {
    cache.wallpaper = wallpaperTexture(11);
    cache.carpet = carpetTexture(22);
    cache.ceiling = ceilingTexture(33);
    cache.concrete = concreteTexture(44);
    cache.wallpaperN = normalFromCanvas(cache.wallpaper.image, 2.6);
    cache.carpetN = normalFromCanvas(cache.carpet.image, 1.8);
    cache.concreteN = normalFromCanvas(cache.concrete.image, 2.4);
    cache.ceilingN = normalFromCanvas(cache.ceiling.image, 1.6);
    cache.ready = true;
  }
  return cache;
}

