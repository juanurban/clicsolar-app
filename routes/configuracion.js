const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const pool = require('../db');

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
    const [rows] = await pool.execute("SELECT clave, valor FROM configuracion WHERE empresa_id = (SELECT id FROM empresas ORDER BY id LIMIT 1) AND (clave LIKE 'empresa_%' OR clave LIKE 'diseno_%')");
    const result = {};
    rows.forEach(item => {
      result[item.clave] = item.valor;
    });
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
    const [rows] = await pool.execute('SELECT clave, valor, tipo, descripcion FROM configuracion WHERE empresa_id = ? ORDER BY clave', [empresaId]);
    const result = {};
    rows.forEach(item => {
      result[item.clave] = { valor: item.valor, tipo: item.tipo, descripcion: item.descripcion };
    });
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
