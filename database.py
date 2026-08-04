"""
SunQuote - Database initialization and seed data.
SQLite3 embedded database for solar PV quoting application.
"""
import sqlite3
import os
import json
import hashlib
import secrets
from datetime import datetime, timedelta

# Allow overriding DB path via environment variable (useful for Render/Docker volumes)
DB_PATH = os.environ.get("DB_PATH", os.path.join(os.path.dirname(os.path.abspath(__file__)), "sunquote.db"))


def get_db():
    """Get a database connection with row factory."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db():
    """Create all tables if they don't exist."""
    conn = get_db()
    cursor = conn.cursor()

    cursor.executescript("""
        CREATE TABLE IF NOT EXISTS clientes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nombre TEXT NOT NULL,
            cedula_nit TEXT,
            direccion TEXT,
            telefono TEXT,
            correo TEXT,
            ciudad TEXT,
            operador_red TEXT,
            tipo_tarifa TEXT DEFAULT 'Residencial',
            consumo_mensual_kwh REAL DEFAULT 0,
            costo_kwh REAL DEFAULT 0,
            hsp REAL DEFAULT 4.2,
            cargas_especiales_kwh_dia REAL DEFAULT 0,
            historial_consumo TEXT DEFAULT '[]',
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
            imagen_url TEXT DEFAULT '',
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
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (cliente_id) REFERENCES clientes(id),
            FOREIGN KEY (panel_id) REFERENCES equipos(id),
            FOREIGN KEY (inversor_id) REFERENCES equipos(id),
            FOREIGN KEY (bateria_id) REFERENCES equipos(id)
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
            activo INTEGER DEFAULT 1,
            ultimo_acceso TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (perfil_id) REFERENCES perfiles(id)
        );

        CREATE TABLE IF NOT EXISTS sesiones (
            token TEXT PRIMARY KEY,
            usuario_id INTEGER NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            expires_at TIMESTAMP NOT NULL,
            FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
        );
    """)

    conn.commit()
    conn.close()

    # Migración: agregar columna iva si no existe
    try:
        conn2 = get_db()
        conn2.execute("ALTER TABLE equipos ADD COLUMN iva INTEGER DEFAULT 1")
        conn2.commit()
        conn2.close()
    except sqlite3.OperationalError:
        pass  # Columna ya existe

    # Migración: agregar config keys de diseño
    try:
        conn4 = get_db()
        diseno_keys = [
            ("diseno_on_grid_bat", "", "string", "Ruta de la imagen del diseño On Grid con baterías"),
            ("diseno_on_grid", "", "string", "Ruta de la imagen del diseño On Grid sin baterías"),
            ("diseno_off_grid", "", "string", "Ruta de la imagen del diseño Off Grid"),
        ]
        for clave, valor, tipo, desc in diseno_keys:
            conn4.execute(
                "INSERT OR IGNORE INTO configuracion (clave, valor, tipo, descripcion) VALUES (?, ?, ?, ?)",
                (clave, valor, tipo, desc)
            )
        conn4.commit()
        conn4.close()
    except sqlite3.OperationalError:
        pass


def seed_data():
    """Insert default data if tables are empty."""
    conn = get_db()
    cursor = conn.cursor()

    # Check if data already exists
    cursor.execute("SELECT COUNT(*) FROM equipos")
    if cursor.fetchone()[0] > 0:
        conn.close()
        return

    # ── Seed: Paneles Solares ──
    paneles = [
        ("panel", "Canadian Solar", "CS7N-730TB-AG", "Panel Bifacial TOPCon 730Wp - Alta eficiencia, ideal para proyectos comerciales e industriales", 730, 0, 0, "Bifacial TOPCon", 280000, 420000, "und", 33.4, 2.57, 1),
        ("panel", "JA Solar", "JAM78S30-610/MR", "Panel Monocristalino PERC 610Wp - Excelente relación costo-beneficio", 610, 0, 0, "Monocristalino PERC", 220000, 340000, "und", 29.8, 2.72, 1),
        ("panel", "Trina Solar", "TSM-DE21M(II)-660W", "Panel Monocristalino Vertex S+ 660Wp - Rendimiento superior en altas temperaturas", 660, 0, 0, "Monocristalino", 250000, 380000, "und", 31.2, 2.58, 1),
        ("panel", "LONGi", "LR5-72HTH-580M", "Panel Monocristalino Hi-MO 6 580Wp - Tecnología HPDC, excelente en baja irradiancia", 580, 0, 0, "Monocristalino HPDC", 200000, 310000, "und", 28.5, 2.56, 1),
        ("panel", "Jinko Solar", "JKM-N-type 585W", "Panel N-Type Tiger Neo 585Wp - Baja degradación y alta eficiencia", 585, 0, 0, "N-Type", 210000, 330000, "und", 29.0, 2.54, 1),
    ]

    # ── Seed: Inversores ──
    inversores = [
        ("inversor", "Huawei", "SUN2000-5KTL-L1", "Inversor On-Grid Monofásico 5kW con optimizadores MPPT", 0, 5, 0, "On-Grid Monofásico", 3200000, 4800000, "und", 12.0, 0, 1),
        ("inversor", "Huawei", "SUN2000-10KTL-M1", "Inversor On-Grid Trifásico 10kW - Eficiencia 98.6%", 0, 10, 0, "On-Grid Trifásico", 5500000, 8200000, "und", 15.5, 0, 1),
        ("inversor", "Huawei", "SUN2000-20KTL-M3", "Inversor On-Grid Trifásico 20kW - Para proyectos comerciales", 0, 20, 0, "On-Grid Trifásico", 9000000, 13500000, "und", 22.0, 0, 1),
        ("inversor", "Solis", "S6-GR1P5K", "Inversor On-Grid Monofásico 5kW - Compacto y eficiente", 0, 5, 0, "On-Grid Monofásico", 2800000, 4200000, "und", 11.0, 0, 1),
        ("inversor", "Solis", "S6-GR3P10K", "Inversor On-Grid Trifásico 10kW - Alta confiabilidad", 0, 10, 0, "On-Grid Trifásico", 4800000, 7200000, "und", 14.0, 0, 1),
        ("inversor", "Growatt", "SPH5000TL BL-UP", "Inversor Híbrido Monofásico 5kW - Compatible con baterías", 0, 5, 0, "Híbrido Monofásico", 4500000, 6750000, "und", 16.0, 0, 1),
        ("inversor", "Growatt", "SPH10000TL3 BH-UP", "Inversor Híbrido Trifásico 10kW - Backup y autoconsumo", 0, 10, 0, "Híbrido Trifásico", 7500000, 11250000, "und", 20.0, 0, 1),
        ("inversor", "Huawei", "SUN2000-50KTL-M3", "Inversor On-Grid Trifásico 50kW - Para grandes proyectos", 0, 50, 0, "On-Grid Trifásico", 18000000, 27000000, "und", 45.0, 0, 1),
    ]

    # ── Seed: Baterías ──
    baterias = [
        ("bateria", "Huawei", "LUNA2000-5-S0", "Batería LiFePO4 5kWh - Modular, hasta 30kWh", 0, 0, 5.0, "Litio LiFePO4", 6500000, 9750000, "und", 55.0, 0, 1),
        ("bateria", "Huawei", "LUNA2000-10-S0", "Batería LiFePO4 10kWh - 2 módulos", 0, 0, 10.0, "Litio LiFePO4", 12000000, 18000000, "und", 108.0, 0, 1),
        ("bateria", "BYD", "HVS 11.5", "Batería LiFePO4 11.5kWh - Alta densidad energética", 0, 0, 11.5, "Litio LiFePO4", 13500000, 20250000, "und", 130.0, 0, 1),
        ("bateria", "Pylontech", "US5000", "Batería LiFePO4 4.8kWh - Económica y fiable", 0, 0, 4.8, "Litio LiFePO4", 4800000, 7200000, "und", 45.0, 0, 1),
    ]

    # ── Seed: Estructuras y Cableado ──
    estructuras = [
        ("estructura", "Genérico", "Estructura Aluminio Techo", "Estructura de montaje en aluminio anodizado para techo inclinado - por panel", 0, 0, 0, "Techo Inclinado", 85000, 130000, "und", 5.0, 0, 1),
        ("estructura", "Genérico", "Estructura Aluminio Piso", "Estructura de montaje en aluminio para suelo/terraza - por panel", 0, 0, 0, "Suelo", 120000, 180000, "und", 8.0, 0, 1),
        ("estructura", "Genérico", "Cable Solar 6mm²", "Cable solar fotovoltaico PV1-F 6mm², resistente UV - por metro", 0, 0, 0, "Cable DC", 4500, 7000, "m", 0.08, 0, 1),
        ("estructura", "Genérico", "Cable Solar 10mm²", "Cable solar fotovoltaico PV1-F 10mm² - por metro", 0, 0, 0, "Cable DC", 7500, 11000, "m", 0.12, 0, 1),
        ("estructura", "Genérico", "Protecciones DC", "Caja de protecciones DC: fusibles, seccionadores, DPS - por string", 0, 0, 0, "Protección", 280000, 420000, "und", 3.0, 0, 1),
        ("estructura", "Genérico", "Accesorios de Instalación", "Kits de fijación, terminales, abrazaderas, tornillería y tubería conduit", 0, 0, 0, "Accesorios", 200000, 300000, "global", 0, 0, 1),
    ]

    # ── Seed: Servicios ──
    servicios = [
        ("servicio", "SunQuote", "Instalación Residencial", "Mano de obra para instalación de sistema residencial hasta 10kWp", 0, 0, 0, "Mano de Obra", 1500000, 2500000, "global", 0, 0, 1),
        ("servicio", "SunQuote", "Instalación Comercial", "Mano de obra para instalación de sistema comercial 10-50kWp", 0, 0, 0, "Mano de Obra", 3500000, 5500000, "global", 0, 0, 1),
        ("servicio", "SunQuote", "Instalación Industrial", "Mano de obra para instalación de sistema industrial >50kWp", 0, 0, 0, "Mano de Obra", 8000000, 12000000, "global", 0, 0, 1),
        ("servicio", "SunQuote", "Diseño Eléctrico", "Diseño eléctrico, memorias de cálculo y planos", 0, 0, 0, "Ingeniería", 800000, 1200000, "global", 0, 0, 1),
        ("servicio", "SunQuote", "Certificación RETIE", "Certificación RETIE por organismo acreditado", 0, 0, 0, "Certificación", 1200000, 1800000, "global", 0, 0, 1),
        ("servicio", "SunQuote", "Trámites Operador Red", "Trámites de conexión ante operador de red (autogenerador)", 0, 0, 0, "Trámite", 500000, 800000, "global", 0, 0, 1),
        ("servicio", "SunQuote", "Trámites Incentivos", "Trámites de incentivos tributarios Ley 1715 ante UPME/ANLA", 0, 0, 0, "Trámite", 1000000, 1500000, "global", 0, 0, 1),
        ("servicio", "SunQuote", "Transporte y Logística", "Flete y transporte de equipos y materiales a sitio de proyecto", 0, 0, 0, "Logística", 350000, 500000, "global", 0, 0, 1),
        ("servicio", "SunQuote", "Capacitación", "Capacitación en operación y mantenimiento del sistema", 0, 0, 0, "Servicio", 300000, 500000, "global", 0, 0, 1),
    ]

    insert_equipo = """
        INSERT INTO equipos (categoria, marca, modelo, descripcion, potencia_wp, potencia_kw, capacidad_kwh,
                             tipo, costo, precio_venta, unidad, peso_kg, area_m2, activo, iva)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """
    for data in paneles + inversores + baterias + estructuras + servicios:
        row = list(data) + [1]  # iva = true by default
        cursor.execute(insert_equipo, row)

    # ── Seed: Clientes de ejemplo ──
    clientes = [
        ("Inmobiliaria Sol del Valle S.A.S.", "900.123.456-7", "Calle 100 #45-23, Piso 8", "3001234567", "contacto@soldevalle.com", "Bogotá", "Enel-Codensa", "Comercial", 4500, 850, 4.0, 0,
         json.dumps([4200, 4500, 4800, 4100, 4600, 4700, 4300, 4500, 4900, 4400, 4200, 4500])),
        ("Juan Carlos Pérez López", "1.020.345.678", "Carrera 15 #82-40, Apto 301", "3109876543", "jcperez@gmail.com", "Bogotá", "Enel-Codensa", "Residencial", 350, 920, 4.0, 2.5,
         json.dumps([320, 340, 380, 350, 360, 330, 340, 355, 370, 345, 330, 350])),
        ("Fábrica Metales del Cauca S.A.", "891.234.567-1", "Zona Industrial Km 5 Vía Cali-Yumbo", "3157654321", "compras@metalescauca.com", "Yumbo", "EPSA", "Industrial", 12000, 780, 4.5, 0,
         json.dumps([11500, 12200, 12800, 11900, 12100, 12500, 11800, 12000, 12400, 11700, 12300, 12000])),
    ]

    insert_cliente = """
        INSERT INTO clientes (nombre, cedula_nit, direccion, telefono, correo, ciudad, operador_red,
                              tipo_tarifa, consumo_mensual_kwh, costo_kwh, hsp, cargas_especiales_kwh_dia,
                              historial_consumo)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """
    for data in clientes:
        cursor.execute(insert_cliente, data)

    # ── Seed: Configuración por defecto ──
    config = [
        ("eficiencia_sistema", "0.82", "number", "Eficiencia del sistema fotovoltaico (0-1)"),
        ("degradacion_anual", "0.74", "number", "Degradación anual de paneles en porcentaje"),
        ("inflacion_tarifa", "10", "number", "Incremento anual esperado de tarifa eléctrica en porcentaje"),
        ("aom_porcentaje", "1.5", "number", "Porcentaje de la inversión para AOM anual"),
        ("aom_incremento", "5", "number", "Incremento anual del costo AOM en porcentaje"),
        ("margen_comercial", "30", "number", "Margen comercial por defecto en porcentaje"),
        ("deduccion_renta", "50", "number", "Porcentaje deducción renta Ley 1715"),
        ("tasa_impositiva", "33", "number", "Tasa impositiva para cálculo beneficio fiscal"),
        ('empresa_nombre', 'Mi Empresa Solar S.A.', 'texto', 'Razón Social de la empresa'),
        ('empresa_nombre_corto', 'Mi Empresa', 'texto', 'Nombre corto o comercial de la empresa para usar en la barra lateral'),
        ('empresa_nit', '900.123.456-7', 'texto', 'NIT o número de identificación'),
        ("empresa_direccion", "Calle 93 #14-20 Oficina 501, Bogotá D.C.", "string", "Dirección de la empresa"),
        ("empresa_telefono", "+57 601 345 6789", "string", "Teléfono de la empresa"),
        ("empresa_correo", "info@sunquote.co", "string", "Correo de la empresa"),
        ("empresa_web", "www.sunquote.co", "string", "Sitio web de la empresa"),
        ("pago_anticipo_pct", "60", "number", "Porcentaje de anticipo"),
        ("pago_contraentrega_pct", "40", "number", "Porcentaje contra entrega"),
        ("cronograma_semanas", "4", "number", "Duración del cronograma en semanas"),
        ("hsp_defecto", "4.2", "number", "Horas Sol Pico por defecto"),
        ("asesor_nombre", "", "string", "Nombre del asesor comercial"),
        ("asesor_telefono", "", "string", "Teléfono del asesor comercial"),
        ("asesor_correo", "", "string", "Correo electrónico del asesor comercial"),
        ("firma_asesor", "", "string", "Ruta de la imagen de la firma del asesor"),
        ("empresa_logo", "", "string", "Ruta del logo de la empresa"),
        ("diseno_on_grid_bat", "", "string", "Ruta de la imagen del diseño On Grid con baterías"),
        ("diseno_on_grid", "", "string", "Ruta de la imagen del diseño On Grid sin baterías"),
        ("diseno_off_grid", "", "string", "Ruta de la imagen del diseño Off Grid"),
    ]

    for clave, valor, tipo, desc in config:
        cursor.execute(
            "INSERT OR IGNORE INTO configuracion (clave, valor, tipo, descripcion) VALUES (?, ?, ?, ?)",
            (clave, valor, tipo, desc)
        )

    conn.commit()
    conn.close()
    print("✅ Base de datos inicializada con datos de ejemplo.")

    # ── Seed: Perfiles y usuario admin ──
    seed_perfiles_y_admin()


# ══════════════════════════════════════════
#  PASSWORD HASHING
# ══════════════════════════════════════════

def hash_password(password, salt=None):
    """Hash a password with SHA-256 + salt. Returns (hash, salt)."""
    if salt is None:
        salt = secrets.token_hex(16)
    pw_hash = hashlib.sha256((salt + password).encode('utf-8')).hexdigest()
    return pw_hash, salt


# ══════════════════════════════════════════
#  PERMISOS DEL SISTEMA
# ══════════════════════════════════════════

ALL_PERMISSIONS = [
    # Dashboard
    "dashboard.ver",
    # Cotizador
    "cotizador.ver", "cotizador.crear", "cotizador.editar",
    "cotizador.eliminar", "cotizador.descargar_pdf",
    # Clientes
    "clientes.ver", "clientes.crear", "clientes.editar", "clientes.eliminar",
    # Inventario
    "inventario.ver", "inventario.crear", "inventario.editar", "inventario.eliminar",
    # Propuestas
    "propuestas.ver", "propuestas.cambiar_estado", "propuestas.eliminar",
    # Configuración
    "configuracion.ver", "configuracion.editar",
    # Usuarios
    "usuarios.ver", "usuarios.crear", "usuarios.editar", "usuarios.eliminar",
    # Reportes
    "reportes.ver",
]

ASESOR_PERMISSIONS = [
    "dashboard.ver",
    "cotizador.ver", "cotizador.crear", "cotizador.editar",
    "cotizador.eliminar", "cotizador.descargar_pdf",
    "clientes.ver", "clientes.crear", "clientes.editar", "clientes.eliminar",
    "propuestas.ver", "propuestas.cambiar_estado",
    "reportes.ver",
]

VIEWER_PERMISSIONS = [
    "dashboard.ver",
    "clientes.ver",
    "propuestas.ver",
    "reportes.ver",
]


def seed_perfiles_y_admin():
    """Create default profiles and admin user if they don't exist."""
    conn = get_db()

    # Check if profiles already exist
    count = conn.execute("SELECT COUNT(*) FROM perfiles").fetchone()[0]
    if count > 0:
        conn.close()
        return

    # Create default profiles
    perfiles = [
        ("Administrador", "Acceso total al sistema", json.dumps(ALL_PERMISSIONS), 1),
        ("Asesor Comercial", "Gestión de cotizaciones, clientes y propuestas", json.dumps(ASESOR_PERMISSIONS), 1),
        ("Visualizador", "Solo lectura de dashboard, clientes, propuestas y reportes", json.dumps(VIEWER_PERMISSIONS), 1),
    ]
    for nombre, desc, permisos, es_sistema in perfiles:
        conn.execute(
            "INSERT INTO perfiles (nombre, descripcion, permisos, es_sistema) VALUES (?, ?, ?, ?)",
            (nombre, desc, permisos, es_sistema)
        )

    # Get admin profile id
    admin_perfil = conn.execute("SELECT id FROM perfiles WHERE nombre = 'Administrador'").fetchone()

    # Create admin user
    pw_hash, pw_salt = hash_password("admin123")
    conn.execute(
        "INSERT INTO usuarios (username, password_hash, password_salt, nombre_completo, correo, perfil_id, activo) VALUES (?, ?, ?, ?, ?, ?, 1)",
        ("admin", pw_hash, pw_salt, "Administrador", "admin@sunquote.co", admin_perfil[0])
    )

    conn.commit()
    conn.close()
    print("🔐 Perfiles y usuario admin creados. Usuario: admin / Contraseña: admin123")


def dict_from_row(row):
    """Convert a sqlite3.Row to a dictionary."""
    if row is None:
        return None
    return dict(row)


def dicts_from_rows(rows):
    """Convert a list of sqlite3.Row to a list of dictionaries."""
    return [dict(row) for row in rows]
