/**
 * SunQuote - Database Adapter
 * - Local: SQLite (better-sqlite3)
 * - Producción: MySQL (mysql2)
 *
 * Provee una API unificada (pool.execute, pool.query) que funciona
 * con ambas bases de datos.
 */
const path = require('path');
const fs = require('fs');

const USE_SQLITE = !process.env.DB_HOST || process.env.USE_SQLITE === 'true';
const SQLITE_PATH = process.env.SQLITE_PATH || path.join(__dirname, 'sunquote.db');

let pool;

// ── Helper: Crear pool para SQLite ──
function createSqlitePool(database) {
  return {
    _db: database,
    async query(sql, params = []) {
      return runQuery(database, sql, params);
    },
    async execute(sql, params = []) {
      return runQuery(database, sql, params);
    }
  };
}

function runQuery(database, sql, params) {
  // better-sqlite3 no admite booleanos nativos; SQLite representa booleanos como 0/1.
  const sqliteParams = params.map((param) => typeof param === 'boolean' ? (param ? 1 : 0) : param);

  // Convertir placeholders de MySQL (?) - SQLite también usa ?
  // Convertir funciones JSON de MySQL
  let adaptedSql = sql
    .replace(/JSON_EXTRACT\(([^,]+),\s*'\$\.([^']+)'\)/gi, "json_extract($1, '$.$2')")
    .replace(/CAST\(([^)]+) AS JSON\)/gi, '$1')
    .replace(/ON DUPLICATE KEY UPDATE/gi, 'ON CONFLICT DO UPDATE SET')
    .replace(/VALUES\(([^)]+)\)/gi, 'excluded.$1');

  // Convertir NOW()
  adaptedSql = adaptedSql.replace(/NOW\(\)/gi, "datetime('now')");
  adaptedSql = adaptedSql.replace(/CURDATE\(\)/gi, "date('now')");

  try {
    const upper = sql.trim().toUpperCase();
    if (upper.startsWith('SELECT') || upper.startsWith('WITH') || upper.startsWith('PRAGMA')) {
      const stmt = database.prepare(adaptedSql);
      const rows = sqliteParams.length > 0 ? stmt.all(...sqliteParams) : stmt.all();
      return [rows, []];
    } else {
      const stmt = database.prepare(adaptedSql);
      const info = sqliteParams.length > 0 ? stmt.run(...sqliteParams) : stmt.run();
      if (upper.startsWith('INSERT')) {
        return [{ insertId: info.lastInsertRowid, affectedRows: info.changes }, []];
      }
      return [{ affectedRows: info.changes }, []];
    }
  } catch (err) {
    console.error('SQLite query error:', err.message);
    console.error('SQL:', adaptedSql);
    console.error('Params:', params);
    throw err;
  }
}

function ensureSqliteProjectSchema(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS empresas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      nit TEXT DEFAULT '',
      activo INTEGER DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
  const enterpriseCount = database.prepare('SELECT COUNT(*) AS count FROM empresas').get().count;
  if (enterpriseCount === 0) {
    database.prepare('INSERT INTO empresas (nombre, nit) VALUES (?, ?)').run('Plantas Solares de Colombia', '');
  }
  const addColumn = (table, column, definition) => {
    const columns = database.pragma(`table_info(${table})`);
    if (!columns.some((item) => item.name === column)) database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  };
  ['clientes', 'equipos', 'cotizaciones', 'proyectos', 'perfiles_energeticos'].forEach((table) => addColumn(table, 'empresa_id', 'INTEGER'));
  addColumn('usuarios', 'empresa_id', 'INTEGER');
  addColumn('usuarios', 'es_superadmin', 'INTEGER DEFAULT 0');
  database.exec(`
    UPDATE usuarios SET empresa_id = (SELECT id FROM empresas ORDER BY id LIMIT 1) WHERE empresa_id IS NULL;
    UPDATE clientes SET empresa_id = (SELECT id FROM empresas ORDER BY id LIMIT 1) WHERE empresa_id IS NULL;
    UPDATE equipos SET empresa_id = (SELECT id FROM empresas ORDER BY id LIMIT 1) WHERE empresa_id IS NULL;
    UPDATE cotizaciones SET empresa_id = (SELECT id FROM empresas ORDER BY id LIMIT 1) WHERE empresa_id IS NULL;
    UPDATE proyectos SET empresa_id = (SELECT id FROM empresas ORDER BY id LIMIT 1) WHERE empresa_id IS NULL;
    UPDATE perfiles_energeticos SET empresa_id = (SELECT id FROM empresas ORDER BY id LIMIT 1) WHERE empresa_id IS NULL;
  `);
  database.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_unico_superadmin ON usuarios(es_superadmin) WHERE es_superadmin = 1');

  const configSql = database.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='configuracion'").get()?.sql || '';
  if (!configSql.includes('PRIMARY KEY (empresa_id, clave)')) {
    const firstEmpId = database.prepare('SELECT id FROM empresas ORDER BY id LIMIT 1').get()?.id || 1;
    database.exec(`
      CREATE TABLE IF NOT EXISTS configuracion_new (
        empresa_id INTEGER NOT NULL DEFAULT 1,
        clave TEXT NOT NULL,
        valor TEXT,
        tipo TEXT DEFAULT 'string',
        descripcion TEXT,
        PRIMARY KEY (empresa_id, clave)
      );
    `);
    const hasConfigTable = database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='configuracion'").get();
    if (hasConfigTable) {
      const configCols = database.pragma('table_info(configuracion)');
      const hasEmpCol = configCols.some((c) => c.name === 'empresa_id');
      if (hasEmpCol) {
        database.exec(`INSERT OR IGNORE INTO configuracion_new (empresa_id, clave, valor, tipo, descripcion) SELECT COALESCE(empresa_id, ${firstEmpId}), clave, valor, tipo, descripcion FROM configuracion;`);
      } else {
        database.exec(`INSERT OR IGNORE INTO configuracion_new (empresa_id, clave, valor, tipo, descripcion) SELECT ${firstEmpId}, clave, valor, tipo, descripcion FROM configuracion;`);
      }
      database.exec('DROP TABLE configuracion;');
    }
    database.exec('ALTER TABLE configuracion_new RENAME TO configuracion;');
  }

  const clientColumns = database.pragma('table_info(clientes)');
  if (!clientColumns.some((column) => column.name === 'departamento')) {
    database.exec("ALTER TABLE clientes ADD COLUMN departamento TEXT DEFAULT ''");
  }
  if (!clientColumns.some((column) => column.name === 'municipio')) {
    database.exec("ALTER TABLE clientes ADD COLUMN municipio TEXT DEFAULT ''");
  }
  database.exec("UPDATE clientes SET municipio = COALESCE(NULLIF(municipio, ''), ciudad, ''), ciudad = COALESCE(NULLIF(municipio, ''), ciudad, '') WHERE municipio IS NULL OR municipio = ''");

  const projectColumns = database.pragma('table_info(proyectos)');
  if (!projectColumns.some((column) => column.name === 'estado_id')) {
    database.exec('ALTER TABLE proyectos ADD COLUMN estado_id INTEGER');
    console.log('🔧 Migración SQLite aplicada: proyectos.estado_id');
  }

  const estadoCount = database.prepare('SELECT COUNT(*) AS count FROM estados_proyecto').get().count;
  if (estadoCount === 0) {
    const estados = [
      ['Evaluación', 'border-l-4 border-gray-400 bg-surface-container', 1],
      ['Diseño', 'border-l-4 border-blue-400 bg-surface-container', 2],
      ['Propuesta', 'border-l-4 border-purple-400 bg-surface-container', 3],
      ['Aprobado', 'border-l-4 border-yellow-400 bg-surface-container', 4],
      ['Instalación', 'border-l-4 border-orange-400 bg-surface-container', 5],
      ['Operación', 'border-l-4 border-green-500 bg-surface-container', 6],
      ['Cancelado', 'border-l-4 border-red-500 bg-surface-container', 7]
    ];
    const insertEstado = database.prepare('INSERT INTO estados_proyecto (nombre, color, orden) VALUES (?, ?, ?)');
    const insertMany = database.transaction((items) => {
      for (const estado of items) insertEstado.run(...estado);
    });
    insertMany(estados);
    console.log(`🌱 ${estados.length} estados de proyecto insertados en SQLite`);
  }

  database.prepare(`
    UPDATE proyectos
    SET estado_id = COALESCE(
      (SELECT id FROM estados_proyecto WHERE lower(nombre) = lower(proyectos.estado) LIMIT 1),
      (SELECT id FROM estados_proyecto ORDER BY orden ASC LIMIT 1)
    )
    WHERE estado_id IS NULL
  `).run();

  database.exec(`
    CREATE TABLE IF NOT EXISTS perfiles_energeticos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cliente_id INTEGER NOT NULL,
      archivo_nombre TEXT NOT NULL,
      hoja_origen TEXT,
      intervalo_minutos REAL DEFAULT 60,
      fecha_inicio TEXT,
      fecha_fin TEXT,
      numero_mediciones INTEGER DEFAULT 0,
      consumo_total_kwh REAL DEFAULT 0,
      consumo_diario_promedio_kwh REAL DEFAULT 0,
      consumo_mensual_estimado_kwh REAL DEFAULT 0,
      demanda_promedio_kw REAL DEFAULT 0,
      demanda_maxima_kw REAL DEFAULT 0,
      produccion_total_kwh REAL DEFAULT 0,
      perfil_horario_json TEXT DEFAULT '[]',
      resumen_diario_json TEXT DEFAULT '[]',
      mediciones_json TEXT DEFAULT '[]',
      observaciones TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_perfiles_energeticos_cliente ON perfiles_energeticos(cliente_id);
  `);
}

async function ensureMysqlSchema(p) {
  try {
    // 1. Verificar/Añadir columna empresa_id
    const [cols] = await p.query(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'configuracion' AND COLUMN_NAME = 'empresa_id'
    `);
    if (cols.length === 0) {
      console.log('🔧 MySQL: Añadiendo columna empresa_id a tabla configuracion...');
      await p.query('ALTER TABLE configuracion ADD COLUMN empresa_id INT NOT NULL DEFAULT 1');
      await p.query('UPDATE configuracion SET empresa_id = 1 WHERE empresa_id IS NULL OR empresa_id = 0');
    }

    // 2. Verificar/Actualizar clave primaria a (empresa_id, clave)
    const [pkCols] = await p.query(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'configuracion' AND CONSTRAINT_NAME = 'PRIMARY'
    `);
    const pkNames = pkCols.map(c => c.COLUMN_NAME);
    if (!pkNames.includes('empresa_id') || pkNames.length < 2) {
      console.log('🔧 MySQL: Actualizando clave primaria de configuracion a (empresa_id, clave)...');
      await p.query('UPDATE configuracion SET empresa_id = 1 WHERE empresa_id IS NULL OR empresa_id = 0');
      try {
        await p.query('ALTER TABLE configuracion DROP PRIMARY KEY');
      } catch (e) {}
      await p.query('ALTER TABLE configuracion ADD PRIMARY KEY (empresa_id, clave)');
      console.log('✅ MySQL: Clave primaria (empresa_id, clave) establecida con éxito');
    }

    // 3. Asegurar que todas las empresas tengan filas de configuración copiadas de la empresa base
    await p.query(`
      INSERT IGNORE INTO configuracion (empresa_id, clave, valor, tipo, descripcion)
      SELECT e.id, c.clave,
             IF(c.clave = 'empresa_nombre' OR c.clave = 'empresa_nombre_corto', e.nombre,
             IF(c.clave = 'empresa_nit', e.nit, c.valor)),
             c.tipo, c.descripcion
      FROM empresas e
      CROSS JOIN configuracion c
      WHERE c.empresa_id = 1 AND e.id > 1
    `);

    // 4. Reparar datos por empresa si estuvieron sobreescritos en el pasado
    const [allEmps] = await p.query('SELECT id, nombre, nit FROM empresas');
    for (const emp of allEmps) {
      if (emp.id === 1 && emp.nombre) {
        await p.query('UPDATE configuracion SET valor = ? WHERE empresa_id = 1 AND clave IN ("empresa_nombre", "empresa_nombre_corto") AND valor LIKE "%DRU%"', [emp.nombre]);
      }
      if (emp.nombre) {
        await p.query(
          'INSERT INTO configuracion (empresa_id, clave, valor) VALUES (?, "empresa_nombre", ?) ON DUPLICATE KEY UPDATE valor = ?',
          [emp.id, emp.nombre, emp.nombre]
        );
        await p.query(
          'INSERT INTO configuracion (empresa_id, clave, valor) VALUES (?, "empresa_nombre_corto", ?) ON DUPLICATE KEY UPDATE valor = ?',
          [emp.id, emp.nombre, emp.nombre]
        );
      }
      if (emp.nit !== undefined && emp.nit !== null) {
        await p.query(
          'INSERT INTO configuracion (empresa_id, clave, valor) VALUES (?, "empresa_nit", ?) ON DUPLICATE KEY UPDATE valor = ?',
          [emp.id, emp.nit, emp.nit]
        );
      }
    }
  } catch (err) {
    console.error('⚠️ Warning verificando/migrando esquema MySQL:', err.message);
  }
}

if (USE_SQLITE) {
  // ══════════════════════════════════════════
  //  SQLITE (Desarrollo local)
  // ══════════════════════════════════════════
  const Database = require('better-sqlite3');
  const initPath = path.join(__dirname, 'scripts', 'init-db.js');

  // Auto-inicializar si la DB está vacía o no existe
  const dbExists = fs.existsSync(SQLITE_PATH);

  if (!dbExists) {
    console.log('⚠️  Base de datos no existe, creando...');
    require(initPath);
  } else {
    const tempDb = new Database(SQLITE_PATH, { readonly: true });
    const tableCount = tempDb.prepare("SELECT COUNT(*) as c FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").get().c;
    tempDb.close();
    if (tableCount === 0) {
      console.log('⚠️  Base de datos vacía, ejecutando init-db.js automáticamente...');
      require(initPath);
    }
  }

  const db = new Database(SQLITE_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  ensureSqliteProjectSchema(db);
  pool = createSqlitePool(db);

  console.log(`📦 Using SQLite database at: ${SQLITE_PATH}`);

} else {
  // ══════════════════════════════════════════
  //  MYSQL (Producción - Hostinger)
  // ══════════════════════════════════════════
  const mysql = require('mysql2/promise');
  require('dotenv').config();

  pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'sunquote',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    charset: 'utf8mb4'
  });

  ensureMysqlSchema(pool).catch((err) => console.error('Error migración MySQL:', err.message));

  console.log(`📦 Using MySQL database: ${process.env.DB_HOST}/${process.env.DB_NAME}`);
}

module.exports = pool;
