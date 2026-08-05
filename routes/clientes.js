const express = require('express');
const router = express.Router();
const pool = require('../db');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const uploadsDir = path.join(__dirname, '..', 'static', 'uploads', 'clientes');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const crypto = require('crypto');
    const safeName = crypto.randomBytes(4).toString('hex') + '_' + file.originalname;
    cb(null, safeName);
  }
});
const upload = multer({ storage });

// ── List Clients ──
router.get('/', async (req, res) => {
  try {
    const { buscar, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let query, countQuery, params = [];

    if (buscar) {
      const search = `%${buscar}%`;
      query = `SELECT * FROM clientes WHERE nombre LIKE ? OR cedula_nit LIKE ? OR ciudad LIKE ? OR correo LIKE ? ORDER BY updated_at DESC LIMIT ? OFFSET ?`;
      countQuery = `SELECT COUNT(*) as total FROM clientes WHERE nombre LIKE ? OR cedula_nit LIKE ? OR ciudad LIKE ? OR correo LIKE ?`;
      params = [search, search, search, search];
    } else {
      query = `SELECT * FROM clientes ORDER BY updated_at DESC LIMIT ? OFFSET ?`;
      countQuery = `SELECT COUNT(*) as total FROM clientes`;
      params = [];
    }

    const [countRows] = await pool.execute(countQuery, params);
    const total = countRows[0].total;

    params.push(parseInt(limit), offset);
    const [rows] = await pool.execute(query, params);

    // Parse historial_consumo JSON
    rows.forEach(c => {
      if (c.historial_consumo) {
        let h = c.historial_consumo;
        while (typeof h === 'string') {
          try {
            const p = JSON.parse(h);
            if (p === h) break;
            h = p;
          } catch { break; }
        }
        c.historial_consumo = Array.isArray(h) ? h : [];
      }
      if (c.archivos_json) {
        let a = c.archivos_json;
        while (typeof a === 'string') {
          try {
            const p = JSON.parse(a);
            if (p === a) break;
            a = p;
          } catch { break; }
        }
        c.archivos_json = Array.isArray(a) ? a : [];
      }
    });

    res.json({ data: rows, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ detail: 'Error del servidor' });
  }
});

// ── Get Client by ID ──
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM clientes WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ detail: 'Cliente no encontrado' });

    const cliente = rows[0];
    if (cliente.historial_consumo) {
      let h = cliente.historial_consumo;
      while (typeof h === 'string') {
        try {
          const p = JSON.parse(h);
          if (p === h) break;
          h = p;
        } catch { break; }
      }
      cliente.historial_consumo = Array.isArray(h) ? h : [];
    }
    if (cliente.archivos_json) {
      let a = cliente.archivos_json;
      while (typeof a === 'string') {
        try {
          const p = JSON.parse(a);
          if (p === a) break;
          a = p;
        } catch { break; }
      }
      cliente.archivos_json = Array.isArray(a) ? a : [];
    }
    res.json(cliente);
  } catch (error) {
    console.error(error);
    res.status(500).json({ detail: 'Error del servidor' });
  }
});

// ── Create Client ──
router.post('/', async (req, res) => {
  try {
    const d = req.body;
    let hArr = d.historial_consumo;
    while (typeof hArr === 'string') {
      try {
        const p = JSON.parse(hArr);
        if (p === hArr) break;
        hArr = p;
      } catch { break; }
    }
    if (!Array.isArray(hArr)) hArr = [];
    const historial = JSON.stringify(hArr);

    let aArr = d.archivos_json;
    while (typeof aArr === 'string') {
      try {
        const p = JSON.parse(aArr);
        if (p === aArr) break;
        aArr = p;
      } catch { break; }
    }
    if (!Array.isArray(aArr)) aArr = [];
    const archivos = JSON.stringify(aArr);

    let consumo = d.consumo_mensual_kwh || 0;
    if (hArr.length > 0) {
      consumo = Math.round((hArr.reduce((a, b) => a + Number(b), 0) / hArr.length) * 10) / 10;
    }

    const [result] = await pool.execute(
      `INSERT INTO clientes (nombre, cedula_nit, direccion, telefono, correo, ciudad,
        operador_red, tipo_tarifa, consumo_mensual_kwh, costo_kwh, hsp, cargas_especiales_kwh_dia, historial_consumo, archivos_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [d.nombre, d.cedula_nit || '', d.direccion || '', d.telefono || '', d.correo || '',
       d.ciudad || '', d.operador_red || '', d.tipo_tarifa || 'Residencial', consumo,
       d.costo_kwh || 0, d.hsp || 4.2, d.cargas_especiales_kwh_dia || 0, historial, archivos]
    );
    res.json({ id: result.insertId, message: 'Cliente creado exitosamente' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ detail: 'Error del servidor' });
  }
});

// ── Update Client ──
router.put('/:id', async (req, res) => {
  try {
    const [existing] = await pool.execute('SELECT id FROM clientes WHERE id = ?', [req.params.id]);
    if (existing.length === 0) return res.status(404).json({ detail: 'Cliente no encontrado' });

    const d = req.body;
    let hArr = d.historial_consumo;
    while (typeof hArr === 'string') {
      try {
        const p = JSON.parse(hArr);
        if (p === hArr) break;
        hArr = p;
      } catch { break; }
    }
    if (!Array.isArray(hArr)) hArr = [];
    const historial = JSON.stringify(hArr);

    let aArr = d.archivos_json;
    while (typeof aArr === 'string') {
      try {
        const p = JSON.parse(aArr);
        if (p === aArr) break;
        aArr = p;
      } catch { break; }
    }
    if (!Array.isArray(aArr)) aArr = [];
    const archivos = JSON.stringify(aArr);

    let consumo = d.consumo_mensual_kwh || 0;
    if (hArr.length > 0) {
      consumo = Math.round((hArr.reduce((a, b) => a + Number(b), 0) / hArr.length) * 10) / 10;
    }

    await pool.execute(
      `UPDATE clientes SET nombre=?, cedula_nit=?, direccion=?, telefono=?, correo=?,
       ciudad=?, operador_red=?, tipo_tarifa=?, consumo_mensual_kwh=?, costo_kwh=?,
       hsp=?, cargas_especiales_kwh_dia=?, historial_consumo=?, archivos_json=? WHERE id=?`,
      [d.nombre, d.cedula_nit || '', d.direccion || '', d.telefono || '', d.correo || '',
       d.ciudad || '', d.operador_red || '', d.tipo_tarifa || 'Residencial', consumo,
       d.costo_kwh || 0, d.hsp || 4.2, d.cargas_especiales_kwh_dia || 0, historial, archivos, req.params.id]
    );
    res.json({ message: 'Cliente actualizado exitosamente' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ detail: 'Error del servidor' });
  }
});

// ── Delete Client ──
router.delete('/:id', async (req, res) => {
  try {
    const [existing] = await pool.execute('SELECT id FROM clientes WHERE id = ?', [req.params.id]);
    if (existing.length === 0) return res.status(404).json({ detail: 'Cliente no encontrado' });

    await pool.execute('DELETE FROM cotizaciones WHERE cliente_id = ?', [req.params.id]);
    await pool.execute('DELETE FROM clientes WHERE id = ?', [req.params.id]);
    res.json({ message: 'Cliente eliminado exitosamente' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ detail: 'Error del servidor' });
  }
});

// ── Upload Endpoint ──
router.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ detail: 'No se proporcionó archivo' });
  res.json({ url: `/static/uploads/clientes/${req.file.filename}`, name: req.file.originalname });
});

module.exports = router;
