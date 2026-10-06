/**
 * Ejecuta la consolidación del inventario global una sola vez.
 *
 * Uso en producción (hPanel → terminal de la app, o por SSH en la carpeta
 * del proyecto):  node scripts/dedupe-equipos.js
 *
 * También se ejecuta automáticamente en cada arranque del servidor (server.js),
 * así que este script solo es necesario para ejecutarla de forma manual.
 */
const pool = require('../db');
const { deduplicarEquipos } = require('../utils/dedupeEquipos');

(async () => {
  try {
    const resultado = await deduplicarEquipos(pool);
    console.log(`[dedupe-equipos] Consolidados ${resultado.consolidados} productos, eliminadas ${resultado.eliminados} copias duplicadas.`);
  } catch (error) {
    console.error('[dedupe-equipos] Error al consolidar el inventario:', error.message);
    process.exit(1);
  }
})();
