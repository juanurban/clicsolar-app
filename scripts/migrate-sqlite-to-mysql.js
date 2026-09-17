/**
 * Migración de datos desde SQLite (local) hacia MySQL (Hostinger).
 *
 * Ejecutar LOCALMENTE con las credenciales MySQL de Hostinger:
 *
 *   DB_HOST=localhost DB_PORT=3306 DB_USER=usuario DB_PASSWORD=contraseña DB_NAME=base \
 *   node scripts/migrate-sqlite-to-mysql.js
 *
 * Requisitos:
 *  1. El esquema MySQL ya debe estar importado (database/schema.sql en phpMyAdmin).
 *  2. El superadmin ya debe haber sido creado con npm run create-superadmin.
 *  3. Este script SOLO INSERTA datos; no toca tablas vacías que ya tiene el esquema.
 */

const Database = require('better-sqlite3');
const mysql = require('mysql2/promise');
const path = require('path');

const SQLITE_PATH = process.env.SQLITE_PATH || path.join(__dirname, '..', 'sunquote.db');

// ── Tablas en orden de dependencia FK ──
const TABLES_IN_ORDER = [
  'empresas',
  'perfiles',
  'usuarios',
  'clientes',
  'equipos',
  'configuracion',
  'estados_proyecto',
  'cotizaciones',
  'proyectos',
  'tareas_proyecto',
  'perfiles_energeticos',
];

// Columnas que son foreign keys y necesitan mapeo de ID
// { tabla: { columna_old_id: 'tabla_referencia' } }
const FK_MAP = {
  usuarios:      { perfil_id: 'perfiles', empresa_id: 'empresas' },
  clientes:      { empresa_id: 'empresas' },
  equipos:       { empresa_id: 'empresas' },
  cotizaciones:  { cliente_id: 'clientes', panel_id: 'equipos', inversor_id: 'equipos', bateria_id: 'equipos', empresa_id: 'empresas' },
  proyectos:     { cotizacion_id: 'cotizaciones', cliente_id: 'clientes', estado_id: 'estados_proyecto', empresa_id: 'empresas' },
  tareas_proyecto: { proyecto_id: 'proyectos' },
  perfiles_energeticos: { cliente_id: 'clientes', empresa_id: 'empresas' },
};

// Columnas JSON que MySQL espera como string (ya vienen como string de SQLite)
const JSON_COLUMNS = {
  clientes:       ['historial_consumo', 'archivos_json'],
  cotizaciones:   ['items_json', 'proyeccion_25_json', 'cronograma_json'],
  perfiles:       ['permisos'],
  perfiles_energeticos: ['perfil_horario_json', 'resumen_diario_json', 'mediciones_json'],
};

function parseJsonSafe(value, fallback) {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch { return fallback; }
  }
  return value;
}

async function main() {
  // ── Conexiones ──
  const sqlite = new Database(SQLITE_PATH, { readonly: true });
  const mysqlPool = await mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    charset: 'utf8mb4',
    connectionLimit: 5,
  });

  console.log('🔄 Migrando datos de SQLite a MySQL...\n');

  // Mapa general: { tabla: { oldId: newId } }
  const idMap = {};

  for (const table of TABLES_IN_ORDER) {
    const rows = sqlite.prepare(`SELECT * FROM ${table}`).all();
    if (rows.length === 0) {
      console.log(`  ⏭  ${table}: vacía, saltando`);
      continue;
    }

    idMap[table] = idMap[table] || {};
    let inserted = 0;

    for (const row of rows) {
      const oldId = row.id;
      const columns = Object.keys(row);
      const placeholders = columns.map(() => '?').join(', ');
      const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`;

      // Resolver foreign keys: reemplazar oldId por newId
      const params = columns.map((col) => {
        let value = row[col];

        // Mapeo de FK
        if (FK_MAP[table] && FK_MAP[table][col]) {
          const refTable = FK_MAP[table][col];
          if (value !== null && idMap[refTable] && idMap[refTable][value] !== undefined) {
            value = idMap[refTable][value];
          } else if (value !== null) {
            // FK apunta a un registro que no existe en el mapa (probablemente el default)
            // Si es empresa_id y no está en el mapa, dejar null
            if (col === 'empresa_id') return null;
          }
        }

        // SQLite almacena booleanos como 0/1
        if (typeof value === 'boolean') return value ? 1 : 0;

        // Asegurar que JSON columns sean strings
        if (JSON_COLUMNS[table] && JSON_COLUMNS[table].includes(col)) {
          if (value !== null && typeof value !== 'string') {
            return JSON.stringify(value);
          }
        }

        return value;
      });

      try {
        const [result] = await mysqlPool.execute(sql, params);
        idMap[table][oldId] = result.insertId;
        inserted++;
      } catch (err) {
        console.error(`  ❌ Error insertando en ${table} (old id=${oldId}):`, err.message);
        // Si es duplicate key, intentar obtener el ID existente
        if (err.code === 'ER_DUP_ENTRY') {
          try {
            const [existing] = await mysqlPool.execute(`SELECT id FROM ${table} ORDER BY id DESC LIMIT 1`);
            if (existing.length) idMap[table][oldId] = existing[0].id;
          } catch {}
        }
      }
    }

    console.log(`  ✅ ${table}: ${inserted}/${rows.length} registros insertados`);
  }

  // ── Verificación final ──
  console.log('\n📊 Verificación en MySQL:');
  for (const table of TABLES_IN_ORDER) {
    const [[{ total }]] = await mysqlPool.execute(`SELECT COUNT(*) as total FROM ${table}`);
    console.log(`  ${table}: ${total} registros`);
  }

  await mysqlPool.end();
  sqlite.close();
  console.log('\n🎉 Migración completada');
}

main().catch((err) => {
  console.error('Error fatal:', err);
  process.exit(1);
});
