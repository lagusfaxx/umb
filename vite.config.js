import { defineConfig } from 'vite';

// Configuracion Vite para UMBRAL 09.
// base: './' permite abrir el build (dist/) sin servidor o desde subcarpetas.
export default defineConfig({
  base: './',
  server: {
    host: true,
    open: false,
    port: 5173
  },
  build: {
    target: 'es2020',
    outDir: 'dist',
    assetsInlineLimit: 0,
    sourcemap: false,
    chunkSizeWarningLimit: 1500
  }
});
