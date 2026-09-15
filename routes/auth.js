const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const pool = require('../db');
const { v4: uuidv4 } = require('uuid');

const SESSION_DURATION_HOURS = 24;

// Helper to hash password
function hashPassword(password, salt) {
  const hash = crypto.createHash('sha256');
  hash.update(salt + password);
  return hash.digest('hex');
}

router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ detail: "Datos incompletos" });

  try {
    const [users] = await pool.query('SELECT * FROM usuarios WHERE username = ?', [username]);
    if (users.length === 0) return res.status(401).json({ detail: "Usuario o contraseña incorrectos" });

    const user = users[0];
    if (!user.activo) return res.status(401).json({ detail: "Usuario desactivado" });

    const pwHash = hashPassword(password, user.password_salt);

    if (pwHash !== user.password_hash) {
      return res.status(401).json({ detail: "Usuario o contraseña incorrectos" });
    }

    const token = uuidv4() + uuidv4().replace(/-/g, '');
    const expiresAt = new Date(Date.now() + SESSION_DURATION_HOURS * 3600000);
    const expiresAtStr = expiresAt.toISOString().slice(0, 19).replace('T', ' ');

    await pool.query(
      'INSERT INTO sesiones (token, usuario_id, expires_at) VALUES (?, ?, ?)',
      [token, user.id, expiresAtStr]
    );

    await pool.query('UPDATE usuarios SET ultimo_acceso = NOW() WHERE id = ?', [user.id]);

    res.cookie('sq_session', token, {
      httpOnly: true,
      sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: SESSION_DURATION_HOURS * 3600000,
      path: '/'
    });

    res.json({ message: "Login successful" });
  } catch (error) {
    console.error('Login error:', error.message);
    console.error('Stack:', error.stack);
    res.status(500).json({ detail: "Error del servidor: " + error.message });
  }
});

router.post('/logout', async (req, res) => {
  const token = req.cookies.sq_session;
  if (token) {
    try {
      await pool.execute('DELETE FROM sesiones WHERE token = ?', [token]);
    } catch (e) {}
  }
  res.clearCookie('sq_session');
  res.json({ message: "Logout successful" });
});

router.get('/me', async (req, res) => {
  const token = req.cookies.sq_session;
  if (!token) return res.status(401).json({ detail: "No autenticado" });

  try {
    const [sessions] = await pool.query("SELECT * FROM sesiones WHERE token = ? AND expires_at > NOW()", [token]);
    if (sessions.length === 0) return res.status(401).json({ detail: "Sesión expirada" });
    
    const session = sessions[0];
    const [users] = await pool.execute(`
      SELECT u.id, u.username, u.nombre_completo, u.correo, u.perfil_id, u.empresa_id,
             u.es_superadmin, u.activo, e.nombre as empresa_nombre,
             p.nombre as perfil_nombre, p.permisos
      FROM usuarios u
      JOIN perfiles p ON u.perfil_id = p.id
      LEFT JOIN empresas e ON e.id = u.empresa_id
      WHERE u.id = ? AND u.activo = 1
    `, [session.usuario_id]);

    if (users.length === 0) return res.status(401).json({ detail: "Usuario inválido" });
    
    const user = users[0];
    user.permisos = typeof user.permisos === 'string' ? JSON.parse(user.permisos) : user.permisos;
    
    res.json(user);
  } catch (error) {
    console.error(error);
    res.status(500).json({ detail: "Error del servidor" });
  }
});

module.exports = router;
module.exports.getCurrentUser = async function getCurrentUser(req) {
  const token = req.cookies.sq_session;
  if (!token) return null;
  const [sessions] = await pool.execute("SELECT * FROM sesiones WHERE token = ? AND expires_at > NOW()", [token]);
  if (sessions.length === 0) return null;
  const [users] = await pool.execute(`
    SELECT u.id, u.username, u.nombre_completo, u.correo, u.perfil_id, u.empresa_id,
           u.es_superadmin, u.activo, e.nombre as empresa_nombre,
           p.nombre as perfil_nombre, p.permisos
    FROM usuarios u JOIN perfiles p ON u.perfil_id = p.id
    LEFT JOIN empresas e ON e.id = u.empresa_id
    WHERE u.id = ? AND u.activo = 1
  `, [sessions[0].usuario_id]);
  if (users.length === 0) return null;
  const user = users[0];
  user.permisos = typeof user.permisos === 'string' ? JSON.parse(user.permisos) : user.permisos;
  return user;
};
