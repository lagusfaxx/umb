# UMBRAL 09

**Terror psicológico liminal en primera persona — SOLO PC (teclado y mouse).**

Un técnico de mantenimiento desciende al *Nivel 09*, una instalación subterránea
clausurada en los años 90. Despiertas entre pasillos amarillentos infinitos,
oficinas húmedas, tubos fluorescentes que parpadean y espacios imposibles.
Debes recuperar **6 cintas VHS**, activar **3 paneles eléctricos** y encontrar
una salida antes de que la entidad te alcance o tu cordura llegue a cero.

Construido con **Three.js + Vite**. Se ejecuta como experiencia 3D en el
navegador, en PC, a pantalla completa. Sin soporte móvil, sin botones táctiles,
sin diseño responsive de celular. Todo el audio y las texturas se generan por
código: **no requiere assets externos**.

---

## Requisitos

- **PC** con teclado y mouse.
- Navegador moderno con **WebGL2** (Chrome, Edge, Firefox).
- **Node.js 18+** y **npm** (solo para desarrollo/compilación).
- Se recomienda **auriculares** (el audio es central) y **pantalla completa** (F11).

> El juego detecta dispositivos táctiles sin puntero fino y muestra un aviso:
> está pensado exclusivamente para PC.

---

## Instalación y ejecución

```bash
# 1. Instalar dependencias
npm install

# 2. Ejecutar en modo desarrollo (servidor local con recarga en caliente)
npm run dev
# Abre la URL que imprime (por defecto http://localhost:5173)

# 3. Compilar build de producción (genera la carpeta dist/)
npm run build

# 4. Previsualizar el build de producción
npm run preview
```

### Cómo jugar / pantalla completa

1. Ejecuta `npm run dev` y abre la URL en el navegador (PC).
2. Pulsa **F11** para pantalla completa.
3. En el menú, haz clic en **INICIAR DESCENSO**. El juego captura el mouse
   (pointer lock). Pulsa **ESC** para pausar (libera el mouse).

### Exportar a PC (opcional)

El `dist/` generado por `npm run build` es estático y se puede:

- Servir desde cualquier servidor web o abrir con `npm run preview`.
- Empaquetar como ejecutable de escritorio (`.exe` / `.app`) envolviéndolo con
  **[Tauri](https://tauri.app)** o **[Electron](https://www.electronjs.org)**
  apuntando a la carpeta `dist/`. (No incluido aquí para no añadir dependencias
  pesadas; el juego no las necesita para funcionar.)

---

## Controles

| Tecla / Acción        | Función                                  |
|-----------------------|------------------------------------------|
| **W A S D** / Flechas | Moverse                                  |
| **Mouse**             | Mirar                                     |
| **Shift**             | Correr (consume stamina)                 |
| **Ctrl** / **C**      | Agacharse                                 |
| **E**                 | Interactuar (cintas, pilas, paneles, notas) |
| **Click izquierdo**   | Interactuar / re-capturar el mouse       |
| **F**                 | Encender / apagar linterna               |
| **R**                 | Revisar el objetivo actual               |
| **Esc**               | Pausar (y cerrar visores)                |

---

## Mecánicas implementadas

- **Movimiento en 1ª persona** pesado y realista: aceleración/fricción, correr
  con **stamina limitada**, agacharse, **head bob**, **respiración dinámica**
  (más intensa al correr / con poca stamina) y **FOV** que aumenta al correr y
  durante la caza.
- **Linterna** con **batería limitada** que baja con el uso, **parpadeo** al
  estar baja, **fallos** en zonas de alta actividad y durante la caza. Cono de
  luz realista (no ilumina todo). **Pilas escasas** repartidas por el mapa.
- **Sistema de cordura** (indicador sutil, viñeta roja): baja en oscuridad, al
  mirar a la entidad, en zonas corruptas, por sustos y por quedarse quieto.
  Al bajar: aumenta el ruido VHS, distorsión, susurros, sombras falsas y
  parpadeo. A cero → **muerte psicológica**.
- **Criaturas (3 amenazas distintas):**
  - **El Acechador**: figura altísima y demacrada con **rostro pálido** que flota
    en la oscuridad y tics de cabeza. IA de 3 estados: **Acecho** (sonidos, no se
    ve) → **Manifestación** (aparece al fondo de un pasillo) → **Caza** (persigue
    por el laberinto con *pathfinding* BFS). Oye si corres, reacciona a la
    linterna y puede perder tu rastro.
  - **Figuras inmóviles** ("no parpadees"): maniquíes pálidos en las zonas
    oscuras. Se **congelan mientras las miras** y avanzan hacia ti cuando dejas de
    verlas. Solo te atrapan si las pierdes de vista → screamer + muerte.
  - **El Reptante**: segundo cazador, más rápido y a ras de suelo, que **despierta
    en la caza final** (panel 3) para un clímax intenso.
- **Mapa liminal semi-procedural** con laberinto por *backtracker* y **6 zonas**
  (pasillos amarillos, oficinas, sala de TVs, sector inundado, túnel de
  mantenimiento, zona corrupta), colisiones, puertas que se cierran solas y el
  sector inundado **sellado hasta el panel 2**.
- **Objetivos**: 6 cintas VHS (cada una revela historia) + 3 paneles eléctricos:
  - **Panel 1**: restaura luces en sectores oscuros, pero **aumenta la actividad**.
  - **Panel 2**: **abre el sector inundado**.
  - **Panel 3**: **desbloquea la salida** e **inicia la caza final**.
  - Con las 6 cintas + 3 paneles aparece la **ruta de escape**.
- **Interacciones**: abrir/recoger, leer notas, activar paneles, encender TVs
  (evento), radio con interferencias.
- **Audio 100% procedural (Web Audio)**: zumbido fluorescente, **drone grave de
  fondo**, **latido cardíaco** que sube con la cercanía y la cordura baja,
  **crujidos estructurales** y **golpes lejanos**, pasos propios y ajenos,
  respiración, susurros, estática, chirridos, goteo (más en el sector inundado),
  drone de caza, **grito de screamer** y reverb por convolución.
- **Screamers**: sustos directos con **cara a pantalla completa** + grito +
  distorsión máxima, dosificados (cooldown) por el Horror Director en tensión
  alta, en la muerte y al activar el panel 3. Sin abusar.
- **Postprocesado VHS** (un solo shader): grano, aberración cromática,
  scanlines, distorsión de lente, viñeta, barras de tracking, flicker y color
  lavado amarillento. Reacciona a la cordura y a la caza.
- **Horror Director**: variable de **tensión 0–100** que sube por oscuridad,
  correr, quietud, progreso y zonas corruptas, y decide dinámicamente sonidos,
  parpadeos, cierres de puertas, apariciones, manifestación e inicio de caza.
- **UI mínima diegética** estilo cámara VHS: batería, objetivo, progreso,
  viñeta de cordura, menú inicial, pausa, visor de cintas, muerte y final.
- **Dificultad creciente**: más cintas y paneles → entidad más agresiva y mapa
  más corrupto.

---

## Historia (cintas VHS)

Fragmentos breves y no del todo explicados:

1. **Ingreso** del equipo técnico al Nivel 09.
2. **Primer fallo** de luces sin causa.
3. Pasos **dentro de las paredes**.
4. Los **pasillos se repiten** de forma imposible.
5. **No la mires**: observarla deteriora la mente.
6. **Advertencia**: no activar el tercer panel.

**Final** (al escapar): *"SALIDA REGISTRADA · SUJETO: NO RECUPERADO · NIVEL 09
PERMANECE ABIERTO"* → vuelve al menú.
**Muerte** (si te atrapa): *"NO MIRES DEMASIADO TIEMPO"* → reiniciar.

---

## Archivos importantes

```
umbral-09/
├── index.html                 # Lienzo + contenedor de UI
├── vite.config.js             # Configuración de Vite
├── package.json               # Dependencias y scripts (dev/build/preview)
└── src/
    ├── main.js                # Punto de entrada (detección PC/WebGL)
    ├── config.js              # TODAS las constantes ajustables (balance)
    ├── styles.css             # Estilos de UI (estética VHS)
    ├── core/
    │   ├── Game.js            # Orquestador: render, bucle, input, glue
    │   └── GameState.js       # Progreso y fases (cintas, paneles, cordura)
    ├── player/
    │   ├── Player.js          # Controlador 1ª persona (movimiento/stamina)
    │   └── Flashlight.js      # Linterna (batería, parpadeo, fallos)
    ├── entity/
    │   ├── Entity.js          # Acechador y reptante (3 estados + BFS + rostro)
    │   └── StillFigures.js    # Figuras inmóviles ("no parpadees")
    ├── map/
    │   ├── MapGenerator.js    # Mapa liminal, zonas, colisiones, puertas
    │   └── Textures.js        # Texturas procedurales (Canvas 2D)
    ├── items/
    │   └── Items.js           # Cintas, pilas, paneles, notas, salida
    ├── events/
    │   └── HorrorDirector.js  # Tensión 0–100 y disparo de eventos
    ├── audio/
    │   └── AudioSystem.js     # Sonido procedural (Web Audio API)
    ├── postprocessing/
    │   └── VHSPass.js         # Shader VHS (grano/aberración/scanlines…)
    └── ui/
        └── UI.js              # HUD y pantallas (menú/pausa/muerte/final)
```

---

## Pruebas realizadas

- ✅ Compila (`npm run build`) y arranca (`npm run dev`) sin errores.
- ✅ Generación de mapa validada en **40 semillas aleatorias**: spawn siempre
  sobre piso; cintas, paneles y salida accesibles; **sector inundado
  inaccesible antes del panel 2 y accesible después**.
- ✅ Pathfinding BFS de la entidad encuentra rutas correctas.
- ✅ Conteo de objetivos y lógica de progreso (`GameState`).
- ✅ Criaturas (acechador, reptante, figuras inmóviles) y rostro procedural se
  construyen y actualizan sin errores; el Horror Director dispara screamers en
  tensión alta y la caza final se activa correctamente (probado en Node).
- ✅ Corregido: los `PointerLockControls` anteriores se liberan al reiniciar
  (antes quedaban listeners duplicados que multiplicaban la sensibilidad).

Verificación jugable a comprobar en navegador (en PC): inicio, movimiento,
cámara, recoger cintas/pilas, activar paneles, linterna, persecución, victoria,
muerte, ausencia de errores en consola.

---

## Notas y mejoras pendientes

Versión: **prototipo jugable completo**. Lo implementado funciona de extremo a
extremo. Posibles mejoras futuras:

- **Audio espacial 3D** real (PannerNode) para posicionar pasos de la entidad;
  actualmente se atenúa por distancia, sin paneo.
- **Texturas PBR** más ricas (normal/roughness maps) y mayor variedad de props.
- **Cambio físico de geometría** ("pasillos que se alargan", "habitaciones que
  cambian al volver"): se sugiere con niebla/eventos/props que se mueven, pero
  no se reconstruye la malla en tiempo real.
- **Empujar puertas trabadas**: las puertas con llave son las del sector
  inundado (panel 2); no hay forcejeo manual de puertas genéricas.
- **Luminarias instanciadas** (`InstancedMesh`) para reducir draw calls si se
  amplía mucho el mapa.
- **Guardado de progreso** y **ajustes** (volumen, sensibilidad, calidad) en un
  menú de opciones.
- Empaquetado de escritorio con Tauri/Electron para distribuir un ejecutable.

Casi todo el balance (velocidades, drenajes, tensión, distancias de la entidad,
densidad de luces, etc.) está centralizado en **`src/config.js`** para tunear
fácilmente la intensidad del terror.
