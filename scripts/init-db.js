/**
 * SunQuote - Script de inicialización para SQLite (desarrollo local)
 * Ejecutar: node scripts/init-db.js
 */
const Database = require('better-sqlite3');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const SQLITE_PATH = process.env.SQLITE_PATH || path.join(__dirname, '..', 'sunquote.db');

function hashPassword(password, salt) {
  if (!salt) salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.createHash('sha256');
  hash.update(salt + password);
  return { hash: hash.digest('hex'), salt };
}

console.log('🔄 Inicializando base de datos SQLite...');

// Eliminar DB existente para empezar limpio
if (fs.existsSync(SQLITE_PATH)) {
  fs.unlinkSync(SQLITE_PATH);
  console.log('🗑️  Base de datos anterior eliminada');
}

const db = new Database(SQLITE_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Cargar y ejecutar schema
console.log('📦 Creando tablas...');
const schema = fs.readFileSync(path.join(__dirname, '..', 'database', 'schema-sqlite.sql'), 'utf8');
db.exec(schema);

// Insertar datos de ejemplo
console.log('🌱 Insertando datos de ejemplo...');

// Equipos
const insertEquipo = db.prepare(`
  INSERT INTO equipos (categoria, marca, modelo, descripcion, potencia_wp, potencia_kw, capacidad_kwh, tipo, costo, precio_venta, utilidad_pct, unidad, peso_kg, area_m2, activo, iva, imagen_url)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const equipos = [
  // Paneles
  ['panel', 'Canadian Solar', 'CS7N-730TB-AG', 'Panel Bifacial TOPCon 730Wp', 730, 0, 0, 'Bifacial TOPCon', 280000, 420000, 0, 'und', 33.4, 2.57, 1, 1, ''],
  ['panel', 'JA Solar', 'JAM78S30-610/MR', 'Panel Monocristalino PERC 610Wp', 610, 0, 0, 'Monocristalino PERC', 220000, 340000, 0, 'und', 29.8, 2.72, 1, 1, ''],
  ['panel', 'Trina Solar', 'TSM-DE21M(II)-660W', 'Panel Monocristalino 660Wp', 660, 0, 0, 'Monocristalino', 250000, 380000, 0, 'und', 31.2, 2.58, 1, 1, ''],
  ['panel', 'LONGi', 'LR5-72HTH-580M', 'Panel Monocristalino 580Wp', 580, 0, 0, 'Monocristalino HPDC', 200000, 310000, 0, 'und', 28.5, 2.56, 1, 1, ''],
  ['panel', 'Jinko Solar', 'JKM-N-type 585W', 'Panel N-Type Tiger Neo 585Wp', 585, 0, 0, 'N-Type', 210000, 330000, 0, 'und', 29.0, 2.54, 1, 1, ''],
  // Inversores
  ['inversor', 'Huawei', 'SUN2000-5KTL-L1', 'Inversor On-Grid Monofásico 5kW', 0, 5, 0, 'On-Grid Monofásico', 3200000, 4800000, 0, 'und', 12.0, 0, 1, 1, ''],
  ['inversor', 'Huawei', 'SUN2000-10KTL-M1', 'Inversor On-Grid Trifásico 10kW', 0, 10, 0, 'On-Grid Trifásico', 5500000, 8200000, 0, 'und', 15.5, 0, 1, 1, ''],
  ['inversor', 'Huawei', 'SUN2000-20KTL-M3', 'Inversor On-Grid Trifásico 20kW', 0, 20, 0, 'On-Grid Trifásico', 9000000, 13500000, 0, 'und', 22.0, 0, 1, 1, ''],
  ['inversor', 'Solis', 'S6-GR1P5K', 'Inversor On-Grid Monofásico 5kW', 0, 5, 0, 'On-Grid Monofásico', 2800000, 4200000, 0, 'und', 11.0, 0, 1, 1, ''],
  ['inversor', 'Growatt', 'SPH5000TL BL-UP', 'Inversor Híbrido Monofásico 5kW', 0, 5, 0, 'Híbrido Monofásico', 4500000, 6750000, 0, 'und', 16.0, 0, 1, 1, ''],
  // Baterías
  ['bateria', 'Huawei', 'LUNA2000-5-S0', 'Batería LiFePO4 5kWh', 0, 0, 5.0, 'Litio LiFePO4', 6500000, 9750000, 0, 'und', 55.0, 0, 1, 1, ''],
  ['bateria', 'BYD', 'HVS 11.5', 'Batería LiFePO4 11.5kWh', 0, 0, 11.5, 'Litio LiFePO4', 13500000, 20250000, 0, 'und', 130.0, 0, 1, 1, ''],
  ['bateria', 'Pylontech', 'US5000', 'Batería LiFePO4 4.8kWh', 0, 0, 4.8, 'Litio LiFePO4', 4800000, 7200000, 0, 'und', 45.0, 0, 1, 1, ''],
  // Estructuras
  ['estructura', 'Genérico', 'Estructura Aluminio Techo', 'Estructura para techo inclinado - por panel', 0, 0, 0, 'Techo Inclinado', 85000, 130000, 0, 'und', 5.0, 0, 1, 1, ''],
  ['estructura', 'Genérico', 'Cable Solar 6mm²', 'Cable solar PV1-F 6mm² - por metro', 0, 0, 0, 'Cable DC', 4500, 7000, 0, 'm', 0.08, 0, 1, 1, ''],
  // Servicios
  ['servicio', 'SunQuote', 'Instalación Residencial', 'Mano de obra residencial hasta 10kWp', 0, 0, 0, 'Mano de Obra', 1500000, 2500000, 0, 'global', 0, 0, 1, 1, ''],
  ['servicio', 'SunQuote', 'Instalación Comercial', 'Mano de obra comercial 10-50kWp', 0, 0, 0, 'Mano de Obra', 3500000, 5500000, 0, 'global', 0, 0, 1, 1, ''],
  ['servicio', 'SunQuote', 'Diseño Eléctrico', 'Diseño eléctrico y memorias de cálculo', 0, 0, 0, 'Ingeniería', 800000, 1200000, 0, 'global', 0, 0, 1, 1, ''],
  ['servicio', 'SunQuote', 'Certificación RETIE', 'Certificación RETIE por organismo acreditado', 0, 0, 0, 'Certificación', 1200000, 1800000, 0, 'global', 0, 0, 1, 1, ''],
];

const insertManyEquipos = db.transaction((items) => {
  for (const item of items) insertEquipo.run(...item);
});
insertManyEquipos(equipos);
console.log(`✅ ${equipos.length} equipos insertados`);

// Clientes
const insertCliente = db.prepare(`
  INSERT INTO clientes (nombre, cedula_nit, direccion, telefono, correo, ciudad, operador_red, tipo_tarifa, consumo_mensual_kwh, costo_kwh, hsp, cargas_especiales_kwh_dia, historial_consumo)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const clientes = [
  ['Inmobiliaria Sol del Valle S.A.S.', '900.123.456-7', 'Calle 100 #45-23, Piso 8', '3001234567', 'contacto@soldevalle.com', 'Bogotá', 'Enel-Codensa', 'Comercial', 4500, 850, 4.0, 0, JSON.stringify([4200, 4500, 4800, 4100, 4600, 4700, 4300, 4500, 4900, 4400, 4200, 4500])],
  ['Juan Carlos Pérez López', '1.020.345.678', 'Carrera 15 #82-40, Apto 301', '3109876543', 'jcperez@gmail.com', 'Bogotá', 'Enel-Codensa', 'Residencial', 350, 920, 4.0, 2.5, JSON.stringify([320, 340, 380, 350, 360, 330, 340, 355, 370, 345, 330, 350])],
  ['Fábrica Metales del Cauca S.A.', '891.234.567-1', 'Zona Industrial Km 5 Vía Cali-Yumbo', '3157654321', 'compras@metalescauca.com', 'Yumbo', 'EPSA', 'Industrial', 12000, 780, 4.5, 0, JSON.stringify([11500, 12200, 12800, 11900, 12100, 12500, 11800, 12000, 12400, 11700, 12300, 12000])],
];

const insertManyClientes = db.transaction((items) => {
  for (const item of items) insertCliente.run(...item);
});
insertManyClientes(clientes);
console.log(`✅ ${clientes.length} clientes insertados`);

// Configuraciones
const insertConfig = db.prepare(`
  INSERT INTO configuracion (clave, valor, tipo, descripcion) VALUES (?, ?, ?, ?)
`);

const configs = [
  ['eficiencia_sistema', '0.82', 'number', 'Eficiencia del sistema fotovoltaico'],
  ['degradacion_anual', '0.74', 'number', 'Degradación anual de paneles %'],
  ['inflacion_tarifa', '10', 'number', 'Incremento anual tarifa eléctrica %'],
  ['margen_comercial', '30', 'number', 'Margen comercial por defecto %'],
  ['deduccion_renta', '50', 'number', 'Deducción renta Ley 1715 %'],
  ['empresa_nombre', 'Mi Empresa Solar S.A.S.', 'string', 'Razón Social'],
  ['empresa_nombre_corto', 'Mi Empresa', 'string', 'Nombre comercial'],
  ['empresa_nit', '900.123.456-7', 'string', 'NIT'],
  ['empresa_direccion', 'Calle 93 #14-20 Oficina 501, Bogotá D.C.', 'string', 'Dirección'],
  ['empresa_telefono', '+57 601 345 6789', 'string', 'Teléfono'],
  ['empresa_correo', 'info@sunquote.co', 'string', 'Correo'],
  ['empresa_web', 'www.sunquote.co', 'string', 'Sitio web'],
];

const insertManyConfigs = db.transaction((items) => {
  for (const item of items) insertConfig.run(...item);
});
insertManyConfigs(configs);
console.log(`✅ ${configs.length} configuraciones insertadas`);

// Estados iniciales del tablero de proyectos
const insertEstado = db.prepare(`
  INSERT INTO estados_proyecto (nombre, color, orden) VALUES (?, ?, ?)
`);

const estados = [
  ['Evaluación', 'border-l-4 border-gray-400 bg-surface-container', 1],
  ['Diseño', 'border-l-4 border-blue-400 bg-surface-container', 2],
  ['Propuesta', 'border-l-4 border-purple-400 bg-surface-container', 3],
  ['Aprobado', 'border-l-4 border-yellow-400 bg-surface-container', 4],
  ['Instalación', 'border-l-4 border-orange-400 bg-surface-container', 5],
  ['Operación', 'border-l-4 border-green-500 bg-surface-container', 6],
  ['Cancelado', 'border-l-4 border-red-500 bg-surface-container', 7]
];

const insertManyEstados = db.transaction((items) => {
  for (const item of items) insertEstado.run(...item);
});
insertManyEstados(estados);
console.log(`✅ ${estados.length} estados de proyecto insertados`);

// Perfil Administrador
const allPerms = JSON.stringify([
  'dashboard.ver', 'cotizador.ver', 'cotizador.crear', 'cotizador.editar',
  'cotizador.eliminar', 'cotizador.descargar_pdf', 'clientes.ver',
  'clientes.crear', 'clientes.editar', 'clientes.eliminar', 'inventario.ver',
  'inventario.crear', 'inventario.editar', 'inventario.eliminar',
  'propuestas.ver', 'propuestas.cambiar_estado', 'propuestas.eliminar',
  'configuracion.ver', 'configuracion.editar', 'usuarios.ver',
  'usuarios.crear', 'usuarios.editar', 'usuarios.eliminar', 'reportes.ver'
]);

const insertPerfil = db.prepare(`INSERT INTO perfiles (nombre, descripcion, permisos, es_sistema) VALUES (?, ?, ?, 1)`);
const resultPerfil = insertPerfil.run('Administrador', 'Acceso total al sistema', allPerms);
console.log('✅ Perfil Administrador creado');

// Usuario admin
const { hash, salt } = hashPassword('admin123');
const insertUser = db.prepare(`
  INSERT INTO usuarios (username, password_hash, password_salt, nombre_completo, correo, perfil_id, activo)
  VALUES (?, ?, ?, ?, ?, ?, 1)
`);
insertUser.run('admin', hash, salt, 'Administrador', 'admin@sunquote.co', resultPerfil.lastInsertRowid);
console.log('✅ Usuario admin creado (admin / admin123)');

db.close();
console.log('\n🎉 Base de datos inicializada correctamente!');
console.log('\n📁 Archivo:', SQLITE_PATH);
console.log('\n🔐 Credenciales:');
console.log('   Usuario: admin');
console.log('   Contraseña: admin123');
console.log('\n🚀 Para iniciar el servidor:');
console.log('   node server.js');
console.log('\n🌐 Luego abre: http://localhost:8000');
