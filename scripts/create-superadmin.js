/**
 * Crea o actualiza el único superadmin.
 * Desarrollo (SQLite): SUPERADMIN_USERNAME=... SUPERADMIN_PASSWORD=... npm run create-superadmin
 * Producción (MySQL): usa DB_HOST, DB_PORT, DB_USER, DB_PASSWORD y DB_NAME.
 */
const crypto = require('crypto');

const username = process.env.SUPERADMIN_USERNAME;
const password = process.env.SUPERADMIN_PASSWORD;
if (!username || !password || password.length < 4) {
  console.error('Debes definir SUPERADMIN_USERNAME y SUPERADMIN_PASSWORD (mínimo 4 caracteres).');
  process.exit(1);
}

const permissions = JSON.stringify([
  'dashboard.ver', 'cotizador.ver', 'cotizador.crear', 'cotizador.editar', 'cotizador.eliminar', 'cotizador.descargar_pdf',
  'clientes.ver', 'clientes.crear', 'clientes.editar', 'clientes.eliminar',
  'inventario.ver', 'inventario.crear', 'inventario.editar', 'inventario.eliminar',
  'propuestas.ver', 'propuestas.cambiar_estado', 'propuestas.eliminar',
  'configuracion.ver', 'configuracion.editar', 'usuarios.ver', 'usuarios.crear', 'usuarios.editar', 'usuarios.eliminar', 'reportes.ver'
]);

function credentials() {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.createHash('sha256').update(salt + password).digest('hex');
  return { salt, hash };
}

async function ensureMySql() {
  const mysql = require('mysql2/promise');
  const db = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    charset: 'utf8mb4'
  });
  try {
    const [companyRows] = await db.execute('SELECT id FROM empresas ORDER BY id LIMIT 1');
    if (!companyRows.length) {
      await db.execute('INSERT INTO empresas (nombre, nit) VALUES (?, ?)', ['Plantas Solares de Colombia', '']);
    }
    const [adminProfileRows] = await db.execute("SELECT id FROM perfiles WHERE nombre = 'Administrador' LIMIT 1");
    if (!adminProfileRows.length) {
      await db.execute(
        'INSERT INTO perfiles (nombre, descripcion, permisos, es_sistema) VALUES (?, ?, ?, 1)',
        ['Administrador', 'Administrador de empresa', permissions]
      );
    }
    const [profileRows] = await db.execute("SELECT id FROM perfiles WHERE nombre = 'Superadmin' LIMIT 1");
    let profileId;
    if (profileRows.length) profileId = profileRows[0].id;
    else {
      const [result] = await db.execute(
        'INSERT INTO perfiles (nombre, descripcion, permisos, es_sistema) VALUES (?, ?, ?, 1)',
        ['Superadmin', 'Acceso global a empresas y datos', permissions]
      );
      profileId = result.insertId;
    }
    const { salt, hash } = credentials();
    const [existingRows] = await db.execute('SELECT id FROM usuarios WHERE es_superadmin = 1 LIMIT 1');
    if (existingRows.length) {
      await db.execute(
        'UPDATE usuarios SET username = ?, password_hash = ?, password_salt = ?, nombre_completo = ?, perfil_id = ?, empresa_id = NULL, activo = 1 WHERE id = ?',
        [username, hash, salt, 'Superadministrador', profileId, existingRows[0].id]
      );
    } else {
      await db.execute(
        'INSERT INTO usuarios (username, password_hash, password_salt, nombre_completo, correo, perfil_id, empresa_id, es_superadmin, activo) VALUES (?, ?, ?, ?, ?, ?, NULL, 1, 1)',
        [username, hash, salt, 'Superadministrador', '', profileId]
      );
    }
  } finally {
    await db.end();
  }
}

function ensureSqlite() {
  const Database = require('better-sqlite3');
  const path = require('path');
  const db = new Database(process.env.SQLITE_PATH || path.join(__dirname, '..', 'sunquote.db'));
  try {
    let profile = db.prepare("SELECT id FROM perfiles WHERE nombre = 'Superadmin' LIMIT 1").get();
    if (!profile) {
      const result = db.prepare('INSERT INTO perfiles (nombre, descripcion, permisos, es_sistema) VALUES (?, ?, ?, 1)')
        .run('Superadmin', 'Acceso global a empresas y datos', permissions);
      profile = { id: result.lastInsertRowid };
    }
    const { salt, hash } = credentials();
    const existing = db.prepare('SELECT id FROM usuarios WHERE es_superadmin = 1 LIMIT 1').get();
    if (existing) {
      db.prepare('UPDATE usuarios SET username = ?, password_hash = ?, password_salt = ?, nombre_completo = ?, perfil_id = ?, empresa_id = NULL, activo = 1 WHERE id = ?')
        .run(username, hash, salt, 'Superadministrador', profile.id, existing.id);
    } else {
      db.prepare('INSERT INTO usuarios (username, password_hash, password_salt, nombre_completo, correo, perfil_id, empresa_id, es_superadmin, activo) VALUES (?, ?, ?, ?, ?, ?, NULL, 1, 1)')
        .run(username, hash, salt, 'Superadministrador', '', profile.id);
    }
  } finally {
    db.close();
  }
}

(async () => {
  if (process.env.DB_HOST) await ensureMySql();
  else ensureSqlite();
  console.log(`Superadmin listo: ${username} (${process.env.DB_HOST ? 'MySQL' : 'SQLite'})`);
})().catch((error) => {
  console.error(`No se pudo crear el superadmin: ${error.message}`);
  process.exit(1);
});
