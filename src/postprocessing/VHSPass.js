/* ============================================================
   UMBRAL 09 - Postprocesado VHS / camara analogica
   ------------------------------------------------------------
   Un unico ShaderPass que combina (por rendimiento):
     - Distorsion de lente (barrel) + desenfoque de bordes via vineta.
     - Aberracion cromatica radial.
     - Grano de pelicula / ruido analogico.
     - Lineas de escaneo (scanlines).
     - Barras de tracking VHS + wobble horizontal.
     - Flicker de exposicion.
     - Colores lavados, tinte amarillo, negros profundos.
   La intensidad reacciona a la CORDURA y a la CAZA.
   ============================================================ */

import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { Vector2 } from 'three';

const VHSShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uResolution: { value: new Vector2(1280, 720) },
    uAberration: { value: 0.0022 },
    uGrain: { value: 0.08 },
    uScanline: { value: 0.18 },
    uVignette: { value: 0.55 },
    uDistortion: { value: 0.08 },
    uTracking: { value: 0.35 },
    uDesaturate: { value: 0.28 },
    uSanity: { value: 1.0 },
    uFlicker: { value: 0.03 }
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform vec2 uResolution;
    uniform float uAberration;
    uniform float uGrain;
    uniform float uScanline;
    uniform float uVignette;
    uniform float uDistortion;
    uniform float uTracking;
    uniform float uDesaturate;
    uniform float uSanity;
    uniform float uFlicker;
    varying vec2 vUv;

    float rand(vec2 co) {
      return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
    }

    void main() {
      vec2 uv = vUv;
      vec2 cc = uv - 0.5;
      float dist2 = dot(cc, cc);

      // --- Distorsion de lente (barrel) ---
      uv = uv + cc * dist2 * uDistortion;

      // --- Wobble horizontal VHS ---
      float wob = sin(uv.y * 130.0 + uTime * 6.0) * 0.0006
                + sin(uv.y * 9.0 + uTime * 1.4) * 0.0014;
      uv.x += wob * uTracking;

      // --- Linea de tracking que recorre la imagen ---
      float trackLine = step(0.987, fract(uv.y * 3.0 - uTime * 0.5));
      uv.x += trackLine * (rand(vec2(uv.y, uTime)) - 0.5) * 0.04 * uTracking;

      // --- Aberracion cromatica radial ---
      vec2 dir = cc;
      float ab = uAberration * (1.0 + dist2 * 2.5);
      float r = texture2D(tDiffuse, uv + dir * ab).r;
      float g = texture2D(tDiffuse, uv).g;
      float b = texture2D(tDiffuse, uv - dir * ab).b;
      vec3 col = vec3(r, g, b);

      // --- Gradacion de color: lavado, tinte amarillo, negros profundos ---
      float luma = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(col, vec3(luma), uDesaturate);
      col = max(col, 0.0);
      col *= vec3(1.07, 1.0, 0.80);     // calido / amarillento
      col += 0.012;                     // leve lift (negros no del todo puros)

      // --- Lineas de escaneo ---
      float scan = sin(uv.y * 540.0) * 0.5 + 0.5;
      col *= 1.0 - uScanline * (1.0 - scan);

      // --- Grano / ruido analogico ---
      float n = rand(uv + fract(uTime * 1.3));
      col += (n - 0.5) * uGrain;

      // --- Banda de ruido por tracking ---
      col += trackLine * (n - 0.5) * 0.5 * uTracking;

      // --- Flicker de exposicion ---
      col *= 1.0 + (rand(vec2(uTime * 0.7, uTime)) - 0.5) * uFlicker;

      // --- Vineta (oscurece bordes, simula desenfoque/desgaste) ---
      float vig = smoothstep(0.85, 0.18, length(cc));
      col *= mix(1.0, vig, uVignette);

      gl_FragColor = vec4(col, 1.0);
    }
  `
};

export class VHSEffects {
  constructor(width, height) {
    this.pass = new ShaderPass(VHSShader);
    this.pass.uniforms.uResolution.value.set(width, height);
    this.time = 0;
    this.extra = 0; // pico temporal (muerte/manifestacion)
  }

  setSize(w, h) {
    this.pass.uniforms.uResolution.value.set(w, h);
  }

  // Pico de distorsion temporal (decae solo)
  spike(amount = 1.0) {
    this.extra = Math.max(this.extra, amount);
  }

  /* params: { sanity: 0..1 (1 = sano), hunt: 0..1, dead: bool } */
  update(dt, params) {
    this.time += dt;
    const u = this.pass.uniforms;
    u.uTime.value = this.time;

    this.extra = Math.max(0, this.extra - dt * 1.2);

    const lowSan = 1 - (params.sanity != null ? params.sanity : 1);
    const hunt = params.hunt || 0;
    let e = this.extra;
    if (params.dead) e = 1.0;

    u.uGrain.value = 0.06 + lowSan * 0.22 + hunt * 0.10 + e * 0.25;
    u.uAberration.value = 0.0018 + lowSan * 0.004 + hunt * 0.003 + e * 0.01;
    u.uScanline.value = 0.16 + lowSan * 0.12;
    u.uVignette.value = 0.50 + lowSan * 0.28 + hunt * 0.12 + e * 0.2;
    u.uDistortion.value = 0.06 + lowSan * 0.12 + hunt * 0.08 + e * 0.5;
    u.uTracking.value = 0.30 + lowSan * 0.7 + hunt * 0.5 + e * 1.5;
    u.uDesaturate.value = 0.24 + lowSan * 0.25;
    u.uFlicker.value = 0.02 + lowSan * 0.06 + hunt * 0.05 + e * 0.15;
    u.uSanity.value = params.sanity != null ? params.sanity : 1;
  }
}
