const express = require('express');
const router = express.Router();
const pool = require('../db');

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
      if (c.historial_consumo && typeof c.historial_consumo === 'string') {
        try { c.historial_consumo = JSON.parse(c.historial_consumo); } catch { c.historial_consumo = []; }
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
    const historial = JSON.stringify(d.historial_consumo || []);
    let consumo = d.consumo_mensual_kwh || 0;
    if (d.historial_consumo && d.historial_consumo.length > 0 && consumo === 0) {
      consumo = d.historial_consumo.reduce((a, b) => a + b, 0) / d.historial_consumo.length;
    }

    const [result] = await pool.execute(
      `INSERT INTO clientes (nombre, cedula_nit, direccion, telefono, correo, ciudad,
        operador_red, tipo_tarifa, consumo_mensual_kwh, costo_kwh, hsp, cargas_especiales_kwh_dia, historial_consumo)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [d.nombre, d.cedula_nit || '', d.direccion || '', d.telefono || '', d.correo || '',
       d.ciudad || '', d.operador_red || '', d.tipo_tarifa || 'Residencial', consumo,
       d.costo_kwh || 0, d.hsp || 4.2, d.cargas_especiales_kwh_dia || 0, historial]
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
    const historial = JSON.stringify(d.historial_consumo || []);
    let consumo = d.consumo_mensual_kwh || 0;
    if (d.historial_consumo && d.historial_consumo.length > 0 && consumo === 0) {
      consumo = d.historial_consumo.reduce((a, b) => a + b, 0) / d.historial_consumo.length;
    }

    await pool.execute(
      `UPDATE clientes SET nombre=?, cedula_nit=?, direccion=?, telefono=?, correo=?,
       ciudad=?, operador_red=?, tipo_tarifa=?, consumo_mensual_kwh=?, costo_kwh=?,
       hsp=?, cargas_especiales_kwh_dia=?, historial_consumo=? WHERE id=?`,
      [d.nombre, d.cedula_nit || '', d.direccion || '', d.telefono || '', d.correo || '',
       d.ciudad || '', d.operador_red || '', d.tipo_tarifa || 'Residencial', consumo,
       d.costo_kwh || 0, d.hsp || 4.2, d.cargas_especiales_kwh_dia || 0, historial, req.params.id]
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
    res.status(400).json({ detail: `No se pudo eliminar el cliente: ${error.message}` });
  }
});

module.exports = router;
