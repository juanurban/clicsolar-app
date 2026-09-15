-- SunQuote - Schema SQLite
-- Versión simplificada para desarrollo local

CREATE TABLE IF NOT EXISTS empresas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    nit TEXT DEFAULT '',
    activo INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS clientes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    cedula_nit TEXT,
    direccion TEXT,
    telefono TEXT,
    correo TEXT,
    ciudad TEXT,
    departamento TEXT DEFAULT '',
    municipio TEXT DEFAULT '',
    operador_red TEXT,
    tipo_tarifa TEXT DEFAULT 'Residencial',
    consumo_mensual_kwh REAL DEFAULT 0,
    costo_kwh REAL DEFAULT 0,
    hsp REAL DEFAULT 4.2,
    cargas_especiales_kwh_dia REAL DEFAULT 0,
    historial_consumo TEXT DEFAULT '[]',
    archivos_json TEXT DEFAULT '[]',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS equipos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    categoria TEXT NOT NULL,
    marca TEXT,
    modelo TEXT,
    descripcion TEXT,
    potencia_wp REAL DEFAULT 0,
    potencia_kw REAL DEFAULT 0,
    capacidad_kwh REAL DEFAULT 0,
    tipo TEXT,
    costo REAL DEFAULT 0,
    precio_venta REAL DEFAULT 0,
    utilidad_pct REAL DEFAULT 0,
    unidad TEXT DEFAULT 'und',
    peso_kg REAL DEFAULT 0,
    area_m2 REAL DEFAULT 0,
    activo INTEGER DEFAULT 1,
    iva INTEGER DEFAULT 1,
    imagen_url TEXT,
    empresa_id INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cotizaciones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo TEXT UNIQUE,
    cliente_id INTEGER,
    estado TEXT DEFAULT 'borrador',
    fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    potencia_kwp REAL DEFAULT 0,
    num_paneles INTEGER DEFAULT 0,
    panel_id INTEGER,
    inversor_id INTEGER,
    bateria_id INTEGER,
    num_baterias INTEGER DEFAULT 0,
    produccion_diaria_kwh REAL DEFAULT 0,
    produccion_mensual_kwh REAL DEFAULT 0,
    area_requerida_m2 REAL DEFAULT 0,
    peso_total_kg REAL DEFAULT 0,
    items_json TEXT DEFAULT '[]',
    subtotal REAL DEFAULT 0,
    margen_comercial_pct REAL DEFAULT 15,
    total_inversion REAL DEFAULT 0,
    ahorro_mensual REAL DEFAULT 0,
    ahorro_anual REAL DEFAULT 0,
    roi_sin_incentivos_meses REAL DEFAULT 0,
    roi_con_incentivos_meses REAL DEFAULT 0,
    deduccion_renta_pct REAL DEFAULT 50,
    degradacion_anual_pct REAL DEFAULT 0.74,
    inflacion_tarifa_pct REAL DEFAULT 10,
    aom_anual REAL DEFAULT 0,
    aom_incremento_pct REAL DEFAULT 5,
    pct_autoconsumo REAL DEFAULT 100,
    precio_excedente_kwh REAL DEFAULT 0,
    proyeccion_25_json TEXT DEFAULT '[]',
    cronograma_json TEXT DEFAULT '[]',
    notas TEXT DEFAULT '',
    empresa_id INTEGER,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE SET NULL,
    FOREIGN KEY (panel_id) REFERENCES equipos(id) ON DELETE SET NULL,
    FOREIGN KEY (inversor_id) REFERENCES equipos(id) ON DELETE SET NULL,
    FOREIGN KEY (bateria_id) REFERENCES equipos(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS configuracion (
    clave TEXT PRIMARY KEY,
    valor TEXT,
    tipo TEXT DEFAULT 'string',
    descripcion TEXT
);

CREATE TABLE IF NOT EXISTS perfiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT UNIQUE NOT NULL,
    descripcion TEXT,
    permisos TEXT DEFAULT '[]',
    es_sistema INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    nombre_completo TEXT NOT NULL,
    correo TEXT,
    perfil_id INTEGER NOT NULL,
    empresa_id INTEGER,
    es_superadmin INTEGER DEFAULT 0,
    activo INTEGER DEFAULT 1,
    ultimo_acceso TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (perfil_id) REFERENCES perfiles(id)
    ,FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS sesiones (
    token TEXT PRIMARY KEY,
    usuario_id INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS proyectos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    cotizacion_id INTEGER,
    cliente_id INTEGER NOT NULL,
    estado_id INTEGER,
    estado TEXT DEFAULT 'Evaluación',
    fecha_inicio TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_entrega_estimada TIMESTAMP,
    fecha_entrega_real TIMESTAMP,
    notas TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (cotizacion_id) REFERENCES cotizaciones(id) ON DELETE SET NULL,
    FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tareas_proyecto (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    proyecto_id INTEGER NOT NULL,
    descripcion TEXT NOT NULL,
    completada INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (proyecto_id) REFERENCES proyectos(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS estados_proyecto (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    color TEXT DEFAULT 'border-gray-400 bg-surface-container',
    orden INTEGER DEFAULT 0
);

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
