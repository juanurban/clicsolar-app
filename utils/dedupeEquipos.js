/**
 * Consolidación idempotente del inventario global.
 *
 * Antes del inventario global, el mismo producto podía existir una vez por
 * empresa (misma categoría, marca y modelo con distinto id). Al unificar el
 * catálogo, esas copias aparecen repetidas en los listados y en el cotizador.
 *
 * Esta función agrupa por (categoria, marca, modelo) sin distinguir
 * mayúsculas ni espacios, conserva la fila más antigua de cada grupo, reasigna
 * las referencias de las cotizaciones (panel_id, inversor_id, bateria_id) a la
 * fila conservada, rellena los campos vacíos de esta con los datos de las
 * copias y elimina las copias. Si no hay duplicados no hace nada, por lo que
 * es segura para ejecutarse en cada arranque.
 */
async function deduplicarEquipos(pool) {
  const [grupos] = await pool.execute(
    `SELECT categoria,
            LOWER(TRIM(marca)) AS marca_k,
            LOWER(TRIM(modelo)) AS modelo_k,
            COUNT(*) AS total,
            MIN(id) AS keep_id,
            GROUP_CONCAT(id) AS ids
       FROM equipos
      GROUP BY categoria, LOWER(TRIM(marca)), LOWER(TRIM(modelo))
     HAVING COUNT(*) > 1`
  );

  if (!grupos || grupos.length === 0) return { consolidados: 0, eliminados: 0 };

  const camposNumericos = ['costo', 'precio_venta', 'potencia_wp', 'potencia_kw', 'capacidad_kwh', 'peso_kg', 'area_m2', 'utilidad_pct'];

  let consolidados = 0;
  let eliminados = 0;

  for (const grupo of grupos) {
    const ids = String(grupo.ids).split(',').map(Number);
    const keepId = Number(grupo.keep_id);
    const duplicados = ids.filter((id) => id !== keepId);
    if (duplicados.length === 0) continue;

    const [keptRows] = await pool.execute('SELECT * FROM equipos WHERE id = ?', [keepId]);
    if (keptRows.length === 0) continue;
    const kept = keptRows[0];

    for (const dupId of duplicados) {
      const [dupRows] = await pool.execute('SELECT * FROM equipos WHERE id = ?', [dupId]);
      if (dupRows.length === 0) continue;
      const dup = dupRows[0];

      // Reasignar referencias de las cotizaciones antes de borrar la copia:
      // las FK (ON DELETE SET NULL) dejarían la cotización sin equipo.
      for (const col of ['panel_id', 'inversor_id', 'bateria_id']) {
        await pool.execute(`UPDATE cotizaciones SET ${col} = ? WHERE ${col} = ?`, [keepId, dupId]);
      }

      // Conservar los datos más completos: si la fila conservada tiene un campo
      // vacío y la copia no, se rellena con el valor de la copia.
      const merged = {};
      for (const campo of camposNumericos) {
        merged[campo] = Number(kept[campo]) ? kept[campo] : (dup[campo] || 0);
      }
      merged.imagen_url = kept.imagen_url || dup.imagen_url || '';
      merged.descripcion = kept.descripcion || dup.descripcion || '';
      merged.tipo = kept.tipo || dup.tipo || '';
      merged.activo = Number(kept.activo) ? kept.activo : (Number(dup.activo) ? dup.activo : 0);

      await pool.execute(
        `UPDATE equipos SET costo=?, precio_venta=?, potencia_wp=?, potencia_kw=?, capacidad_kwh=?,
         peso_kg=?, area_m2=?, utilidad_pct=?, imagen_url=?, descripcion=?, tipo=?, activo=? WHERE id=?`,
        [merged.costo, merged.precio_venta, merged.potencia_wp, merged.potencia_kw, merged.capacidad_kwh,
         merged.peso_kg, merged.area_m2, merged.utilidad_pct, merged.imagen_url, merged.descripcion,
         merged.tipo, merged.activo, keepId]
      );

      await pool.execute('DELETE FROM equipos WHERE id = ?', [dupId]);
      eliminados++;
    }
    consolidados++;
  }

  return { consolidados, eliminados };
}

module.exports = { deduplicarEquipos };
