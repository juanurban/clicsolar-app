const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const pool = require('../db');

// ── All System Permissions ──
const ALL_PERMISSIONS = [
  'dashboard.ver',
  'cotizador.ver', 'cotizador.crear', 'cotizador.editar', 'cotizador.eliminar', 'cotizador.descargar_pdf',
  'clientes.ver', 'clientes.crear', 'clientes.editar', 'clientes.eliminar',
  'inventario.ver', 'inventario.crear', 'inventario.editar', 'inventario.eliminar',
  'propuestas.ver', 'propuestas.cambiar_estado', 'propuestas.eliminar',
  'configuracion.ver', 'configuracion.editar',
  'usuarios.ver', 'usuarios.crear', 'usuarios.editar', 'usuarios.eliminar',
  'reportes.ver'
];

// ── Helpers ──
function hashPassword(password, salt) {
  if (!salt) salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.createHash('sha256').update(salt + password).digest('hex');
  return { hash, salt };
}

async function getCurrentUser(req) {
  const token = req.cookies.sq_session;
  if (!token) return null;

  const [sessions] = await pool.execute('SELECT * FROM sesiones WHERE token = ? AND expires_at > NOW()', [token]);
  if (sessions.length === 0) return null;

  const [users] = await pool.execute(`
    SELECT u.id, u.username, u.nombre_completo, u.correo, u.perfil_id, u.activo,
           p.nombre as perfil_nombre, p.permisos
    FROM usuarios u JOIN perfiles p ON u.perfil_id = p.id
    WHERE u.id = ? AND u.activo = 1
  `, [sessions[0].usuario_id]);

  if (users.length === 0) return null;
  const user = users[0];
  user.permisos = typeof user.permisos === 'string' ? JSON.parse(user.permisos) : user.permisos;
  return user;
}

function requireAuth(req, res) {
  return getCurrentUser(req).then(user => {
    if (!user) { res.status(401).json({ detail: 'No autenticado' }); return null; }
    return user;
  });
}

// ══════════════════════════════════════════
//  PERMISOS
// ══════════════════════════════════════════

router.get('/permisos', async (req, res) => {
  try {
    const user = await requireAuth(req, res);
    if (!user) return;
    const groups = {};
    ALL_PERMISSIONS.forEach(p => {
      const [mod] = p.split('.');
      if (!groups[mod]) groups[mod] = [];
      groups[mod].push(p);
    });
    res.json({ permisos: ALL_PERMISSIONS, grupos: groups });
  } catch (error) {
    console.error(error);
    res.status(500).json({ detail: 'Error del servidor' });
  }
});

// ══════════════════════════════════════════
//  PERFILES (ROLES) CRUD
// ══════════════════════════════════════════

router.get('/perfiles', async (req, res) => {
  try {
    const user = await requireAuth(req, res);
    if (!user) return;
    const [rows] = await pool.execute(`
      SELECT p.*, (SELECT COUNT(*) FROM usuarios u WHERE u.perfil_id = p.id) as num_usuarios
      FROM perfiles p ORDER BY p.id
    `);
    rows.forEach(r => {
      r.permisos = typeof r.permisos === 'string' ? JSON.parse(r.permisos) : r.permisos;
    });
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ detail: 'Error del servidor' });
  }
});

router.post('/perfiles', async (req, res) => {
  try {
    const user = await requireAuth(req, res);
    if (!user) return;
    if (!user.permisos.includes('usuarios.crear')) return res.status(403).json({ detail: 'Sin permiso' });

    const { nombre, descripcion, permisos } = req.body;
    const invalid = (permisos || []).filter(p => !ALL_PERMISSIONS.includes(p));
    if (invalid.length > 0) return res.status(400).json({ detail: `Permisos inválidos: ${invalid.join(', ')}` });

    const [result] = await pool.execute(
      'INSERT INTO perfiles (nombre, descripcion, permisos, es_sistema) VALUES (?, ?, ?, 0)',
      [nombre, descripcion || '', JSON.stringify(permisos || [])]
    );
    res.json({ message: 'Perfil creado', id: result.insertId });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return res.status(400).json({ detail: 'Ya existe un perfil con ese nombre' });
    console.error(error);
    res.status(500).json({ detail: 'Error del servidor' });
  }
});

router.put('/perfiles/:id', async (req, res) => {
  try {
    const user = await requireAuth(req, res);
    if (!user) return;
    if (!user.permisos.includes('usuarios.editar')) return res.status(403).json({ detail: 'Sin permiso' });

    const [existing] = await pool.execute('SELECT * FROM perfiles WHERE id = ?', [req.params.id]);
    if (existing.length === 0) return res.status(404).json({ detail: 'Perfil no encontrado' });

    const perfil = existing[0];
    const { nombre, descripcion, permisos } = req.body;

    if (perfil.es_sistema && nombre && nombre !== perfil.nombre) {
      return res.status(400).json({ detail: 'No se puede cambiar el nombre de un perfil de sistema' });
    }
    if (permisos) {
      const invalid = permisos.filter(p => !ALL_PERMISSIONS.includes(p));
      if (invalid.length > 0) return res.status(400).json({ detail: `Permisos inválidos: ${invalid.join(', ')}` });
    }

    const updates = [], values = [];
    if (nombre !== undefined) { updates.push('nombre = ?'); values.push(nombre); }
    if (descripcion !== undefined) { updates.push('descripcion = ?'); values.push(descripcion); }
    if (permisos !== undefined) { updates.push('permisos = ?'); values.push(JSON.stringify(permisos)); }

    if (updates.length > 0) {
      values.push(req.params.id);
      await pool.execute(`UPDATE perfiles SET ${updates.join(', ')} WHERE id = ?`, values);
    }
    res.json({ message: 'Perfil actualizado' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ detail: 'Error del servidor' });
  }
});

router.delete('/perfiles/:id', async (req, res) => {
  try {
    const user = await requireAuth(req, res);
    if (!user) return;
    if (!user.permisos.includes('usuarios.eliminar')) return res.status(403).json({ detail: 'Sin permiso' });

    const [existing] = await pool.execute('SELECT * FROM perfiles WHERE id = ?', [req.params.id]);
    if (existing.length === 0) return res.status(404).json({ detail: 'Perfil no encontrado' });
    if (existing[0].es_sistema) return res.status(400).json({ detail: 'No se puede eliminar un perfil de sistema' });

    const [[{count}]] = await pool.execute('SELECT COUNT(*) as count FROM usuarios WHERE perfil_id = ?', [req.params.id]);
    if (count > 0) return res.status(400).json({ detail: `No se puede eliminar: ${count} usuario(s) asignado(s)` });

    await pool.execute('DELETE FROM perfiles WHERE id = ?', [req.params.id]);
    res.json({ message: 'Perfil eliminado' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ detail: 'Error del servidor' });
  }
});

// ══════════════════════════════════════════
//  USUARIOS CRUD
// ══════════════════════════════════════════

router.get('/', async (req, res) => {
  try {
    const user = await requireAuth(req, res);
    if (!user) return;
    if (!user.permisos.includes('usuarios.ver')) return res.status(403).json({ detail: 'Sin permiso' });

    const [rows] = await pool.execute(`
      SELECT u.id, u.username, u.nombre_completo, u.correo, u.perfil_id,
             u.activo, u.ultimo_acceso, u.created_at,
             p.nombre as perfil_nombre
      FROM usuarios u JOIN perfiles p ON u.perfil_id = p.id ORDER BY u.id
    `);
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ detail: 'Error del servidor' });
  }
});

router.post('/', async (req, res) => {
  try {
    const user = await requireAuth(req, res);
    if (!user) return;
    if (!user.permisos.includes('usuarios.crear')) return res.status(403).json({ detail: 'Sin permiso' });

    const { username, password, nombre_completo, correo, perfil_id, activo } = req.body;
    const [perfiles] = await pool.execute('SELECT id FROM perfiles WHERE id = ?', [perfil_id]);
    if (perfiles.length === 0) return res.status(400).json({ detail: 'Perfil no encontrado' });

    const { hash, salt } = hashPassword(password);
    const [result] = await pool.execute(
      'INSERT INTO usuarios (username, password_hash, password_salt, nombre_completo, correo, perfil_id, activo) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [username, hash, salt, nombre_completo, correo || '', perfil_id, activo !== undefined ? activo : 1]
    );
    res.json({ message: 'Usuario creado', id: result.insertId });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return res.status(400).json({ detail: 'El nombre de usuario ya existe' });
    console.error(error);
    res.status(500).json({ detail: 'Error del servidor' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const user = await requireAuth(req, res);
    if (!user) return;
    if (!user.permisos.includes('usuarios.editar')) return res.status(403).json({ detail: 'Sin permiso' });

    const [existing] = await pool.execute('SELECT * FROM usuarios WHERE id = ?', [req.params.id]);
    if (existing.length === 0) return res.status(404).json({ detail: 'Usuario no encontrado' });

    const { nombre_completo, correo, perfil_id, activo } = req.body;

    // Prevent deactivating last admin
    if (activo === 0) {
      const [adminPerfil] = await pool.execute("SELECT id FROM perfiles WHERE nombre = 'Administrador'");
      if (adminPerfil.length > 0 && existing[0].perfil_id === adminPerfil[0].id) {
        const [[{count}]] = await pool.execute(
          'SELECT COUNT(*) as count FROM usuarios WHERE perfil_id = ? AND activo = 1 AND id != ?',
          [adminPerfil[0].id, req.params.id]
        );
        if (count === 0) return res.status(400).json({ detail: 'No se puede desactivar el último administrador activo' });
      }
    }

    if (perfil_id !== undefined) {
      const [perfiles] = await pool.execute('SELECT id FROM perfiles WHERE id = ?', [perfil_id]);
      if (perfiles.length === 0) return res.status(400).json({ detail: 'Perfil no encontrado' });
    }

    const updates = [], values = [];
    if (nombre_completo !== undefined) { updates.push('nombre_completo = ?'); values.push(nombre_completo); }
    if (correo !== undefined) { updates.push('correo = ?'); values.push(correo); }
    if (perfil_id !== undefined) { updates.push('perfil_id = ?'); values.push(perfil_id); }
    if (activo !== undefined) { updates.push('activo = ?'); values.push(activo); }

    if (updates.length > 0) {
      values.push(req.params.id);
      await pool.execute(`UPDATE usuarios SET ${updates.join(', ')} WHERE id = ?`, values);
    }
    res.json({ message: 'Usuario actualizado' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ detail: 'Error del servidor' });
  }
});

router.put('/:id/password', async (req, res) => {
  try {
    const user = await requireAuth(req, res);
    if (!user) return;
    if (user.id !== parseInt(req.params.id) && !user.permisos.includes('usuarios.editar')) {
      return res.status(403).json({ detail: 'Sin permiso para cambiar contraseña de otro usuario' });
    }
    if (!req.body.password || req.body.password.length < 4) {
      return res.status(400).json({ detail: 'La contraseña debe tener al menos 4 caracteres' });
    }

    const [existing] = await pool.execute('SELECT id FROM usuarios WHERE id = ?', [req.params.id]);
    if (existing.length === 0) return res.status(404).json({ detail: 'Usuario no encontrado' });

    const { hash, salt } = hashPassword(req.body.password);
    await pool.execute('UPDATE usuarios SET password_hash = ?, password_salt = ? WHERE id = ?', [hash, salt, req.params.id]);
    res.json({ message: 'Contraseña actualizada' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ detail: 'Error del servidor' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const user = await requireAuth(req, res);
    if (!user) return;
    if (!user.permisos.includes('usuarios.eliminar')) return res.status(403).json({ detail: 'Sin permiso' });

    if (parseInt(req.params.id) === user.id) {
      return res.status(400).json({ detail: 'No puedes eliminarte a ti mismo' });
    }

    const [existing] = await pool.execute('SELECT * FROM usuarios WHERE id = ?', [req.params.id]);
    if (existing.length === 0) return res.status(404).json({ detail: 'Usuario no encontrado' });

    // Prevent deleting last admin
    const [adminPerfil] = await pool.execute("SELECT id FROM perfiles WHERE nombre = 'Administrador'");
    if (adminPerfil.length > 0 && existing[0].perfil_id === adminPerfil[0].id) {
      const [[{count}]] = await pool.execute(
        'SELECT COUNT(*) as count FROM usuarios WHERE perfil_id = ? AND activo = 1',
        [adminPerfil[0].id]
      );
      if (count <= 1) return res.status(400).json({ detail: 'No se puede eliminar el último administrador' });
    }

    await pool.execute('DELETE FROM sesiones WHERE usuario_id = ?', [req.params.id]);
    await pool.execute('DELETE FROM usuarios WHERE id = ?', [req.params.id]);
    res.json({ message: 'Usuario eliminado' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ detail: 'Error del servidor' });
  }
});

module.exports = router;
