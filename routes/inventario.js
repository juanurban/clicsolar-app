const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const pool = require('../db');

// Configure multer for file uploads
const uploadsDir = path.join(__dirname, '..', 'static', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => cb(null, file.originalname)
});
const upload = multer({ storage });

// ── List Equipment ──
router.get('/', async (req, res) => {
  try {
    const { categoria, buscar, activo } = req.query;
    let query = 'SELECT * FROM equipos WHERE 1=1';
    const params = [];

    if (categoria) { query += ' AND categoria = ?'; params.push(categoria); }
    if (buscar) {
      query += ' AND (marca LIKE ? OR modelo LIKE ? OR descripcion LIKE ?)';
      const s = `%${buscar}%`;
      params.push(s, s, s);
    }
    if (activo !== undefined && activo !== '') { query += ' AND activo = ?'; params.push(parseInt(activo)); }

    query += ' ORDER BY categoria, marca, modelo';
    const [rows] = await pool.execute(query, params);
    res.json({ data: rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ detail: 'Error del servidor' });
  }
});

// ── Get Equipment by ID ──
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM equipos WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ detail: 'Equipo no encontrado' });
    res.json(rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ detail: 'Error del servidor' });
  }
});

// ── Create Equipment ──
router.post('/', async (req, res) => {
  try {
    const d = req.body;
    const [result] = await pool.execute(
      `INSERT INTO equipos (categoria, marca, modelo, descripcion, potencia_wp, potencia_kw,
        capacidad_kwh, tipo, costo, precio_venta, utilidad_pct, unidad, peso_kg, area_m2, activo, imagen_url, iva)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [d.categoria, d.marca || '', d.modelo || '', d.descripcion || '', d.potencia_wp || 0,
       d.potencia_kw || 0, d.capacidad_kwh || 0, d.tipo || '', d.costo || 0, d.precio_venta || 0,
       d.utilidad_pct || 0, d.unidad || 'und', d.peso_kg || 0, d.area_m2 || 0,
       d.activo !== undefined ? d.activo : 1, d.imagen_url || '', d.iva !== undefined ? d.iva : 1]
    );
    res.json({ id: result.insertId, message: 'Equipo creado exitosamente' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ detail: 'Error del servidor' });
  }
});

// ── Update Equipment ──
router.put('/:id', async (req, res) => {
  try {
    const [existing] = await pool.execute('SELECT id FROM equipos WHERE id = ?', [req.params.id]);
    if (existing.length === 0) return res.status(404).json({ detail: 'Equipo no encontrado' });

    const d = req.body;
    await pool.execute(
      `UPDATE equipos SET categoria=?, marca=?, modelo=?, descripcion=?, potencia_wp=?,
       potencia_kw=?, capacidad_kwh=?, tipo=?, costo=?, precio_venta=?, utilidad_pct=?, unidad=?,
       peso_kg=?, area_m2=?, activo=?, imagen_url=?, iva=? WHERE id=?`,
      [d.categoria, d.marca || '', d.modelo || '', d.descripcion || '', d.potencia_wp || 0,
       d.potencia_kw || 0, d.capacidad_kwh || 0, d.tipo || '', d.costo || 0, d.precio_venta || 0,
       d.utilidad_pct || 0, d.unidad || 'und', d.peso_kg || 0, d.area_m2 || 0,
       d.activo !== undefined ? d.activo : 1, d.imagen_url || '', d.iva !== undefined ? d.iva : 1, req.params.id]
    );
    res.json({ message: 'Equipo actualizado exitosamente' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ detail: 'Error del servidor' });
  }
});

// ── Delete Equipment ──
router.delete('/:id', async (req, res) => {
  try {
    const [existing] = await pool.execute('SELECT id FROM equipos WHERE id = ?', [req.params.id]);
    if (existing.length === 0) return res.status(404).json({ detail: 'Equipo no encontrado' });

    await pool.execute('DELETE FROM equipos WHERE id = ?', [req.params.id]);
    res.json({ message: 'Equipo eliminado exitosamente' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ detail: 'Error del servidor' });
  }
});

// ── Upload Image ──
router.post('/upload-imagen', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ detail: 'No se proporcionó archivo' });
  res.json({ url: `/static/uploads/${req.file.filename}` });
});

// ── Bulk Delete ──
router.post('/bulk-delete', async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids || ids.length === 0) return res.status(400).json({ detail: 'No se proporcionaron IDs' });

    const placeholders = ids.map(() => '?').join(',');
    await pool.execute(`DELETE FROM equipos WHERE id IN (${placeholders})`, ids);
    res.json({ message: `${ids.length} ítems eliminados exitosamente` });
  } catch (error) {
    console.error(error);
    res.status(500).json({ detail: 'Error del servidor' });
  }
});

module.exports = router;
