const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const pool = require('../db');
const {
  esConfiguracionPropiaEmpresa,
  resolverLogo,
  esEmpresaPlantas,
  PLANTAS_ASESOR_POR_DEFECTO,
  PLANTAS_TERMINOS_POR_DEFECTO,
  parecePerfilDru
} = require('../utils/empresaConfig');

// Configure multer for config uploads
const uploadsDir = path.join(__dirname, '..', 'static', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const prefix = req.body.prefix || 'file';
    cb(null, `${prefix}_${file.originalname}`);
  }
});
const upload = multer({ storage });

// ── Public Configuration (branding para login) ──
router.get('/public', async (req, res) => {
  try {
    const [companyRows] = await pool.execute('SELECT id, nombre FROM empresas ORDER BY id LIMIT 1');
    const company = companyRows[0] || { id: 1, nombre: 'Plantas Solares de Colombia' };
    const [rows] = await pool.execute("SELECT clave, valor FROM configuracion WHERE empresa_id = ? AND (clave LIKE 'empresa_%' OR clave LIKE 'diseno_%')", [company.id]);
    const result = {};
    rows.forEach(item => {
      result[item.clave] = item.clave === 'empresa_logo'
        ? resolverLogo(item.valor, company.nombre)
        : item.valor;
    });
    if (!result.empresa_logo) result.empresa_logo = resolverLogo('', company.nombre);
    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ detail: 'Error del servidor' });
  }
});

// ── Get All Configuration (per empresa) ──
router.get('/', async (req, res) => {
  try {
    const empresaId = req.user?.empresa_id || 1;
    let [rows] = await pool.execute('SELECT clave, valor, tipo, descripcion FROM configuracion WHERE empresa_id = ? ORDER BY clave', [empresaId]);

    const [companyRows] = await pool.execute('SELECT id, nombre, nit FROM empresas WHERE id = ?', [empresaId]);
    const company = companyRows[0] || { id: empresaId, nombre: 'Plantas Solares de Colombia', nit: '' };

    // Una empresa nueva sólo hereda parámetros generales. Nunca se heredan
    // datos de contacto, asesor, términos, logo ni diseños de otra empresa.
    if (empresaId > 1) {
      const [baseRows] = await pool.execute('SELECT clave, valor, tipo, descripcion FROM configuracion WHERE empresa_id = (SELECT id FROM empresas ORDER BY id LIMIT 1)');
      const existingKeys = new Set(rows.map(item => item.clave));
      for (const item of baseRows) {
        if (existingKeys.has(item.clave) || esConfiguracionPropiaEmpresa(item.clave)) continue;
        await pool.execute(
          'INSERT INTO configuracion (empresa_id, clave, valor, tipo, descripcion) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE valor = VALUES(valor)',
          [empresaId, item.clave, item.valor, item.tipo || 'string', item.descripcion || '']
        );
      }
      await pool.execute(
        'INSERT INTO configuracion (empresa_id, clave, valor) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE valor = VALUES(valor)',
        [empresaId, 'empresa_nombre', company.nombre]
      );
      await pool.execute(
        'INSERT INTO configuracion (empresa_id, clave, valor) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE valor = VALUES(valor)',
        [empresaId, 'empresa_nombre_corto', company.nombre]
      );
      await pool.execute(
        'INSERT INTO configuracion (empresa_id, clave, valor) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE valor = VALUES(valor)',
        [empresaId, 'empresa_nit', company.nit || '']
      );
      [rows] = await pool.execute('SELECT clave, valor, tipo, descripcion FROM configuracion WHERE empresa_id = ? ORDER BY clave', [empresaId]);
    }

    const result = {};
    rows.forEach(item => {
      result[item.clave] = {
        valor: item.clave === 'empresa_logo' ? resolverLogo(item.valor, company.nombre) : item.valor,
        tipo: item.tipo,
        descripcion: item.descripcion
      };
    });
    if (esEmpresaPlantas(company.nombre)) {
      const asesorContaminado = Object.keys(PLANTAS_ASESOR_POR_DEFECTO)
        .some(clave => parecePerfilDru(result[clave]?.valor));
      if (asesorContaminado) {
        for (const [clave, valor] of Object.entries(PLANTAS_ASESOR_POR_DEFECTO)) {
          result[clave] = { ...(result[clave] || {}), valor, tipo: result[clave]?.tipo || 'string' };
        }
      }
      if (parecePerfilDru(result.terminos_condiciones?.valor)) {
        result.terminos_condiciones = {
          ...(result.terminos_condiciones || {}),
          valor: PLANTAS_TERMINOS_POR_DEFECTO,
          tipo: result.terminos_condiciones?.tipo || 'string'
        };
      }
    }
    if (!result.empresa_logo) {
      result.empresa_logo = { valor: resolverLogo('', company.nombre), tipo: 'string', descripcion: 'Logo de la empresa' };
    }
    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ detail: 'Error del servidor' });
  }
});

// ── Update Configuration (per empresa) ──
router.put('/', async (req, res) => {
  try {
    const empresaId = req.user?.empresa_id || 1;
    const { configuracion } = req.body;
    for (const [clave, valor] of Object.entries(configuracion)) {
      await pool.execute('INSERT INTO configuracion (empresa_id, clave, valor) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE valor = VALUES(valor)', [empresaId, clave, String(valor)]);
    }
    res.json({ message: 'Configuración actualizada exitosamente' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ detail: 'Error del servidor' });
  }
});

// ── Upload File ──
router.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ detail: 'No se proporcionó archivo' });
  res.json({ url: `/static/uploads/${req.file.filename}` });
});

module.exports = router;
