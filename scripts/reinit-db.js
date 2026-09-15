/**
 * Script de reinicialización para MySQL (Producción - Hostinger)
 * Ejecutar: node scripts/reinit-db.js
 * 
 * Este script:
 * 1. Elimina todas las tablas existentes
 * 2. Ejecuta el schema.sql para crear las tablas
 * 3. Crea el superadmin
 */

const mysql = require('mysql2/promise');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// ── Configuration ──
const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = Number(process.env.DB_PORT || 3306);
const DB_USER = process.env.DB_USER;
const DB_PASSWORD = process.env.DB_PASSWORD;
const DB_NAME = process.env.DB_NAME;

const SUPERADMIN_USERNAME = process.env.SUPERADMIN_USERNAME || 'admin';
const SUPERADMIN_PASSWORD = process.env.SUPERADMIN_PASSWORD || 'admin123';

if (!DB_USER || !DB_PASSWORD || !DB_NAME) {
  console.error('Faltan variables de entorno: DB_USER, DB_PASSWORD, DB_NAME');
  process.exit(1);
}

// ── Helper: hash password ──
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.createHash('sha256').update(salt + password).digest('hex');
  return { salt, hash };
}

// ── Main ──
(async () => {
  let connection;
  try {
    console.log('🔄 Conectando a MySQL...');
    connection = await mysql.createConnection({
      host: DB_HOST,
      port: DB_PORT,
      user: DB_USER,
      password: DB_PASSWORD,
      database: DB_NAME,
      charset: 'utf8mb4'
    });
    console.log('✅ Conectado a', DB_NAME);

    // ── 1. Eliminar todas las tablas ──
    console.log('🗑️  Eliminando tablas existentes...');
    await connection.execute('SET FOREIGN_KEY_CHECKS = 0');
    const [tables] = await connection.execute("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?", [DB_NAME]);
    for (const row of tables) {
      await connection.execute(`DROP TABLE IF EXISTS \`${row.TABLE_NAME}\``);
    }
    await connection.execute('SET FOREIGN_KEY_CHECKS = 1');
    console.log(`✅ ${tables.length} tablas eliminadas`);

    // ── 2. Ejecutar schema.sql ──
    console.log('📦 Ejecutando schema.sql...');
    const schemaPath = path.join(__dirname, '..', 'database', 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    // Dividir en statements individuales
    const statements = schema.split(';').filter(s => s.trim());
    for (const statement of statements) {
      await connection.execute(statement);
    }
    console.log(`✅ ${statements.length} statements ejecutados`);

    // ── 3. Crear superadmin ──
    console.log('🌱 Creando superadmin...');

    // Perfil Superadmin
    const permissions = JSON.stringify([
      'dashboard.ver', 'cotizador.ver', 'cotizador.crear', 'cotizador.editar', 'cotizador.eliminar', 'cotizador.descargar_pdf',
      'clients.ver', 'clients.crear', 'clients.editar', 'clients.eliminar',
      'inventario.ver', 'inventario.crear', 'inventario.editar', 'inventario.eliminar',
      'propuestas.ver', 'propuestas.cambiar_estado', 'propuestas.eliminar',
      'configuracion.ver', 'configurar.editar', 'users.ver', 'users.crear', 'users.editar', 'users.eliminar', 'reportes.ver'
    ]);

    const [existingProfile] = await connection.execute("SELECT id FROM perfiles WHERE nombre = 'Superadmin' LIMIT 1");
    let profileId;
    if (existingProfile.length) {
      profileId = existingProfile[0].id;
    } else {
      const [result] = await connection.execute(
        'INSERT INTO perfiles (nombre, descripcion, permisos, es_sistema) VALUES (?, ?, ?, 1)',
        ['Superadmin', 'Acceso global a empresas y datos', permissions]
      );
      profileId = result.insertId;
    }

    // Empresa por defecto
    const [existingCompany] = await connection.execute('SELECT id FROM empresas ORDER BY id LIMIT 1');
    let empresaId;
    if (existingCompany.length) {
      empresaId = existingCompany[0].id;
    } else {
      const [result] = await connection.execute(
        'INSERT INTO empresas (nombre, nit) VALUES (?, ?)',
        ['Plantas Solares de Colombia', '']
      );
      empresaId = result.insertId;
    }

    // Crear/actualizar superadmin
    const { salt, hash } = hashPassword(SUPERADMIN_PASSWORD);
    const [existingUser] = await connection.execute('SELECT id FROM usuarios WHERE es_superadmin = 1 LIMIT 1');
    if (existingUser.length) {
      await connection.execute(
        'UPDATE usuarios SET username = ?, password_hash = ?, password_salt = ?, nombre_completo = ?, perfil_id = ?, empresa_id = NULL, activo = 1 WHERE id = ?',
        [SUPERADMIN_USERNAME, hash, salt, 'Superadministrador', profileId, existingUser[0].id]
      );
    } else {
      await connection.execute(
        'INSERT INTO usuarios (username, password_hash, password_salt, nombre_completo, correo, perfil_id, empresa_id, es_superadmin, activo) VALUES (?, ?, ?, ?, ?, ?, NULL, 1, 1)',
        [SUPERADMIN_USERNAME, hash, salt, 'Superadministrador', '', profileId]
      );
    }

    console.log('✅ Superadmin creado');
    console.log(`   Usuario: ${SUPERADMIN_USERNAME}`);
    console.log(`   Contraseña: ${SUPERADMIN_PASSWORD}`);

    console.log('\n🎉 Base de datos reinicializada correctamente!');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    if (connection) await connection.end();
  }
})();