/* ============================================================
   UMBRAL 09 - Texturas procedurales
   Genera todas las texturas con Canvas 2D (sin assets externos).
   Estetica: papel mural amarillo manchado, alfombra humeda,
   techo modular de oficina, concreto de mantenimiento.
   ============================================================ */

import * as THREE from 'three';

// Utilidad: ruido pseudoaleatorio determinista para variar texturas
function rand(seed) {
  let x = Math.sin(seed * 99991.137) * 43758.5453;
  return x - Math.floor(x);
}

// Crea un canvas y devuelve {canvas, ctx}
function makeCanvas(size = 512) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  return { canvas, ctx: canvas.getContext('2d') };
}

// Aplica grano/ruido sobre el canvas para dar suciedad analogica
function addGrain(ctx, size, amount = 18, alpha = 0.12) {
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * amount;
    d[i] += n;
    d[i + 1] += n;
    d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

// Mancha de humedad oscura e irregular
function stain(ctx, x, y, r, color) {
  const g = ctx.createRadialGradient(x, y, r * 0.1, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function toTexture(canvas, repeatX = 1, repeatY = 1) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---- Papel mural amarillo sucio y humedo ----
export function wallpaperTexture(seed = 1) {
  const size = 512;
  const { canvas, ctx } = makeCanvas(size);

  // Base amarilla apagada
  ctx.fillStyle = '#b3a25c';
  ctx.fillRect(0, 0, size, size);

  // Gradiente vertical: mas oscuro abajo (humedad sube)
  const grd = ctx.createLinearGradient(0, 0, 0, size);
  grd.addColorStop(0, 'rgba(150,135,70,0.0)');
  grd.addColorStop(0.7, 'rgba(70,60,30,0.15)');
  grd.addColorStop(1, 'rgba(40,32,16,0.5)');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, size, size);

  // Lineas verticales tenues del papel mural
  ctx.globalAlpha = 0.06;
  for (let x = 0; x < size; x += 16) {
    ctx.fillStyle = (Math.floor(x / 16) % 2) ? '#8a7a40' : '#c8b76a';
    ctx.fillRect(x, 0, 8, size);
  }
  ctx.globalAlpha = 1;

  // Manchas de humedad
  for (let i = 0; i < 22; i++) {
    const x = rand(seed + i) * size;
    const y = rand(seed + i * 3.3) * size;
    const r = 20 + rand(seed + i * 7.7) * 80;
    stain(ctx, x, y, r, 'rgba(45,35,18,0.5)');
  }
  // Manchas mas oscuras concentradas abajo
  for (let i = 0; i < 10; i++) {
    const x = rand(seed + 100 + i) * size;
    const y = size * 0.6 + rand(seed + 200 + i) * size * 0.4;
    const r = 30 + rand(seed + i * 2.1) * 60;
    stain(ctx, x, y, r, 'rgba(20,14,6,0.6)');
  }

  addGrain(ctx, size, 26, 0.15);
  return toTexture(canvas, 1, 1);
}

// ---- Alfombra antigua mojada con manchas ----
export function carpetTexture(seed = 2) {
  const size = 512;
  const { canvas, ctx } = makeCanvas(size);

  ctx.fillStyle = '#4a3f22';
  ctx.fillRect(0, 0, size, size);

  // Patron de fibra: lineas cortas aleatorias
  for (let i = 0; i < 9000; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const l = 2 + Math.random() * 4;
    const shade = 30 + Math.random() * 40;
    ctx.strokeStyle = `rgba(${shade + 20},${shade + 10},${shade - 5},0.5)`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (Math.random() - 0.5) * l, y + l);
    ctx.stroke();
  }

  // Manchas oscuras de humedad (charcos secos)
  for (let i = 0; i < 16; i++) {
    const x = rand(seed + i) * size;
    const y = rand(seed + i * 5.1) * size;
    const r = 25 + rand(seed + i * 2.7) * 70;
    stain(ctx, x, y, r, 'rgba(10,8,4,0.65)');
  }

  addGrain(ctx, size, 22, 0.12);
  return toTexture(canvas, 1, 1);
}

// ---- Techo modular de oficina (placas con rejilla) ----
export function ceilingTexture(seed = 3) {
  const size = 512;
  const { canvas, ctx } = makeCanvas(size);

  ctx.fillStyle = '#cfc7a8';
  ctx.fillRect(0, 0, size, size);

  // Rejilla de placas 2x2
  const cell = size / 2;
  ctx.strokeStyle = '#5a5440';
  ctx.lineWidth = 6;
  for (let i = 0; i <= 2; i++) {
    ctx.beginPath();
    ctx.moveTo(i * cell, 0);
    ctx.lineTo(i * cell, size);
    ctx.moveTo(0, i * cell);
    ctx.lineTo(size, i * cell);
    ctx.stroke();
  }

  // Textura de placa: puntitos
  ctx.fillStyle = 'rgba(90,84,64,0.5)';
  for (let i = 0; i < 2500; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    ctx.fillRect(x, y, 1, 1);
  }

  // Manchas amarillentas de filtraciones
  for (let i = 0; i < 8; i++) {
    const x = rand(seed + i) * size;
    const y = rand(seed + i * 3.1) * size;
    const r = 20 + rand(seed + i * 1.9) * 50;
    stain(ctx, x, y, r, 'rgba(120,90,30,0.4)');
  }

  addGrain(ctx, size, 16, 0.1);
  return toTexture(canvas, 1, 1);
}

// ---- Concreto humedo (zona de mantenimiento) ----
export function concreteTexture(seed = 4) {
  const size = 512;
  const { canvas, ctx } = makeCanvas(size);

  ctx.fillStyle = '#3c3a36';
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 30; i++) {
    const x = rand(seed + i) * size;
    const y = rand(seed + i * 4.3) * size;
    const r = 30 + rand(seed + i * 2.2) * 90;
    stain(ctx, x, y, r, `rgba(${10 + (i % 5)},${10},${8},0.35)`);
  }
  // Grietas
  ctx.strokeStyle = 'rgba(10,10,10,0.6)';
  for (let i = 0; i < 8; i++) {
    ctx.lineWidth = 1 + Math.random() * 1.5;
    ctx.beginPath();
    let x = rand(seed + 50 + i) * size;
    let y = rand(seed + 60 + i) * size;
    ctx.moveTo(x, y);
    for (let s = 0; s < 8; s++) {
      x += (Math.random() - 0.5) * 60;
      y += (Math.random() - 0.5) * 60;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  addGrain(ctx, size, 24, 0.14);
  return toTexture(canvas, 1, 1);
}

// ---- Estatica de TV (para pantallas y eventos) ----
export function staticTexture(size = 256) {
  const { canvas, ctx } = makeCanvas(size);
  const img = ctx.createImageData(size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const v = Math.random() * 255;
    d[i] = d[i + 1] = d[i + 2] = v;
    d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// Cache simple para no regenerar texturas identicas
const cache = {};
export function getSharedTextures() {
  if (!cache.ready) {
    cache.wallpaper = wallpaperTexture(11);
    cache.carpet = carpetTexture(22);
    cache.ceiling = ceilingTexture(33);
    cache.concrete = concreteTexture(44);
    cache.ready = true;
  }
  return cache;
}
