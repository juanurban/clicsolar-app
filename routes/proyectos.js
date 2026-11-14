const express = require('express');
const router = express.Router();
const pool = require('../db');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const { uploadsDir } = require('../utils/uploadStorage');
const uploadBase = uploadsDir('proyectos');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(uploadBase, String(req.params.id));
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const crypto = require('crypto');
    const safeName = crypto.randomBytes(4).toString('hex') + '_' + file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, safeName);
  }
});
const upload = multer({ storage });

async function ensureInstalacionesSchema() {
  const safeAlter = async (sql) => { try { await pool.execute(sql); } catch (e) { /* ignore */ } };
  await safeAlter("ALTER TABLE proyectos ADD COLUMN tipo TEXT DEFAULT 'instalacion'");
  await safeAlter("ALTER TABLE proyectos ADD COLUMN empresa_id INTEGER");
  await safeAlter("ALTER TABLE proyectos ADD COLUMN pasos_json TEXT DEFAULT '[]'");
  await safeAlter("ALTER TABLE proyectos ADD COLUMN bom_json TEXT DEFAULT '[]'");
  await safeAlter("ALTER TABLE proyectos ADD COLUMN bitacora_json TEXT DEFAULT '[]'");
  await safeAlter("ALTER TABLE proyectos ADD COLUMN costos_reales_json TEXT DEFAULT '{}'");
}

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

function normalizeSubtarea(s, i) {
  return { id: String(s?.id || uid() + 's' + i), titulo: String(s?.titulo ?? s?.nombre ?? '').trim(), completada: !!s?.completada };
}
function normalizeTarea(t, i) {
  const subtareas = Array.isArray(t?.subtareas) ? t.subtareas.map(normalizeSubtarea) : [];
  const completada = subtareas.length > 0 ? subtareas.every(s => s.completada) : !!t?.completada;
  return {
    id: String(t?.id || uid() + 't' + i),
    titulo: String(t?.titulo ?? t?.nombre ?? t?.descripcion ?? '').trim(),
    completada,
    fecha_limite: t?.fecha_limite || t?.fecha || null,
    responsable: String(t?.responsable ?? '').trim(),
    subtareas
  };
}
function normalizePaso(p, i) {
  const tareas = Array.isArray(p?.tareas) ? p.tareas.map(normalizeTarea) : [];
  const completado = tareas.length > 0 ? tareas.every(t => t.completada) : !!p?.completado;
  return { id: String(p?.id || uid() + 'p' + i), nombre: String(p?.nombre ?? p?.titulo ?? `Etapa ${i + 1}`).trim() || `Etapa ${i + 1}`, orden: i + 1, completado, tareas };
}
function parsePasos(row) {
  let pasos = [];
  try { pasos = row?.pasos_json ? (typeof row.pasos_json === 'string' ? JSON.parse(row.pasos_json) : row.pasos_json) : []; } catch (e) { pasos = []; }
  if (!Array.isArray(pasos)) pasos = [];
  const looksOld = pasos.length && pasos.every(p => p && !Array.isArray(p.tareas) && ('completado' in p) && ('nombre' in p));
  if (looksOld) {
    pasos = pasos.map((p, i) => ({ id: String(p.id || uid()+'p'+i), nombre: String(p.nombre||`Etapa ${i+1}`), orden: i+1, completado: !!p.completado, tareas: [] }));
  }
  return pasos.map(normalizePaso);
}
function parseJsonField(row, field, fallback) {
  let v = row?.[field];
  try { v = v ? (typeof v === 'string' ? JSON.parse(v) : v) : fallback; } catch (e) { v = fallback; }
  return v ?? fallback;
}
function calcProgreso(pasos) {
  const items = [];
  (pasos||[]).forEach(p => (p.tareas||[]).forEach(t => {
    if ((t.subtareas||[]).length) t.subtareas.forEach(s => items.push(!!s.completada)); else items.push(!!t.completada);
  }));
  const total = items.length, completados = items.filter(Boolean).length;
  return { tareasCompletadas: completados, tareasTotal: total, pasosCompletados: (pasos||[]).filter(p=>p.completado).length, pasosTotal: (pasos||[]).length, pct: total ? Math.round((completados/total)*100) : 0 };
}
function pasoActualNombre(pasos) { if (!pasos?.length) return 'Sin etapas'; const a = pasos.find(p=>!p.completado); return a ? a.nombre : 'Completada'; }

function buildBomFromCotizacion(cot) {
  let items = [];
  try { items = cot?.items_json ? (typeof cot.items_json === 'string' ? JSON.parse(cot.items_json) : cot.items_json) : []; } catch (e) { items = []; }
  if (items && !Array.isArray(items) && Array.isArray(items.items)) items = items.items;
  if (!Array.isArray(items)) items = [];
  return items.map((it, i) => ({
    id: String(uid() + 'b' + i),
    equipo_id: it.equipo_id || it.id_equipo || null,
    categoria: it.categoria || '',
    nombre: it.nombre || it.descripcion || '',
    cantidad: Number(it.cantidad) || 1,
    unidad: it.unidad || 'und',
    costo_unitario: Number(it.costo || it.precio_unitario || 0),
    precio_unitario: Number(it.precio_final || it.precio_unitario || it.costo || 0),
    comprado: false,
    despachado: false,
    instalado: false
  }));
}

async function enrichProyecto(r, req) {
  const pasos = parsePasos(r);
  let bom = parseJsonField(r, 'bom_json', []);
  const bitacora = parseJsonField(r, 'bitacora_json', []);
  const costos_reales = parseJsonField(r, 'costos_reales_json', {});
  let cotizacion = null;
  if (r.cotizacion_id) {
    const [cots] = await pool.execute(
      `SELECT c.*, cl.nombre as cliente_nombre FROM cotizaciones c LEFT JOIN clientes cl ON c.cliente_id = cl.id
       WHERE c.id = ? AND (c.empresa_id = ? OR ? = 1 OR c.empresa_id IS NULL)`, [r.cotizacion_id, req.user.empresa_id, req.user.es_superadmin ? 1 : 0]
    );
    if (cots[0]) {
      const c = cots[0];
      if ((!Array.isArray(bom) || bom.length === 0)) {
        bom = buildBomFromCotizacion(c);
      }
      cotizacion = {
        id: c.id, codigo: c.codigo, titulo: c.titulo, estado: c.estado,
        total_inversion: Number(c.total_inversion)||0, subtotal: Number(c.subtotal)||0,
        margen_comercial_pct: Number(c.margen_comercial_pct)||0,
        potencia_kwp: c.potencia_kwp, num_paneles: c.num_paneles
      };
    }
  }
  if (!Array.isArray(bom)) bom = [];
  if (!Array.isArray(bitacora)) bitacora.sort ? bitacora : [];
  return { ...r, pasos, bom, bitacora: Array.isArray(bitacora)?bitacora:[], costos_reales: (costos_reales && typeof costos_reales==='object' && !Array.isArray(costos_reales))?costos_reales:{}, cotizacion, progreso: calcProgreso(pasos), paso_actual: pasoActualNombre(pasos) };
}

// --- LIST/GET ---
router.get('/', async (req, res) => {
  try {
    await ensureInstalacionesSchema();
    const [rows] = await pool.execute(
      `SELECT p.*, c.nombre as cliente_nombre, cot.codigo as cotizacion_codigo, cot.titulo as cotizacion_titulo
       FROM proyectos p JOIN clientes c ON p.cliente_id = c.id
       LEFT JOIN cotizaciones cot ON p.cotizacion_id = cot.id
       WHERE (p.empresa_id = ? OR ? = 1 OR p.empresa_id IS NULL)
       ORDER BY p.updated_at DESC, p.created_at DESC`,
      [req.user.empresa_id, req.user.es_superadmin ? 1 : 0]
    );
    const data = rows.map(r => { const pasos = parsePasos(r); return { ...r, pasos, progreso: calcProgreso(pasos), paso_actual: pasoActualNombre(pasos) }; });
    res.json(data);
  } catch (error) { console.error('Error fetching proyectos:', error); res.status(500).json({ error: 'Error al obtener instalaciones' }); }
});

router.get('/cotizaciones-disponibles', async (req, res) => {
  try {
    await ensureInstalacionesSchema();
    const [rows] = await pool.execute(
      `SELECT c.id, c.codigo, c.titulo, c.estado, c.total_inversion, c.potencia_kwp, c.fecha, cl.nombre as cliente_nombre, cl.id as cliente_id
       FROM cotizaciones c JOIN clientes cl ON c.cliente_id = cl.id
       WHERE (c.empresa_id = ? OR (c.empresa_id IS NULL AND cl.empresa_id = ?) OR ? = 1)
         AND c.id NOT IN (SELECT cotizacion_id FROM proyectos WHERE cotizacion_id IS NOT NULL)
       ORDER BY c.fecha DESC`,
      [req.user.empresa_id, req.user.empresa_id, req.user.es_superadmin ? 1 : 0]
    );
    res.json(rows);
  } catch (error) { res.status(500).json({ error: 'Error al obtener cotizaciones' }); }
});

router.get('/:id', async (req, res) => {
  try {
    await ensureInstalacionesSchema();
    const [rows] = await pool.execute(
      `SELECT p.*, c.nombre as cliente_nombre, c.telefono as cliente_telefono, c.correo as cliente_correo, c.direccion as cliente_direccion,
              cot.codigo as cotizacion_codigo, cot.titulo as cotizacion_titulo
       FROM proyectos p JOIN clientes c ON p.cliente_id = c.id
       LEFT JOIN cotizaciones cot ON p.cotizacion_id = cot.id
       WHERE p.id = ? AND (p.empresa_id = ? OR ? = 1 OR p.empresa_id IS NULL)`,
      [req.params.id, req.user.empresa_id, req.user.es_superadmin ? 1 : 0]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Instalación no encontrada' });
    res.json(await enrichProyecto(rows[0], req));
  } catch (error) { console.error('Error fetching proyecto:', error); res.status(500).json({ error: 'Error al obtener instalación' }); }
});

router.post('/', async (req, res) => {
  try {
    await ensureInstalacionesSchema();
    const { nombre, cliente_id, cotizacion_id, fecha_entrega_estimada, notas } = req.body;
    let clienteId = cliente_id, nombreProyecto = nombre, cotId = cotizacion_id || null, bom = [];
    if (cotId) {
      const [cots] = await pool.execute(
        `SELECT c.*, cl.nombre as cliente_nombre FROM cotizaciones c JOIN clientes cl ON c.cliente_id = cl.id
         WHERE c.id = ? AND (c.empresa_id = ? OR (c.empresa_id IS NULL AND cl.empresa_id = ?) OR ? = 1)`,
        [cotId, req.user.empresa_id, req.user.empresa_id, req.user.es_superadmin ? 1 : 0]
      );
      if (cots.length === 0) return res.status(404).json({ error: 'Cotización no encontrada' });
      const cot = cots[0];
      clienteId = clienteId || cot.cliente_id;
      if (!nombreProyecto) nombreProyecto = `Instalación ${cot.codigo || 'PROP-' + cot.id}${cot.titulo ? ' · ' + cot.titulo : ''} - ${cot.cliente_nombre}`;
      bom = buildBomFromCotizacion(cot);
      if (cot.estado !== 'firmada') { try { await pool.execute('UPDATE cotizaciones SET estado = ? WHERE id = ?', ['firmada', cotId]); } catch (e) {} }
    }
    if (!nombreProyecto || !clienteId) return res.status(400).json({ error: 'El nombre y el cliente son obligatorios' });
    const [result] = await pool.execute(
      `INSERT INTO proyectos (nombre, cliente_id, cotizacion_id, estado_id, estado, fecha_entrega_estimada, notas, empresa_id, tipo, pasos_json, bom_json, bitacora_json, costos_reales_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'instalacion', ?, ?, ?, ?)`,
      [nombreProyecto, clienteId, cotId, null, 'En ejecución', fecha_entrega_estimada || null, notas || '', req.user.empresa_id, '[]', JSON.stringify(bom), '[]', '{}']
    );
    res.status(201).json({ id: result.insertId, message: 'Instalación creada exitosamente' });
  } catch (error) { console.error('Error creating proyecto:', error); res.status(500).json({ error: 'Error al crear la instalación' }); }
});

router.put('/:id', async (req, res) => {
  try {
    await ensureInstalacionesSchema();
    const [rows] = await pool.execute('SELECT * FROM proyectos WHERE id = ? AND (empresa_id = ? OR ? = 1 OR empresa_id IS NULL)', [req.params.id, req.user.empresa_id, req.user.es_superadmin ? 1 : 0]);
    if (rows.length === 0) return res.status(404).json({ error: 'Instalación no encontrada' });
    const cur = rows[0];
    const { nombre, notas, fecha_entrega_estimada, pasos, bom, bitacora, costos_reales } = req.body;
    let pasosFinal = parsePasos(cur);
    if (Array.isArray(pasos)) pasosFinal = pasos.map(normalizePaso);
    let bomFinal = parseJsonField(cur, 'bom_json', []);
    if (Array.isArray(bom)) bomFinal = bom;
    let bitFinal = parseJsonField(cur, 'bitacora_json', []);
    if (Array.isArray(bitacora)) bitFinal = bitacora;
    let costFinal = parseJsonField(cur, 'costos_reales_json', {});
    if (costos_reales && typeof costos_reales === 'object') costFinal = costos_reales;

    const progreso = calcProgreso(pasosFinal);
    const estadoNombre = pasosFinal.length === 0 ? 'Sin etapas' : (pasosFinal.every(p => p.completado) ? 'Completada' : pasoActualNombre(pasosFinal));
    await pool.execute(
      `UPDATE proyectos SET nombre=COALESCE(?,nombre), estado=?, notas=COALESCE(?,notas), fecha_entrega_estimada=COALESCE(?,fecha_entrega_estimada), pasos_json=?, bom_json=?, bitacora_json=?, costos_reales_json=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
      [nombre ?? null, estadoNombre, notas ?? null, fecha_entrega_estimada ?? null, JSON.stringify(pasosFinal), JSON.stringify(bomFinal), JSON.stringify(bitFinal), JSON.stringify(costFinal), req.params.id]
    );
    const [rows2] = await pool.execute('SELECT p.*, c.nombre as cliente_nombre, c.telefono as cliente_telefono, c.correo as cliente_correo, c.direccion as cliente_direccion, cot.codigo as cotizacion_codigo, cot.titulo as cotizacion_titulo FROM proyectos p JOIN clientes c ON p.cliente_id=c.id LEFT JOIN cotizaciones cot ON p.cotizacion_id=cot.id WHERE p.id=?', [req.params.id]);
    res.json(await enrichProyecto(rows2[0], req));
  } catch (error) { console.error('Error updating proyecto:', error); res.status(500).json({ error: 'Error al actualizar la instalación' }); }
});

router.post('/:id/documentos', upload.single('file'), async (req, res) => {
  try {
    await ensureInstalacionesSchema();
    const [rows] = await pool.execute('SELECT * FROM proyectos WHERE id = ? AND (empresa_id = ? OR ? = 1 OR empresa_id IS NULL)', [req.params.id, req.user.empresa_id, req.user.es_superadmin ? 1 : 0]);
    if (rows.length === 0) return res.status(404).json({ error: 'Instalación no encontrada' });
    if (!req.file) return res.status(400).json({ error: 'No se recibió archivo' });
    const bit = parseJsonField(rows[0], 'bitacora_json', []);
    const tipo = req.body.tipo || 'documento';
    const nota = String(req.body.nota || '').trim();
    const entry = {
      id: uid(),
      tipo,
      nota,
      fecha: new Date().toISOString(),
      autor: req.user?.nombre_completo || req.user?.username || '',
      archivo: {
        nombre: req.file.originalname,
        path: `/static/uploads/proyectos/${req.params.id}/${req.file.filename}`,
        mime: req.file.mimetype,
        size: req.file.size
      }
    };
    bit.unshift(entry);
    await pool.execute('UPDATE proyectos SET bitacora_json=?, updated_at=CURRENT_TIMESTAMP WHERE id=?', [JSON.stringify(bit), req.params.id]);
    res.json({ message: 'Documento agregado', entry, bitacora: bit });
  } catch (error) { console.error('Error uploading doc:', error); res.status(500).json({ error: 'Error al subir documento' }); }
});

router.post('/:id/bitacora-nota', async (req, res) => {
  try {
    await ensureInstalacionesSchema();
    const [rows] = await pool.execute('SELECT * FROM proyectos WHERE id = ? AND (empresa_id = ? OR ? = 1 OR empresa_id IS NULL)', [req.params.id, req.user.empresa_id, req.user.es_superadmin ? 1 : 0]);
    if (rows.length === 0) return res.status(404).json({ error: 'Instalación no encontrada' });
    const bit = parseJsonField(rows[0], 'bitacora_json', []);
    const nota = String(req.body.nota || '').trim();
    if (!nota) return res.status(400).json({ error: 'La nota es obligatoria' });
    const entry = { id: uid(), tipo: 'nota', nota, fecha: new Date().toISOString(), autor: req.user?.nombre_completo || req.user?.username || '' };
    bit.unshift(entry);
    await pool.execute('UPDATE proyectos SET bitacora_json=?, updated_at=CURRENT_TIMESTAMP WHERE id=?', [JSON.stringify(bit), req.params.id]);
    res.json({ message: 'Nota agregada', entry, bitacora: bit });
  } catch (error) { res.status(500).json({ error: 'Error al agregar nota' }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await ensureInstalacionesSchema();
    const [result] = await pool.execute('DELETE FROM proyectos WHERE id = ? AND (empresa_id = ? OR ? = 1 OR empresa_id IS NULL)', [req.params.id, req.user.empresa_id, req.user.es_superadmin ? 1 : 0]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Instalación no encontrada' });
    res.json({ message: 'Instalación eliminada' });
  } catch (error) { res.status(500).json({ error: 'Error al eliminar la instalación' }); }
});

// compat
router.get('/estados', async (req, res) => { try { await ensureInstalacionesSchema(); const [r]=await pool.execute('SELECT * FROM estados_proyecto ORDER BY orden ASC'); res.json(r);} catch(e){res.status(500).json({error:'err'});} });

module.exports = router;
