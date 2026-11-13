const express = require('express');
const router = express.Router();
const pool = require('../db');

async function ensureInstalacionesSchema() {
  const safeAlter = async (sql) => { try { await pool.execute(sql); } catch (e) { /* ignore */ } };
  await safeAlter("ALTER TABLE proyectos ADD COLUMN tipo TEXT DEFAULT 'instalacion'");
  await safeAlter("ALTER TABLE proyectos ADD COLUMN empresa_id INTEGER");
  await safeAlter("ALTER TABLE proyectos ADD COLUMN pasos_json TEXT DEFAULT '[]'");
  await safeAlter("ALTER TABLE tareas_proyecto ADD COLUMN fecha_completada TEXT");
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function normalizeSubtarea(s, i) {
  return {
    id: String(s?.id || uid() + 's' + i),
    titulo: String(s?.titulo ?? s?.nombre ?? '').trim(),
    completada: !!s?.completada
  };
}

function normalizeTarea(t, i) {
  const subtareas = Array.isArray(t?.subtareas) ? t.subtareas.map(normalizeSubtarea) : [];
  const completada = subtareas.length > 0 ? subtareas.every(s => s.completada) : !!t?.completada;
  return {
    id: String(t?.id || uid() + 't' + i),
    titulo: String(t?.titulo ?? t?.nombre ?? t?.descripcion ?? '').trim(),
    completada,
    subtareas
  };
}

function normalizePaso(p, i) {
  const tareas = Array.isArray(p?.tareas) ? p.tareas.map(normalizeTarea) : [];
  const completado = tareas.length > 0 ? tareas.every(t => t.completada && (t.subtareas || []).every(s => s.completada)) : !!p?.completado;
  return {
    id: String(p?.id || uid() + 'p' + i),
    nombre: String(p?.nombre ?? p?.titulo ?? `Etapa ${i + 1}`).trim() || `Etapa ${i + 1}`,
    orden: Number(p?.orden) || (i + 1),
    completado,
    tareas
  };
}

function parsePasos(row) {
  let pasos = [];
  try {
    pasos = row?.pasos_json ? (typeof row.pasos_json === 'string' ? JSON.parse(row.pasos_json) : row.pasos_json) : [];
  } catch (e) { pasos = []; }
  if (!Array.isArray(pasos)) pasos = [];
  // Si vienen pasos antiguos (formato fijo sin tareas), convertirlos a etapas editables vacías preservando nombre/completado básico
  const looksOld = pasos.length && pasos.every(p => p && !Array.isArray(p.tareas) && ('completado' in p) && ('nombre' in p) && !('subtareas' in p));
  if (looksOld) {
    pasos = pasos.map((p, i) => ({
      id: String(p.id || uid() + 'p' + i),
      nombre: String(p.nombre || `Etapa ${i + 1}`),
      orden: i + 1,
      completado: !!p.completado,
      tareas: p.completado ? [{ id: uid() + 't0', titulo: 'Etapa completada (migrada)', completada: true, subtareas: [] }] : []
    }));
  }
  pasos = pasos.map(normalizePaso).sort((a, b) => (a.orden || 0) - (b.orden || 0));
  // reordenar
  pasos = pasos.map((p, i) => ({ ...p, orden: i + 1 }));
  return pasos;
}

function calcProgreso(pasos) {
  const tareas = pasos.flatMap(p => p.tareas || []);
  const items = [];
  tareas.forEach(t => {
    if ((t.subtareas || []).length) t.subtareas.forEach(s => items.push(s.completada));
    else items.push(t.completada);
  });
  const total = items.length;
  const completados = items.filter(Boolean).length;
  const pasosTotal = pasos.length;
  const pasosCompletados = pasos.filter(p => p.completado).length;
  return {
    tareasCompletadas: completados,
    tareasTotal: total,
    pasosCompletados,
    pasosTotal,
    pct: total ? Math.round((completados / total) * 100) : (pasosTotal ? Math.round((pasosCompletados / pasosTotal) * 100) : 0)
  };
}

function pasoActualNombre(pasos) {
  if (!pasos.length) return 'Sin etapas';
  const actual = pasos.find(p => !p.completado);
  return actual ? actual.nombre : 'Completada';
}

// --- ESTADOS (compatibilidad, ya no definen pasos fijos) ---
router.get('/estados', async (req, res) => {
  try {
    await ensureInstalacionesSchema();
    const [rows] = await pool.execute('SELECT * FROM estados_proyecto ORDER BY orden ASC');
    res.json(rows);
  } catch (error) { res.status(500).json({ error: 'Error fetching estados' }); }
});
router.post('/estados', async (req, res) => {
  try {
    await ensureInstalacionesSchema();
    const { nombre, color, orden } = req.body;
    if (!nombre) return res.status(400).json({ error: 'El nombre es obligatorio' });
    const [result] = await pool.execute('INSERT INTO estados_proyecto (nombre, color, orden) VALUES (?, ?, ?)', [nombre, color || 'border-l-4 border-gray-400 bg-surface-container', orden || 0]);
    res.status(201).json({ id: result.insertId, message: 'Estado creado' });
  } catch (error) { res.status(500).json({ error: 'Error al crear estado' }); }
});

// --- INSTALACIONES ---

router.get('/', async (req, res) => {
  try {
    await ensureInstalacionesSchema();
    const query = `
      SELECT p.*, c.nombre as cliente_nombre, cot.codigo as cotizacion_codigo, cot.titulo as cotizacion_titulo
      FROM proyectos p
      JOIN clientes c ON p.cliente_id = c.id
      LEFT JOIN cotizaciones cot ON p.cotizacion_id = cot.id
      WHERE (p.empresa_id = ? OR ? = 1 OR p.empresa_id IS NULL)
      ORDER BY p.updated_at DESC, p.created_at DESC
    `;
    const [rows] = await pool.execute(query, [req.user.empresa_id, req.user.es_superadmin ? 1 : 0]);
    const data = rows.map(r => {
      const pasos = parsePasos(r);
      return { ...r, pasos, progreso: calcProgreso(pasos), paso_actual: pasoActualNombre(pasos) };
    });
    res.json(data);
  } catch (error) {
    console.error('Error fetching proyectos:', error);
    res.status(500).json({ error: 'Error al obtener instalaciones' });
  }
});

router.get('/cotizaciones-disponibles', async (req, res) => {
  try {
    await ensureInstalacionesSchema();
    const [rows] = await pool.execute(
      `SELECT c.id, c.codigo, c.titulo, c.estado, c.total_inversion, c.potencia_kwp, c.fecha, cl.nombre as cliente_nombre, cl.id as cliente_id
       FROM cotizaciones c
       JOIN clientes cl ON c.cliente_id = cl.id
       WHERE (c.empresa_id = ? OR (c.empresa_id IS NULL AND cl.empresa_id = ?) OR ? = 1)
         AND c.id NOT IN (SELECT cotizacion_id FROM proyectos WHERE cotizacion_id IS NOT NULL)
       ORDER BY c.fecha DESC`,
      [req.user.empresa_id, req.user.empresa_id, req.user.es_superadmin ? 1 : 0]
    );
    res.json(rows);
  } catch (error) {
    console.error('Error fetching cotizaciones disponibles:', error);
    res.status(500).json({ error: 'Error al obtener cotizaciones' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    await ensureInstalacionesSchema();
    const [rows] = await pool.execute(
      `SELECT p.*, c.nombre as cliente_nombre, c.telefono as cliente_telefono, c.correo as cliente_correo, c.direccion as cliente_direccion,
              cot.codigo as cotizacion_codigo, cot.titulo as cotizacion_titulo, cot.total_inversion, cot.potencia_kwp, cot.num_paneles
       FROM proyectos p
       JOIN clientes c ON p.cliente_id = c.id
       LEFT JOIN cotizaciones cot ON p.cotizacion_id = cot.id
       WHERE p.id = ? AND (p.empresa_id = ? OR ? = 1 OR p.empresa_id IS NULL)`,
      [req.params.id, req.user.empresa_id, req.user.es_superadmin ? 1 : 0]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Instalación no encontrada' });
    const r = rows[0];
    const pasos = parsePasos(r);
    res.json({ ...r, pasos, progreso: calcProgreso(pasos), paso_actual: pasoActualNombre(pasos) });
  } catch (error) {
    console.error('Error fetching proyecto:', error);
    res.status(500).json({ error: 'Error al obtener instalación' });
  }
});

router.post('/', async (req, res) => {
  try {
    await ensureInstalacionesSchema();
    const { nombre, cliente_id, cotizacion_id, fecha_entrega_estimada, notas } = req.body;

    let clienteId = cliente_id;
    let nombreProyecto = nombre;
    let cotId = cotizacion_id || null;

    if (cotId) {
      const [cots] = await pool.execute(
        `SELECT c.*, cl.nombre as cliente_nombre FROM cotizaciones c JOIN clientes cl ON c.cliente_id = cl.id
         WHERE c.id = ? AND (c.empresa_id = ? OR (c.empresa_id IS NULL AND cl.empresa_id = ?) OR ? = 1)`,
        [cotId, req.user.empresa_id, req.user.empresa_id, req.user.es_superadmin ? 1 : 0]
      );
      if (cots.length === 0) return res.status(404).json({ error: 'Cotización no encontrada' });
      const cot = cots[0];
      clienteId = clienteId || cot.cliente_id;
      if (!nombreProyecto) {
        nombreProyecto = `Instalación ${cot.codigo || 'PROP-' + cot.id}${cot.titulo ? ' · ' + cot.titulo : ''} - ${cot.cliente_nombre}`;
      }
      if (cot.estado !== 'firmada') {
        try { await pool.execute('UPDATE cotizaciones SET estado = ? WHERE id = ?', ['firmada', cotId]); } catch (e) {}
      }
    }

    if (!nombreProyecto || !clienteId) {
      return res.status(400).json({ error: 'El nombre y el cliente son obligatorios' });
    }

    const pasos = [];
    const [result] = await pool.execute(
      `INSERT INTO proyectos (nombre, cliente_id, cotizacion_id, estado_id, estado, fecha_entrega_estimada, notas, empresa_id, tipo, pasos_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'instalacion', ?)`,
      [nombreProyecto, clienteId, cotId, null, 'En ejecución', fecha_entrega_estimada || null, notas || '', req.user.empresa_id, JSON.stringify(pasos)]
    );

    res.status(201).json({ id: result.insertId, message: 'Instalación creada exitosamente' });
  } catch (error) {
    console.error('Error creating proyecto:', error);
    res.status(500).json({ error: 'Error al crear la instalación' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    await ensureInstalacionesSchema();
    const projectId = req.params.id;
    const { nombre, cliente_id, cotizacion_id, fecha_entrega_estimada, fecha_entrega_real, notas, pasos } = req.body;

    const [rows] = await pool.execute('SELECT * FROM proyectos WHERE id = ? AND (empresa_id = ? OR ? = 1 OR empresa_id IS NULL)', [projectId, req.user.empresa_id, req.user.es_superadmin ? 1 : 0]);
    if (rows.length === 0) return res.status(404).json({ error: 'Instalación no encontrada' });

    let pasosFinal = parsePasos(rows[0]);
    if (Array.isArray(pasos)) {
      pasosFinal = pasos.map(normalizePaso).sort((a, b) => (a.orden || 0) - (b.orden || 0)).map((p, i) => ({ ...p, orden: i + 1 }));
    }

    const progreso = calcProgreso(pasosFinal);
    const estadoNombre = pasosFinal.length === 0 ? 'Sin etapas' : (pasosFinal.every(p => p.completado) ? 'Completada' : pasoActualNombre(pasosFinal));

    await pool.execute(
      `UPDATE proyectos SET
          nombre = COALESCE(?, nombre),
          cliente_id = COALESCE(?, cliente_id),
          cotizacion_id = COALESCE(?, cotizacion_id),
          estado = ?,
          fecha_entrega_estimada = COALESCE(?, fecha_entrega_estimada),
          fecha_entrega_real = COALESCE(?, fecha_entrega_real),
          notas = COALESCE(?, notas),
          pasos_json = ?,
          updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [nombre ?? null, cliente_id ?? null, cotizacion_id ?? null, estadoNombre,
       fecha_entrega_estimada ?? null, fecha_entrega_real ?? null, notas ?? null,
       JSON.stringify(pasosFinal), projectId]
    );

    res.json({ message: 'Instalación actualizada', estado: estadoNombre, progreso, pasos: pasosFinal });
  } catch (error) {
    console.error('Error updating proyecto:', error);
    res.status(500).json({ error: 'Error al actualizar la instalación' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await ensureInstalacionesSchema();
    const [result] = await pool.execute('DELETE FROM proyectos WHERE id = ? AND (empresa_id = ? OR ? = 1 OR empresa_id IS NULL)', [req.params.id, req.user.empresa_id, req.user.es_superadmin ? 1 : 0]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Instalación no encontrada' });
    res.json({ message: 'Instalación eliminada' });
  } catch (error) {
    console.error('Error deleting proyecto:', error);
    res.status(500).json({ error: 'Error al eliminar la instalación' });
  }
});

// Compatibilidad tareas legacy
router.get('/:id/tareas', async (req, res) => { res.json([]); });
router.post('/:id/tareas', async (req, res) => { res.status(410).json({ error: 'Usa los pasos y tareas dentro de la instalación' }); });
router.put('/tareas/:tareaId', async (req, res) => { res.status(410).json({ error: 'Usa los pasos y tareas dentro de la instalación' }); });
router.delete('/tareas/:tareaId', async (req, res) => { res.status(410).json({ error: 'Usa los pasos y tareas dentro de la instalación' }); });

module.exports = router;
