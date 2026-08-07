import sqlite3
import json
import os

DB_PATH = "sunquote.db"
OUTPUT_FILE = "migration_data.sql"

def escape_string(s):
    if s is None:
        return "NULL"
    # Basic escaping for MySQL
    s = s.replace("'", "''")
    s = s.replace("\\", "\\\\")
    return f"'{s}'"

def escape_number(n):
    if n is None:
        return "NULL"
    return str(n)

def export_table(cursor, table_name, columns, types):
    cursor.execute(f"SELECT * FROM {table_name}")
    rows = cursor.fetchall()
    if not rows:
        return ""
    
    sql = f"-- Table: {table_name}\n"
    for row in rows:
        values = []
        for i, col in enumerate(columns):
            val = row[i]
            if val is None:
                values.append("NULL")
            elif types[i] == 'TEXT' or types[i] == 'TIMESTAMP':
                values.append(escape_string(val))
            else:
                values.append(escape_number(val))
                
        sql += f"INSERT IGNORE INTO {table_name} ({', '.join(columns)}) VALUES ({', '.join(values)});\n"
    return sql + "\n"

def main():
    if not os.path.exists(DB_PATH):
        print(f"Error: Database {DB_PATH} not found.")
        return

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    tables = {
        "perfiles": (["id", "nombre", "descripcion", "permisos", "es_sistema", "created_at"],
                     ["INTEGER", "TEXT", "TEXT", "TEXT", "INTEGER", "TIMESTAMP"]),
        "configuracion": (["clave", "valor", "tipo", "descripcion"],
                          ["TEXT", "TEXT", "TEXT", "TEXT"]),
        "clientes": (["id", "nombre", "cedula_nit", "direccion", "telefono", "correo", "ciudad", "operador_red", "tipo_tarifa", "consumo_mensual_kwh", "costo_kwh", "hsp", "cargas_especiales_kwh_dia", "historial_consumo", "archivos_json", "created_at", "updated_at"],
                     ["INTEGER", "TEXT", "TEXT", "TEXT", "TEXT", "TEXT", "TEXT", "TEXT", "TEXT", "REAL", "REAL", "REAL", "REAL", "TEXT", "TEXT", "TIMESTAMP", "TIMESTAMP"]),
        "equipos": (["id", "categoria", "marca", "modelo", "descripcion", "potencia_wp", "potencia_kw", "capacidad_kwh", "tipo", "costo", "precio_venta", "utilidad_pct", "unidad", "peso_kg", "area_m2", "activo", "iva", "imagen_url", "created_at"],
                    ["INTEGER", "TEXT", "TEXT", "TEXT", "TEXT", "REAL", "REAL", "REAL", "TEXT", "REAL", "REAL", "REAL", "TEXT", "REAL", "REAL", "INTEGER", "INTEGER", "TEXT", "TIMESTAMP"]),
        "cotizaciones": (["id", "codigo", "cliente_id", "estado", "fecha", "potencia_kwp", "num_paneles", "panel_id", "inversor_id", "bateria_id", "num_baterias", "produccion_diaria_kwh", "produccion_mensual_kwh", "area_requerida_m2", "peso_total_kg", "items_json", "subtotal", "margen_comercial_pct", "total_inversion", "ahorro_mensual", "ahorro_anual", "roi_sin_incentivos_meses", "roi_con_incentivos_meses", "deduccion_renta_pct", "degradacion_anual_pct", "inflacion_tarifa_pct", "aom_anual", "aom_incremento_pct", "pct_autoconsumo", "precio_excedente_kwh", "proyeccion_25_json", "cronograma_json", "notas", "updated_at"],
                         ["INTEGER", "TEXT", "INTEGER", "TEXT", "TIMESTAMP", "REAL", "INTEGER", "INTEGER", "INTEGER", "INTEGER", "INTEGER", "REAL", "REAL", "REAL", "REAL", "TEXT", "REAL", "REAL", "REAL", "REAL", "REAL", "REAL", "REAL", "REAL", "REAL", "REAL", "REAL", "REAL", "REAL", "REAL", "TEXT", "TEXT", "TEXT", "TIMESTAMP"])
    }

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        f.write("-- MySQL Migration Script from SQLite\n")
        f.write("SET FOREIGN_KEY_CHECKS = 0;\n\n")
        
        for table, (cols, types) in tables.items():
            try:
                print(f"Exporting {table}...")
                sql = export_table(cursor, table, cols, types)
                f.write(sql)
            except Exception as e:
                print(f"Error exporting {table}: {e}")
                
        # Password reset for admin to Node.js format (admin / admin123)
        print("Adding admin user with Node.js compatible password hash...")
        admin_sql = """
-- Reset admin password to be compatible with Node.js backend
DELETE FROM usuarios WHERE username = 'admin';
INSERT INTO usuarios (id, username, password_hash, password_salt, nombre_completo, correo, perfil_id, activo)
VALUES (1, 'admin', '5eb50c99a61579be408e03ed1be3e4cf6f76c5f49e4da74b46c64ff3f3a8f4c0', 'e5c92c8152db4be588cfdc77ebccb21b', 'Administrador', 'admin@sunquote.co', 1, 1);
"""
        f.write(admin_sql)
        f.write("\nSET FOREIGN_KEY_CHECKS = 1;\n")
        
    conn.close()
    print(f"Done! Migration file created at {OUTPUT_FILE}")

if __name__ == "__main__":
    main()
