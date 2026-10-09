const express = require('express');
const router = express.Router();
const pool = require('../db');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Las fotos de clientes van al almacén persistente (fuera del repo) para
// sobrevivir a los despliegues automáticos de Hostinger.
const { uploadsDir } = require('../utils/uploadStorage');
const uploadPath = uploadsDir('clientes');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadPath),
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
      query = `SELECT * FROM clientes WHERE (nombre LIKE ? OR cedula_nit LIKE ? OR ciudad LIKE ? OR departamento LIKE ? OR municipio LIKE ? OR correo LIKE ?) AND (empresa_id = ? OR ? = 1) ORDER BY updated_at DESC LIMIT ? OFFSET ?`;
      countQuery = `SELECT COUNT(*) as total FROM clientes WHERE (nombre LIKE ? OR cedula_nit LIKE ? OR ciudad LIKE ? OR departamento LIKE ? OR municipio LIKE ? OR correo LIKE ?) AND (empresa_id = ? OR ? = 1)`;
      params = [search, search, search, search, search, search, req.user.empresa_id, req.user.es_superadmin ? 1 : 0];
    } else {
      query = `SELECT * FROM clientes WHERE (empresa_id = ? OR ? = 1) ORDER BY updated_at DESC LIMIT ? OFFSET ?`;
      countQuery = `SELECT COUNT(*) as total FROM clientes WHERE (empresa_id = ? OR ? = 1)`;
      params = [req.user.empresa_id, req.user.es_superadmin ? 1 : 0];
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
    const [rows] = await pool.execute('SELECT * FROM clientes WHERE id = ? AND (empresa_id = ? OR ? = 1)', [req.params.id, req.user.empresa_id, req.user.es_superadmin ? 1 : 0]);
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

    // El consumo escrito por el usuario manda. El promedio del historial solo se
    // usa como valor de cuando no se envió un consumo explícito. Antes el
    // promedio del historial sobrescribía silenciosamente la corrección manual
    // del cliente (p. ej. un único valor mal leído del recibo) y el cambio se perdía.
    let consumo = parseFloat(d.consumo_mensual_kwh) || 0;
    if (!consumo && hArr.length > 0) {
      consumo = Math.round((hArr.reduce((a, b) => a + Number(b), 0) / hArr.length) * 10) / 10;
    }

    const [result] = await pool.execute(
      `INSERT INTO clientes (nombre, cedula_nit, direccion, telefono, correo, ciudad, departamento, municipio, empresa_id,
        operador_red, tipo_tarifa, consumo_mensual_kwh, costo_kwh, hsp, cargas_especiales_kwh_dia, historial_consumo, archivos_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [d.nombre, d.cedula_nit || '', d.direccion || '', d.telefono || '', d.correo || '',
       d.municipio || d.ciudad || '', d.departamento || '', d.municipio || d.ciudad || '',
       req.user.es_superadmin ? (d.empresa_id || null) : req.user.empresa_id,
       d.operador_red || '', d.tipo_tarifa || 'Residencial', consumo,
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
    const [existing] = await pool.execute('SELECT id FROM clientes WHERE id = ? AND (empresa_id = ? OR ? = 1)', [req.params.id, req.user.empresa_id, req.user.es_superadmin ? 1 : 0]);
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

    // Mismo criterio que en la creación: un valor escrito a mano en el formulario
    // no puede ser reemplazado por el promedio de un historial obsoleto.
    let consumo = parseFloat(d.consumo_mensual_kwh) || 0;
    if (!consumo && hArr.length > 0) {
      consumo = Math.round((hArr.reduce((a, b) => a + Number(b), 0) / hArr.length) * 10) / 10;
    }

    await pool.execute(
      `UPDATE clientes SET nombre=?, cedula_nit=?, direccion=?, telefono=?, correo=?,
       ciudad=?, departamento=?, municipio=?, operador_red=?, tipo_tarifa=?, consumo_mensual_kwh=?, costo_kwh=?,
       hsp=?, cargas_especiales_kwh_dia=?, historial_consumo=?, archivos_json=? WHERE id=?`,
      [d.nombre, d.cedula_nit || '', d.direccion || '', d.telefono || '', d.correo || '',
       d.municipio || d.ciudad || '', d.departamento || '', d.municipio || d.ciudad || '',
       d.operador_red || '', d.tipo_tarifa || 'Residencial', consumo,
       d.costo_kwh || 0, d.hsp || 4.2, d.cargas_especiales_kwh_dia || 0, historial, archivos, req.params.id]
    );
    // El perfil energético nacido de un recibo guarda la lectura original. Si el
    // cliente corrige los meses, ese resumen se queda mentiroso y al abrir el
    // modal otra vez aparece el valor del PDF, por eso se sincroniza aquí.
    if (hArr.length > 0) {
      try {
        const [perfiles] = await pool.execute(
          `SELECT id, resumen_diario_json FROM perfiles_energeticos
           WHERE cliente_id = ? AND hoja_origen = 'Recibo de energía' ORDER BY id DESC LIMIT 1`,
          [req.params.id]
        );
        if (perfiles.length) {
          let resumen = [];
          try {
            resumen = JSON.parse(perfiles[0].resumen_diario_json) || [];
          } catch { resumen = []; }
          const nuevoResumen = hArr.map((valor, index) => ({
            fecha: (resumen[index] && resumen[index].fecha) || `Mes ${index + 1}`,
            consumo_kwh: Number(valor) || 0,
            demanda_max_kw: 0,
            mediciones: 1
          }));
          await pool.execute(
            `UPDATE perfiles_energeticos SET consumo_total_kwh = ?, consumo_diario_promedio_kwh = ?,
             consumo_mensual_estimado_kwh = ?, resumen_diario_json = ? WHERE id = ?`,
            [consumo, Math.round(consumo / 30 * 1000) / 1000, consumo, JSON.stringify(nuevoResumen), perfiles[0].id]
          );
        }
      } catch (perfilError) {
        console.warn('No se pudo sincronizar el perfil energético del cliente:', perfilError.message);
      }
    }

    res.json({ message: 'Cliente actualizado exitosamente' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ detail: 'Error del servidor' });
  }
});

// ── Delete Client ──
router.delete('/:id', async (req, res) => {
  try {
    const [existing] = await pool.execute('SELECT id FROM clientes WHERE id = ? AND (empresa_id = ? OR ? = 1)', [req.params.id, req.user.empresa_id, req.user.es_superadmin ? 1 : 0]);
    if (existing.length === 0) return res.status(404).json({ detail: 'Cliente no encontrado' });

    await pool.execute('DELETE FROM cotizaciones WHERE cliente_id = ?', [req.params.id]);
    await pool.execute('DELETE FROM clientes WHERE id = ?', [req.params.id]);
    res.json({ message: 'Cliente eliminado exitosamente' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ detail: 'Error del servidor' });
  }
});

// ── Persist the attachment list immediately ──
// La pestaña "Archivos Adjuntos" sube el archivo al disco en el momento en que se
// selecciona, pero solo quedaba registrado si el usuario pulsaba "Guardar
// Cliente". Al cerrar el modal (o irse al dimensionamiento) el archivo se
// perdía. Este endpoint guarda el listado en la base de datos al instante.
router.put('/:id/archivos', async (req, res) => {
  try {
    const [existing] = await pool.execute('SELECT id FROM clientes WHERE id = ? AND (empresa_id = ? OR ? = 1)', [req.params.id, req.user.empresa_id, req.user.es_superadmin ? 1 : 0]);
    if (existing.length === 0) return res.status(404).json({ detail: 'Cliente no encontrado' });

    let aArr = req.body.archivos_json;
    while (typeof aArr === 'string') {
      try {
        const p = JSON.parse(aArr);
        if (p === aArr) break;
        aArr = p;
      } catch { break; }
    }
    if (!Array.isArray(aArr)) return res.status(400).json({ detail: 'Listado de archivos inválido' });

    await pool.execute('UPDATE clientes SET archivos_json = ? WHERE id = ?', [JSON.stringify(aArr), req.params.id]);
    res.json({ message: 'Archivos guardados', archivos_json: aArr });
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
