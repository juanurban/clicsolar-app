const express = require('express');
const router = express.Router();
const pool = require('../db');

const PASOS_INSTALACION = [
  'Firma del contrato',
  'Giro del anticipo',
  'Visita técnica',
  'Diseño y dimensionamiento',
  'Lista de materiales',
  'Compra de materiales',
  'Cronograma de instalación',
  'Instalación',
  'Pruebas',
  'Entrega',
  'Legalización operador de red',
  'Conexión final'
];

async function ensureInstalacionesSchema() {
  // Columnas adicionales en proyectos
  const safeAlter = async (sql) => { try { await pool.execute(sql); } catch (e) { /* ignore if exists */ } };
  await safeAlter("ALTER TABLE proyectos ADD COLUMN tipo TEXT DEFAULT 'instalacion'");
  await safeAlter("ALTER TABLE proyectos ADD COLUMN empresa_id INTEGER");
  await safeAlter("ALTER TABLE proyectos ADD COLUMN pasos_json TEXT DEFAULT '[]'");

  // Asegurar tareas_proyecto tiene fecha_completada (no crítico, pero útil)
  await safeAlter("ALTER TABLE tareas_proyecto ADD COLUMN fecha_completada TEXT");

  // Sembrar estados/pasos por defecto como estados_proyecto si no hay ninguno relevante
  const [est] = await pool.execute('SELECT COUNT(*) as c FROM estados_proyecto');
  if (est[0].c === 0) {
    const colores = [
      'border-l-4 border-blue-400 bg-surface-container',
      'border-l-4 border-cyan-400 bg-surface-container',
      'border-l-4 border-purple-400 bg-surface-container',
      'border-l-4 border-indigo-400 bg-surface-container',
      'border-l-4 border-yellow-400 bg-surface-container',
      'border-l-4 border-orange-400 bg-surface-container',
      'border-l-4 border-teal-400 bg-surface-container',
      'border-l-4 border-amber-500 bg-surface-container',
      'border-l-4 border-lime-500 bg-surface-container',
      'border-l-4 border-green-500 bg-surface-container',
      'border-l-4 border-emerald-600 bg-surface-container',
      'border-l-4 border-primary bg-surface-container'
    ];
    for (let i = 0; i < PASOS_INSTALACION.length; i++) {
      await pool.execute('INSERT INTO estados_proyecto (nombre, color, orden) VALUES (?, ?, ?)', [PASOS_INSTALACION[i], colores[i] || colores[0], i + 1]);
    }
  }
}

function buildPasosDefault(estadoId) {
  return PASOS_INSTALACION.map((nombre, idx) => ({
    orden: idx + 1,
    nombre,
    completado: false,
    fecha: null,
    notas: '',
    estado_id: null
  }));
}

function parsePasos(row) {
  let pasos = [];
  try { pasos = row.pasos_json ? (typeof row.pasos_json === 'string' ? JSON.parse(row.pasos_json) : row.pasos_json) : []; } catch (e) { pasos = []; }
  if (!Array.isArray(pasos) || pasos.length === 0) {
    pasos = buildPasosDefault(row.estado_id);
  } else {
    // asegurar que todos los pasos estándar existan en orden
    const byName = new Map(pasos.map(p => [String(p.nombre || '').toLowerCase().trim(), p]));
    pasos = PASOS_INSTALACION.map((nombre, idx) => {
      const found = byName.get(nombre.toLowerCase()) || pasos[idx] || {};
      return {
        orden: idx + 1,
        nombre,
        completado: !!found.completado,
        fecha: found.fecha || null,
        notas: found.notas || ''
      };
    });
  }
  return pasos;
}

function syncEstadoFromPasos(pasos, estados) {
  // estado = primer paso no completado, o último si todos completos
  const idx = pasos.findIndex(p => !p.completado);
  const nombrePaso = idx === -1 ? pasos[pasos.length - 1].nombre : pasos[idx].nombre;
  const estado = (estados || []).find(e => (e.nombre || '').toLowerCase().trim() === nombrePaso.toLowerCase().trim());
  return { nombre: nombrePaso, estado_id: estado ? estado.id : null, completado: idx === -1 };
}

// --- ESTADOS / PASOS ---

router.get('/estados', async (req, res) => {
  try {
    await ensureInstalacionesSchema();
    const [rows] = await pool.execute('SELECT * FROM estados_proyecto ORDER BY orden ASC');
    res.json(rows);
  } catch (error) {
    console.error('Error fetching estados:', error);
    res.status(500).json({ error: 'Error fetching estados' });
  }
});

router.post('/estados', async (req, res) => {
  try {
    await ensureInstalacionesSchema();
    const { nombre, color, orden } = req.body;
    if (!nombre) return res.status(400).json({ error: 'El nombre es obligatorio' });
    const [result] = await pool.execute(
      'INSERT INTO estados_proyecto (nombre, color, orden) VALUES (?, ?, ?)',
      [nombre, color || 'border-l-4 border-gray-400 bg-surface-container', orden || 0]
    );
    res.status(201).json({ id: result.insertId, message: 'Estado creado' });
  } catch (error) {
    console.error('Error creating estado:', error);
    res.status(500).json({ error: 'Error al crear estado' });
  }
});

router.put('/estados/:id', async (req, res) => {
  try {
    const { nombre, color, orden } = req.body;
    await pool.execute(
      'UPDATE estados_proyecto SET nombre = COALESCE(?, nombre), color = COALESCE(?, color), orden = COALESCE(?, orden) WHERE id = ?',
      [nombre !== undefined ? nombre : null, color !== undefined ? color : null, orden !== undefined ? orden : null, req.params.id]
    );
    res.json({ message: 'Estado actualizado' });
  } catch (error) {
    console.error('Error updating estado:', error);
    res.status(500).json({ error: 'Error al actualizar estado' });
  }
});

router.delete('/estados/:id', async (req, res) => {
  try {
    const [proyectos] = await pool.execute('SELECT id FROM proyectos WHERE estado_id = ?', [req.params.id]);
    if (proyectos.length > 0) {
      return res.status(400).json({ error: 'No se puede eliminar un estado que tiene instalaciones asignadas' });
    }
    await pool.execute('DELETE FROM estados_proyecto WHERE id = ?', [req.params.id]);
    res.json({ message: 'Estado eliminado' });
  } catch (error) {
    console.error('Error deleting estado:', error);
    res.status(500).json({ error: 'Error al eliminar estado' });
  }
});

// --- INSTALACIONES (PROYECTOS) ---

router.get('/', async (req, res) => {
  try {
    await ensureInstalacionesSchema();
    const query = `
      SELECT p.*, c.nombre as cliente_nombre, cot.codigo as cotizacion_codigo, cot.titulo as cotizacion_titulo,
             e.nombre as estado_nombre, e.color as estado_color
      FROM proyectos p
      JOIN clientes c ON p.cliente_id = c.id
      LEFT JOIN cotizaciones cot ON p.cotizacion_id = cot.id
      LEFT JOIN estados_proyecto e ON p.estado_id = e.id
      WHERE (p.empresa_id = ? OR ? = 1 OR p.empresa_id IS NULL)
      ORDER BY p.updated_at DESC, p.created_at DESC
    `;
    const [rows] = await pool.execute(query, [req.user.empresa_id, req.user.es_superadmin ? 1 : 0]);
    const data = rows.map(r => {
      const pasos = parsePasos(r);
      const completados = pasos.filter(p => p.completado).length;
      return { ...r, pasos, progreso: { completados, total: pasos.length, pct: pasos.length ? Math.round((completados / pasos.length) * 100) : 0 } };
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
         AND c.estado IN ('firmada','enviada','borrador')
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
              cot.codigo as cotizacion_codigo, cot.titulo as cotizacion_titulo, cot.total_inversion, cot.potencia_kwp, cot.num_paneles,
              e.nombre as estado_nombre, e.color as estado_color
       FROM proyectos p
       JOIN clientes c ON p.cliente_id = c.id
       LEFT JOIN cotizaciones cot ON p.cotizacion_id = cot.id
       LEFT JOIN estados_proyecto e ON p.estado_id = e.id
       WHERE p.id = ? AND (p.empresa_id = ? OR ? = 1 OR p.empresa_id IS NULL)`,
      [req.params.id, req.user.empresa_id, req.user.es_superadmin ? 1 : 0]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Instalación no encontrada' });
    const r = rows[0];
    const pasos = parsePasos(r);
    const completados = pasos.filter(p => p.completado).length;
    res.json({ ...r, pasos, progreso: { completados, total: pasos.length, pct: pasos.length ? Math.round((completados / pasos.length) * 100) : 0 } });
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
      // marcar cotización como firmada al convertir en instalación (si no lo está)
      if (cot.estado !== 'firmada') {
        await pool.execute('UPDATE cotizaciones SET estado = ? WHERE id = ?', ['firmada', cotId]);
      }
    }

    if (!nombreProyecto || !clienteId) {
      return res.status(400).json({ error: 'El nombre y el cliente son obligatorios' });
    }

    const [estados] = await pool.execute('SELECT * FROM estados_proyecto ORDER BY orden ASC');
    const pasos = buildPasosDefault(estados[0]?.id);
    const sync = syncEstadoFromPasos(pasos, estados);

    const [result] = await pool.execute(
      `INSERT INTO proyectos (nombre, cliente_id, cotizacion_id, estado_id, estado, fecha_entrega_estimada, notas, empresa_id, tipo, pasos_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'instalacion', ?)`,
      [nombreProyecto, clienteId, cotId, sync.estado_id, sync.nombre, fecha_entrega_estimada || null, notas || '', req.user.empresa_id, JSON.stringify(pasos)]
    );

    res.status(201).json({ id: result.insertId, message: 'Instalación creada exitosamente' });
  } catch (error) {
    console.error('Error creating proyecto:', error);
    res.status(500).json({ error: 'Error al crear la instalación' });
  }
});

router.post('/desde-cotizacion/:cotizacionId', async (req, res) => {
  req.body = { ...(req.body || {}), cotizacion_id: req.params.cotizacionId };
  return router.handle({ ...req, url: '/', method: 'POST' }, res);
});

router.put('/:id', async (req, res) => {
  try {
    await ensureInstalacionesSchema();
    const projectId = req.params.id;
    const { nombre, cliente_id, cotizacion_id, fecha_entrega_estimada, fecha_entrega_real, notas, pasos } = req.body;

    const [rows] = await pool.execute('SELECT * FROM proyectos WHERE id = ? AND (empresa_id = ? OR ? = 1 OR empresa_id IS NULL)', [projectId, req.user.empresa_id, req.user.es_superadmin ? 1 : 0]);
    if (rows.length === 0) return res.status(404).json({ error: 'Instalación no encontrada' });

    let pasosFinal = parsePasos(rows[0]);
    let estadoId = rows[0].estado_id;
    let estadoNombre = rows[0].estado;

    if (Array.isArray(pasos)) {
      const [estados] = await pool.execute('SELECT * FROM estados_proyecto ORDER BY orden ASC');
      // merge por nombre/orden
      const incoming = new Map();
      pasos.forEach((p, i) => incoming.set((p.nombre || PASOS_INSTALACION[i] || '').toLowerCase().trim(), p));
      pasosFinal = PASOS_INSTALACION.map((nombre, idx) => {
        const prev = pasosFinal[idx] || {};
        const inc = incoming.get(nombre.toLowerCase()) || pasos[idx] || {};
        const completado = inc.completado !== undefined ? !!inc.completado : !!prev.completado;
        return {
          orden: idx + 1,
          nombre,
          completado,
          fecha: inc.fecha !== undefined ? (inc.fecha || null) : (prev.fecha || null),
          notas: inc.notas !== undefined ? (inc.notas || '') : (prev.notas || '')
        };
      });
      const sync = syncEstadoFromPasos(pasosFinal, estados);
      estadoId = sync.estado_id; estadoNombre = sync.nombre;
    }

    await pool.execute(
      `UPDATE proyectos SET
          nombre = COALESCE(?, nombre),
          cliente_id = COALESCE(?, cliente_id),
          cotizacion_id = COALESCE(?, cotizacion_id),
          estado_id = ?,
          estado = ?,
          fecha_entrega_estimada = COALESCE(?, fecha_entrega_estimada),
          fecha_entrega_real = COALESCE(?, fecha_entrega_real),
          notas = COALESCE(?, notas),
          pasos_json = ?,
          updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [nombre ?? null, cliente_id ?? null, cotizacion_id ?? null, estadoId, estadoNombre,
       fecha_entrega_estimada ?? null, fecha_entrega_real ?? null, notas ?? null,
       JSON.stringify(pasosFinal), projectId]
    );

    const completados = pasosFinal.filter(p => p.completado).length;
    res.json({ message: 'Instalación actualizada', estado: estadoNombre, estado_id: estadoId, progreso: { completados, total: pasosFinal.length, pct: Math.round((completados / pasosFinal.length) * 100) } });
  } catch (error) {
    console.error('Error updating proyecto:', error);
    res.status(500).json({ error: 'Error al actualizar la instalación' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const [result] = await pool.execute('DELETE FROM proyectos WHERE id = ? AND (empresa_id = ? OR ? = 1 OR empresa_id IS NULL)', [req.params.id, req.user.empresa_id, req.user.es_superadmin ? 1 : 0]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Instalación no encontrada' });
    res.json({ message: 'Instalación eliminada' });
  } catch (error) {
    console.error('Error deleting proyecto:', error);
    res.status(500).json({ error: 'Error al eliminar la instalación' });
  }
});

// Compatibilidad tareas (no usadas en UI nueva, pero mantenidas)
router.get('/:id/tareas', async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT t.* FROM tareas_proyecto t JOIN proyectos p ON p.id = t.proyecto_id WHERE t.proyecto_id = ? ORDER BY t.created_at ASC', [req.params.id]);
    res.json(rows);
  } catch (error) { res.status(500).json({ error: 'Error fetching tareas' }); }
});
router.post('/:id/tareas', async (req, res) => {
  try {
    const { descripcion } = req.body;
    if (!descripcion) return res.status(400).json({ error: 'La descripción es obligatoria' });
    const [result] = await pool.execute('INSERT INTO tareas_proyecto (proyecto_id, descripcion, completada) VALUES (?, ?, 0)', [req.params.id, descripcion]);
    res.status(201).json({ id: result.insertId });
  } catch (error) { res.status(500).json({ error: 'Error al crear tarea' }); }
});
router.put('/tareas/:tareaId', async (req, res) => {
  try {
    await pool.execute('UPDATE tareas_proyecto SET completada = ? WHERE id = ?', [req.body.completada ? 1 : 0, req.params.tareaId]);
    res.json({ message: 'ok' });
  } catch (error) { res.status(500).json({ error: 'Error al actualizar tarea' }); }
});
router.delete('/tareas/:tareaId', async (req, res) => {
  try { await pool.execute('DELETE FROM tareas_proyecto WHERE id = ?', [req.params.tareaId]); res.json({ message: 'ok' }); }
  catch (error) { res.status(500).json({ error: 'Error al eliminar tarea' }); }
});

module.exports = router;
