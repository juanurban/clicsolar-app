CREATE TABLE IF NOT EXISTS clientes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(255) NOT NULL,
    cedula_nit VARCHAR(100),
    direccion TEXT,
    telefono VARCHAR(50),
    correo VARCHAR(150),
    ciudad VARCHAR(100),
    operador_red VARCHAR(100),
    tipo_tarifa VARCHAR(50) DEFAULT 'Residencial',
    consumo_mensual_kwh DECIMAL(10,2) DEFAULT 0,
    costo_kwh DECIMAL(10,2) DEFAULT 0,
    hsp DECIMAL(10,2) DEFAULT 4.2,
    cargas_especiales_kwh_dia DECIMAL(10,2) DEFAULT 0,
    historial_consumo JSON,
    archivos_json JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS equipos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    categoria VARCHAR(50) NOT NULL,
    marca VARCHAR(100),
    modelo VARCHAR(100),
    descripcion TEXT,
    potencia_wp DECIMAL(10,2) DEFAULT 0,
    potencia_kw DECIMAL(10,2) DEFAULT 0,
    capacidad_kwh DECIMAL(10,2) DEFAULT 0,
    tipo VARCHAR(100),
    costo DECIMAL(12,2) DEFAULT 0,
    precio_venta DECIMAL(12,2) DEFAULT 0,
    utilidad_pct DECIMAL(5,2) DEFAULT 0,
    unidad VARCHAR(20) DEFAULT 'und',
    peso_kg DECIMAL(10,2) DEFAULT 0,
    area_m2 DECIMAL(10,2) DEFAULT 0,
    activo TINYINT(1) DEFAULT 1,
    iva TINYINT(1) DEFAULT 1,
    imagen_url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cotizaciones (
    id INT AUTO_INCREMENT PRIMARY KEY,
    codigo VARCHAR(50) UNIQUE,
    cliente_id INT,
    estado VARCHAR(50) DEFAULT 'borrador',
    fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    potencia_kwp DECIMAL(10,2) DEFAULT 0,
    num_paneles INT DEFAULT 0,
    panel_id INT,
    inversor_id INT,
    bateria_id INT,
    num_baterias INT DEFAULT 0,
    produccion_diaria_kwh DECIMAL(10,2) DEFAULT 0,
    produccion_mensual_kwh DECIMAL(10,2) DEFAULT 0,
    area_requerida_m2 DECIMAL(10,2) DEFAULT 0,
    peso_total_kg DECIMAL(10,2) DEFAULT 0,
    items_json JSON,
    subtotal DECIMAL(12,2) DEFAULT 0,
    margen_comercial_pct DECIMAL(5,2) DEFAULT 15,
    total_inversion DECIMAL(12,2) DEFAULT 0,
    ahorro_mensual DECIMAL(12,2) DEFAULT 0,
    ahorro_anual DECIMAL(12,2) DEFAULT 0,
    roi_sin_incentivos_meses DECIMAL(10,2) DEFAULT 0,
    roi_con_incentivos_meses DECIMAL(10,2) DEFAULT 0,
    deduccion_renta_pct DECIMAL(5,2) DEFAULT 50,
    degradacion_anual_pct DECIMAL(5,2) DEFAULT 0.74,
    inflacion_tarifa_pct DECIMAL(5,2) DEFAULT 10,
    aom_anual DECIMAL(12,2) DEFAULT 0,
    aom_incremento_pct DECIMAL(5,2) DEFAULT 5,
    pct_autoconsumo DECIMAL(5,2) DEFAULT 100,
    precio_excedente_kwh DECIMAL(10,2) DEFAULT 0,
    proyeccion_25_json JSON,
    cronograma_json JSON,
    notas TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (cliente_id) REFERENCES clientes(id),
    FOREIGN KEY (panel_id) REFERENCES equipos(id),
    FOREIGN KEY (inversor_id) REFERENCES equipos(id),
    FOREIGN KEY (bateria_id) REFERENCES equipos(id)
);

CREATE TABLE IF NOT EXISTS configuracion (
    clave VARCHAR(100) PRIMARY KEY,
    valor TEXT,
    tipo VARCHAR(50) DEFAULT 'string',
    descripcion TEXT
);

CREATE TABLE IF NOT EXISTS perfiles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) UNIQUE NOT NULL,
    descripcion TEXT,
    permisos JSON,
    es_sistema TINYINT(1) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS usuarios (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    password_salt VARCHAR(255) NOT NULL,
    nombre_completo VARCHAR(255) NOT NULL,
    correo VARCHAR(150),
    perfil_id INT NOT NULL,
    activo TINYINT(1) DEFAULT 1,
    ultimo_acceso TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (perfil_id) REFERENCES perfiles(id)
);

CREATE TABLE IF NOT EXISTS sesiones (
    token VARCHAR(255) PRIMARY KEY,
    usuario_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);

CREATE TABLE IF NOT EXISTS estados_proyecto (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    color VARCHAR(100) DEFAULT 'border-gray-400 bg-surface-container',
    orden INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS proyectos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(255) NOT NULL,
    cotizacion_id INT,
    cliente_id INT NOT NULL,
    estado_id INT,
    fecha_inicio TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_entrega_estimada TIMESTAMP NULL,
    fecha_entrega_real TIMESTAMP NULL,
    notas TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (cotizacion_id) REFERENCES cotizaciones(id),
    FOREIGN KEY (cliente_id) REFERENCES clientes(id),
    FOREIGN KEY (estado_id) REFERENCES estados_proyecto(id)
);

CREATE TABLE IF NOT EXISTS tareas_proyecto (
    id INT AUTO_INCREMENT PRIMARY KEY,
    proyecto_id INT NOT NULL,
    descripcion TEXT NOT NULL,
    completada TINYINT(1) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (proyecto_id) REFERENCES proyectos(id) ON DELETE CASCADE
);
