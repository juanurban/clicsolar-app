const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const pool = require('../db');
const { getCurrentUser } = require('./auth');
const { esConfiguracionPropiaEmpresa } = require('../utils/empresaConfig');

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  return { salt, hash: crypto.createHash('sha256').update(salt + password).digest('hex') };
}

async function requireSuperadmin(req, res) {
  const user = await getCurrentUser(req);
  if (!user) { res.status(401).json({ detail: 'No autenticado' }); return null; }
  if (!user.es_superadmin) { res.status(403).json({ detail: 'Solo el superadmin puede administrar empresas' }); return null; }
  return user;
}

router.get('/', async (req, res) => {
  try {
    if (!await requireSuperadmin(req, res)) return;
    const [rows] = await pool.execute(`
      SELECT e.*, COUNT(DISTINCT u.id) AS usuarios_count,
             COUNT(DISTINCT c.id) AS clientes_count,
             COUNT(DISTINCT cot.id) AS cotizaciones_count,
             COUNT(DISTINCT p.id) AS proyectos_count
      FROM empresas e
      LEFT JOIN usuarios u ON u.empresa_id = e.id
      LEFT JOIN clientes c ON c.empresa_id = e.id
      LEFT JOIN cotizaciones cot ON cot.empresa_id = e.id
      LEFT JOIN proyectos p ON p.empresa_id = e.id
      GROUP BY e.id ORDER BY e.id DESC
    `);
    res.json(rows);
  } catch (error) { console.error(error); res.status(500).json({ detail: 'Error del servidor' }); }
});

router.post('/', async (req, res) => {
  try {
    if (!await requireSuperadmin(req, res)) return;
    const { nombre, nit = '', admin } = req.body;
    if (!nombre || !admin?.username || !admin?.password || !admin?.nombre_completo) {
      return res.status(400).json({ detail: 'Empresa y datos completos del administrador son obligatorios' });
    }
    if (String(admin.password).length < 8) return res.status(400).json({ detail: 'La contraseña debe tener al menos 8 caracteres' });
    const [existingUser] = await pool.execute('SELECT id FROM usuarios WHERE username = ?', [admin.username]);
    if (existingUser.length) return res.status(400).json({ detail: 'El nombre de usuario ya existe' });
    const [profiles] = await pool.execute("SELECT id FROM perfiles WHERE nombre = 'Administrador' ORDER BY id LIMIT 1");
    if (!profiles.length) return res.status(500).json({ detail: 'No existe el perfil Administrador' });
    const [company] = await pool.execute('INSERT INTO empresas (nombre, nit) VALUES (?, ?)', [nombre, nit]);
    const { hash, salt } = hashPassword(admin.password);
    await pool.execute(
      'INSERT INTO usuarios (username, password_hash, password_salt, nombre_completo, correo, perfil_id, empresa_id, es_superadmin, activo) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 1)',
      [admin.username, hash, salt, admin.nombre_completo, admin.correo || '', profiles[0].id, company.insertId]
    );
    // Inventario global: los equipos y servicios son únicos en la base de datos.
    // Cada empresa comienza con su propia configuración editable
    const [baseConfig] = await pool.execute('SELECT clave, valor, tipo, descripcion FROM configuracion WHERE empresa_id = (SELECT id FROM empresas ORDER BY id LIMIT 1)');
    for (const conf of baseConfig) {
      if (esConfiguracionPropiaEmpresa(conf.clave)) continue;
      await pool.execute(
        'INSERT INTO configuracion (empresa_id, clave, valor, tipo, descripcion) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE valor = VALUES(valor)',
        [company.insertId, conf.clave, conf.valor, conf.tipo || 'string', conf.descripcion || '']
      );
    }
    await pool.execute('INSERT INTO configuracion (empresa_id, clave, valor) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE valor = VALUES(valor)', [company.insertId, 'empresa_nombre', nombre]);
    await pool.execute('INSERT INTO configuracion (empresa_id, clave, valor) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE valor = VALUES(valor)', [company.insertId, 'empresa_nombre_corto', nombre]);
    await pool.execute('INSERT INTO configuracion (empresa_id, clave, valor) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE valor = VALUES(valor)', [company.insertId, 'empresa_nit', nit || '']);

    res.status(201).json({ id: company.insertId, message: 'Empresa y administrador creados' });
  } catch (error) { console.error(error); res.status(500).json({ detail: 'Error del servidor' }); }
});

router.put('/:id', async (req, res) => {
  try {
    if (!await requireSuperadmin(req, res)) return;
    const [existing] = await pool.execute('SELECT id FROM empresas WHERE id = ?', [req.params.id]);
    if (!existing.length) return res.status(404).json({ detail: 'Empresa no encontrada' });
    const { nombre, nit, activo } = req.body;
    await pool.execute('UPDATE empresas SET nombre = COALESCE(?, nombre), nit = COALESCE(?, nit), activo = COALESCE(?, activo), updated_at = NOW() WHERE id = ?', [nombre, nit, activo, req.params.id]);
    if (nombre !== undefined && nombre !== null) {
      await pool.execute('INSERT INTO configuracion (empresa_id, clave, valor) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE valor = VALUES(valor)', [req.params.id, 'empresa_nombre', nombre]);
    }
    if (nit !== undefined && nit !== null) {
      await pool.execute('INSERT INTO configuracion (empresa_id, clave, valor) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE valor = VALUES(valor)', [req.params.id, 'empresa_nit', nit]);
    }
    res.json({ message: 'Empresa actualizada' });
  } catch (error) { console.error(error); res.status(500).json({ detail: 'Error del servidor' }); }
});

// Eliminación: sólo permitida si la empresa no tiene datos de negocio
// (clientes, cotizaciones, proyectos o perfiles energéticos). Con datos,
// la opción correcta es desactivarla, para no perder historial.
router.delete('/:id', async (req, res) => {
  try {
    if (!await requireSuperadmin(req, res)) return;
    const id = Number(req.params.id);
    const [existing] = await pool.execute('SELECT id, nombre FROM empresas WHERE id = ?', [id]);
    if (!existing.length) return res.status(404).json({ detail: 'Empresa no encontrada' });
    const [counts] = await pool.execute(`
      SELECT
        (SELECT COUNT(*) FROM clientes WHERE empresa_id = ?) AS clientes,
        (SELECT COUNT(*) FROM cotizaciones WHERE empresa_id = ?) AS cotizaciones,
        (SELECT COUNT(*) FROM proyectos WHERE empresa_id = ?) AS proyectos,
        (SELECT COUNT(*) FROM perfiles_energeticos WHERE empresa_id = ?) AS perfiles
    `, [id, id, id, id]);
    const c = counts[0] || {};
    if (c.clientes || c.cotizaciones || c.proyectos || c.perfiles) {
      return res.status(400).json({
        detail: `No se puede eliminar "${existing[0].nombre}": tiene ${c.clientes || 0} cliente(s), ${c.cotizaciones || 0} cotización(es), ${c.proyectos || 0} proyecto(s) y ${c.perfiles || 0} perfil(es) energético(s). Desactívela en su lugar para ocultarla del uso diario.`
      });
    }
    // Sin datos de negocio: se eliminan sus usuarios (las sesiones caen por
    // clave foránea ON DELETE CASCADE) y su configuración propia.
    await pool.execute('DELETE FROM sesiones WHERE usuario_id IN (SELECT id FROM usuarios WHERE empresa_id = ?)', [id]);
    await pool.execute('DELETE FROM usuarios WHERE empresa_id = ?', [id]);
    await pool.execute('DELETE FROM configuracion WHERE empresa_id = ?', [id]);
    await pool.execute('DELETE FROM empresas WHERE id = ?', [id]);
    res.json({ message: 'Empresa eliminada' });
  } catch (error) { console.error(error); res.status(500).json({ detail: 'Error del servidor' }); }
});

module.exports = router;
