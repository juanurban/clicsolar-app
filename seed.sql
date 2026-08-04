USE sunquote;

-- Limpiar tablas
SET FOREIGN_KEY_CHECKS = 0;
TRUNCATE TABLE sesiones;
TRUNCATE TABLE usuarios;
TRUNCATE TABLE perfiles;
TRUNCATE TABLE configuracion;
TRUNCATE TABLE cotizaciones;
TRUNCATE TABLE equipos;
TRUNCATE TABLE clientes;
SET FOREIGN_KEY_CHECKS = 1;

-- Seed Configuración
INSERT INTO configuracion (clave, valor, tipo, descripcion) VALUES
('margen_comercial', '30', 'number', 'Margen comercial por defecto en porcentaje'),
('deduccion_renta', '50', 'number', 'Porcentaje deducción renta Ley 1715'),
('tasa_impositiva', '33', 'number', 'Tasa impositiva para cálculo beneficio fiscal'),
('empresa_nombre', 'Mi Empresa Solar S.A.', 'texto', 'Razón Social de la empresa'),
('empresa_nombre_corto', 'Mi Empresa', 'texto', 'Nombre corto o comercial de la empresa para usar en la barra lateral'),
('empresa_nit', '900.123.456-7', 'texto', 'NIT o número de identificación'),
('empresa_direccion', 'Calle 93 #14-20 Oficina 501, Bogotá D.C.', 'string', 'Dirección de la empresa'),
('empresa_telefono', '+57 601 345 6789', 'string', 'Teléfono de la empresa'),
('empresa_correo', 'info@sunquote.co', 'string', 'Correo de la empresa'),
('empresa_logo', '/static/img/logo.svg', 'string', 'URL del logo de la empresa'),
('empresa_firma', '', 'string', 'URL de la firma para cotizaciones'),
('cotizacion_validez', '15', 'number', 'Días de validez de la cotización'),
('cotizacion_notas', 'Los precios están sujetos a cambios sin previo aviso. Esta cotización no incluye adecuaciones eléctricas no contempladas en la visita técnica.', 'texto', 'Notas por defecto en la cotización'),
('diseno_on_grid_bat', '', 'string', 'Ruta de la imagen del diseño On Grid con baterías'),
('diseno_on_grid', '', 'string', 'Ruta de la imagen del diseño On Grid sin baterías'),
('diseno_off_grid', '', 'string', 'Ruta de la imagen del diseño Off Grid');

-- Seed Perfiles y Usuarios Administradores
INSERT INTO perfiles (id, nombre, descripcion, permisos, es_sistema) VALUES 
(1, 'Administrador', 'Acceso total a todos los módulos y configuraciones del sistema.', '["dashboard.ver","clientes.ver","clientes.crear","clientes.editar","clientes.eliminar","cotizador.ver","cotizador.crear","inventario.ver","inventario.crear","inventario.editar","inventario.eliminar","propuestas.ver","propuestas.editar","propuestas.eliminar","configuracion.ver","configuracion.editar","usuarios.ver","usuarios.crear","usuarios.editar","usuarios.eliminar"]', 1),
(2, 'Vendedor', 'Acceso limitado para crear clientes y cotizaciones, sin acceso a inventario y configuraciones.', '["dashboard.ver","clientes.ver","clientes.crear","cotizador.ver","cotizador.crear","propuestas.ver"]', 1);

-- Password es "admin123"
INSERT INTO usuarios (username, password_hash, password_salt, nombre_completo, correo, perfil_id, activo) VALUES 
('admin', '7ffc5dffdc5cd61f7db191dcb04d49ed4e015d2fb3be1eccecc5274d47343e03', 'f0e4c2f76c58916ec258f246851bea091d14d4247a2fc3e18f26ea462610b64d', 'Administrador Principal', 'admin@ejemplo.com', 1, 1);
