/**
 * Exporta datos de SQLite a SQL MySQL-compatible para phpMyAdmin.
 * Ejecutar: node scripts/export-mysql-data.js > database/migration-data.sql
 */
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const SQLITE_PATH = process.env.SQLITE_PATH || path.join(__dirname, '..', 'sunquote.db');
const db = new Database(SQLITE_PATH, { readonly: true });

function esc(val) {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number') return String(val);
  if (typeof val === 'boolean') return val ? '1' : '0';
  return "'" + String(val).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
}

function escJson(val) {
  if (val === null || val === undefined) return 'NULL';
  let str = typeof val === 'string' ? val : JSON.stringify(val);
  try { JSON.parse(str); } catch { str = '[]'; }
  return "'" + str.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
}

const lines = [];
lines.push('-- SunQuote - Datos migrados desde SQLite local');
lines.push('-- Fecha: ' + new Date().toISOString());
lines.push('');
lines.push('SET NAMES utf8mb4;');
lines.push('SET FOREIGN_KEY_CHECKS = 0;');
lines.push('SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";');
lines.push('');

// Empresas
lines.push('-- Empresas');
for (const r of db.prepare('SELECT * FROM empresas').all()) {
  lines.push('INSERT IGNORE INTO empresas (id, nombre, nit, activo, created_at, updated_at) VALUES (' + [r.id, esc(r.nombre), esc(r.nit), r.activo, esc(r.created_at), esc(r.updated_at)].join(',') + ');');
}

// Perfiles
lines.push('');
lines.push('-- Perfiles');
for (const r of db.prepare('SELECT * FROM perfiles').all()) {
  lines.push('INSERT IGNORE INTO perfiles (id, nombre, descripcion, permisos, es_sistema, created_at) VALUES (' + [r.id, esc(r.nombre), esc(r.descripcion), escJson(r.permisos), r.es_sistema, esc(r.created_at)].join(',') + ');');
}

// Usuarios
lines.push('');
lines.push('-- Usuarios');
for (const r of db.prepare('SELECT * FROM usuarios').all()) {
  lines.push('INSERT IGNORE INTO usuarios (id, username, password_hash, password_salt, nombre_completo, correo, perfil_id, empresa_id, es_superadmin, activo, ultimo_acceso, created_at) VALUES (' +
    [r.id, esc(r.username), esc(r.password_hash), esc(r.password_salt), esc(r.nombre_completo), esc(r.correo), r.perfil_id, esc(r.empresa_id), r.es_superadmin, r.activo, esc(r.ultimo_acceso), esc(r.created_at)].join(',') + ');');
}

// Clientes
lines.push('');
lines.push('-- Clientes');
for (const r of db.prepare('SELECT * FROM clientes').all()) {
  lines.push('INSERT IGNORE INTO clientes (id, nombre, cedula_nit, direccion, telefono, correo, ciudad, departamento, municipio, operador_red, tipo_tarifa, consumo_mensual_kwh, costo_kwh, hsp, cargas_especiales_kwh_dia, historial_consumo, archivos_json, empresa_id, created_at, updated_at) VALUES (' +
    [r.id, esc(r.nombre), esc(r.cedula_nit), esc(r.direccion), esc(r.telefono), esc(r.correo), esc(r.ciudad), esc(r.departamento), esc(r.municipio), esc(r.operador_red), esc(r.tipo_tarifa), r.consumo_mensual_kwh, r.costo_kwh, r.hsp, r.cargas_especiales_kwh_dia, escJson(r.historial_consumo), escJson(r.archivos_json), esc(r.empresa_id), esc(r.created_at), esc(r.updated_at)].join(',') + ');');
}

// Equipos
lines.push('');
lines.push('-- Equipos');
for (const r of db.prepare('SELECT * FROM equipos').all()) {
  lines.push('INSERT IGNORE INTO equipos (id, categoria, marca, modelo, descripcion, potencia_wp, potencia_kw, capacidad_kwh, tipo, costo, precio_venta, utilidad_pct, unidad, peso_kg, area_m2, activo, iva, imagen_url, empresa_id, created_at) VALUES (' +
    [r.id, esc(r.categoria), esc(r.marca), esc(r.modelo), esc(r.descripcion), r.potencia_wp, r.potencia_kw, r.capacidad_kwh, esc(r.tipo), r.costo, r.precio_venta, r.utilidad_pct, esc(r.unidad), r.peso_kg, r.area_m2, r.activo, r.iva, esc(r.imagen_url), esc(r.empresa_id), esc(r.created_at)].join(',') + ');');
}

// Configuracion
lines.push('');
lines.push('-- Configuracion');
for (const r of db.prepare('SELECT * FROM configuracion').all()) {
  lines.push('INSERT INTO configuracion (clave, valor, tipo, descripcion) VALUES (' +
    [esc(r.clave), esc(r.valor), esc(r.tipo), esc(r.descripcion)].join(',') + ') ON DUPLICATE KEY UPDATE valor = VALUES(valor);');
}

// Estados proyecto
lines.push('');
lines.push('-- Estados de proyecto');
for (const r of db.prepare('SELECT * FROM estados_proyecto').all()) {
  lines.push('INSERT IGNORE INTO estados_proyecto (id, nombre, color, orden) VALUES (' +
    [r.id, esc(r.nombre), esc(r.color), r.orden].join(',') + ');');
}

// Cotizaciones
lines.push('');
lines.push('-- Cotizaciones');
for (const r of db.prepare('SELECT * FROM cotizaciones').all()) {
  const vals = [
    r.id, esc(r.codigo), esc(r.cliente_id), esc(r.estado), esc(r.fecha),
    r.potencia_kwp, r.num_paneles, esc(r.panel_id), esc(r.inversor_id),
    esc(r.bateria_id), r.num_baterias, r.produccion_diaria_kwh, r.produccion_mensual_kwh,
    r.area_requerida_m2, r.peso_total_kg, escJson(r.items_json),
    r.subtotal, r.margen_comercial_pct, r.total_inversion, r.ahorro_mensual,
    r.ahorro_anual, r.roi_sin_incentivos_meses, r.roi_con_incentivos_meses,
    r.deduccion_renta_pct, r.degradacion_anual_pct, r.inflacion_tarifa_pct,
    r.aom_anual, r.aom_incremento_pct, r.pct_autoconsumo, r.precio_excedente_kwh,
    escJson(r.proyeccion_25_json), escJson(r.cronograma_json), esc(r.notas),
    esc(r.empresa_id), esc(r.updated_at)
  ];
  lines.push('INSERT IGNORE INTO cotizaciones (id, codigo, cliente_id, estado, fecha, potencia_kwp, num_paneles, panel_id, inversor_id, bateria_id, num_baterias, produccion_diaria_kwh, produccion_mensual_kwh, area_requerida_m2, peso_total_kg, items_json, subtotal, margen_comercial_pct, total_inversion, ahorro_mensual, ahorro_anual, roi_sin_incentivos_meses, roi_con_incentivos_meses, deduccion_renta_pct, degradacion_anual_pct, inflacion_tarifa_pct, aom_anual, aom_incremento_pct, pct_autoconsumo, precio_excedente_kwh, proyeccion_25_json, cronograma_json, notas, empresa_id, updated_at) VALUES (' +
    vals.join(',') + ');');
}

// Perfiles energeticos
lines.push('');
lines.push('-- Perfiles energeticos');
for (const r of db.prepare('SELECT * FROM perfiles_energeticos').all()) {
  const vals = [
    r.id, esc(r.cliente_id), esc(r.archivo_nombre), esc(r.hoja_origen),
    r.intervalo_minutos, esc(r.fecha_inicio), esc(r.fecha_fin),
    r.numero_mediciones, r.consumo_total_kwh, r.consumo_diario_promedio_kwh,
    r.consumo_mensual_estimado_kwh, r.demanda_promedio_kw, r.demanda_maxima_kw,
    r.produccion_total_kwh,
    escJson(r.perfil_horario_json), escJson(r.resumen_diario_json), escJson(r.mediciones_json),
    esc(r.observaciones), esc(r.empresa_id), esc(r.created_at), esc(r.updated_at)
  ];
  lines.push('INSERT IGNORE INTO perfiles_energeticos (id, cliente_id, archivo_nombre, hoja_origen, intervalo_minutos, fecha_inicio, fecha_fin, numero_mediciones, consumo_total_kwh, consumo_diario_promedio_kwh, consumo_mensual_estimado_kwh, demanda_promedio_kw, demanda_maxima_kw, produccion_total_kwh, perfil_horario_json, resumen_diario_json, mediciones_json, observaciones, empresa_id, created_at, updated_at) VALUES (' +
    vals.join(',') + ');');
}

lines.push('');
lines.push('SET FOREIGN_KEY_CHECKS = 1;');
lines.push('');
lines.push('-- Fin de la migracion');

const output = lines.join('\n');
fs.writeFileSync(path.join(__dirname, '..', 'database', 'migration-data.sql'), output, 'utf8');
console.log('Exportado: database/migration-data.sql (' + lines.length + ' lineas)');
db.close();
