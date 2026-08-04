"""
SunQuote - Cotizaciones API Router
Dimensioning, financial analysis, and quotation management.
"""
import math
import json
from datetime import datetime
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Optional, List
from database import get_db, dict_from_row, dicts_from_rows

router = APIRouter()


# ── Pydantic Models ──

class DimensionarRequest(BaseModel):
    consumo_mensual_kwh: float
    costo_kwh: float
    hsp: float = 4.2
    cargas_especiales_kwh_dia: float = 0
    eficiencia: float = 0.82
    panel_id: int
    inversor_id: Optional[int] = None


class CalcularFinancieroRequest(BaseModel):
    produccion_mensual_kwh: float
    costo_kwh: float
    total_inversion: float
    deduccion_renta_pct: float = 50
    tasa_impositiva: float = 33
    degradacion_anual_pct: float = 0.74
    inflacion_tarifa_pct: float = 10
    aom_anual: float = 0
    aom_incremento_pct: float = 5
    pct_autoconsumo: float = 100
    precio_excedente_kwh: float = 0


class CotizacionItem(BaseModel):
    equipo_id: int
    cantidad: float
    precio_unitario: float
    subtotal: float


class CotizacionCreate(BaseModel):
    cliente_id: int
    panel_id: int
    inversor_id: int
    bateria_id: Optional[int] = None
    num_baterias: int = 0
    potencia_kwp: float = 0
    num_paneles: int = 0
    produccion_diaria_kwh: float = 0
    produccion_mensual_kwh: float = 0
    area_requerida_m2: float = 0
    peso_total_kg: float = 0
    items_json: Optional[str] = "[]"
    subtotal: float = 0
    margen_comercial_pct: float = 15
    total_inversion: float = 0
    ahorro_mensual: float = 0
    ahorro_anual: float = 0
    roi_sin_incentivos_meses: float = 0
    roi_con_incentivos_meses: float = 0
    deduccion_renta_pct: float = 50
    degradacion_anual_pct: float = 0.74
    inflacion_tarifa_pct: float = 10
    aom_anual: float = 0
    aom_incremento_pct: float = 5
    pct_autoconsumo: float = 100
    precio_excedente_kwh: float = 0
    proyeccion_25_json: Optional[str] = "[]"
    cronograma_json: Optional[str] = "[]"
    notas: Optional[str] = ""


class CotizacionUpdate(CotizacionCreate):
    estado: Optional[str] = "borrador"


class EstadoUpdate(BaseModel):
    estado: str


# ── Helper Functions ──

def get_config_value(conn, clave, default=None):
    """Get a configuration value from the database."""
    row = conn.execute("SELECT valor, tipo FROM configuracion WHERE clave = ?", (clave,)).fetchone()
    if not row:
        return default
    val, tipo = row["valor"], row["tipo"]
    if tipo == "number":
        try:
            return float(val)
        except (ValueError, TypeError):
            return default
    return val


def generate_codigo(conn):
    """Generate next unique proposal code."""
    row = conn.execute("SELECT MAX(id) as max_id FROM cotizaciones").fetchone()
    next_id = (row["max_id"] or 0) + 1
    return f"PROP-{next_id:04d}"


# ── Dimensioning Endpoint ──

@router.post("/cotizaciones/dimensionar")
def dimensionar_sistema(data: DimensionarRequest):
    """
    Calculate system dimensioning based on energy profile.
    Returns: kWp, number of panels, suggested inverter, production estimates.
    """
    conn = get_db()

    # Get panel details
    panel = conn.execute("SELECT * FROM equipos WHERE id = ? AND categoria = 'panel'", (data.panel_id,)).fetchone()
    if not panel:
        conn.close()
        raise HTTPException(status_code=404, detail="Panel no encontrado")
    panel = dict_from_row(panel)

    # Get system efficiency from config if not provided
    eficiencia = data.eficiencia
    if eficiencia == 0.82:
        config_ef = get_config_value(conn, "eficiencia_sistema", 0.82)
        eficiencia = config_ef

    # ── Core Calculations ──
    consumo_diario = (data.consumo_mensual_kwh / 30) + data.cargas_especiales_kwh_dia
    potencia_kwp = consumo_diario / (data.hsp * eficiencia)
    num_paneles = math.ceil(potencia_kwp * 1000 / panel["potencia_wp"])
    potencia_real_kwp = round((num_paneles * panel["potencia_wp"]) / 1000, 2)

    # Production estimates
    produccion_diaria = round(num_paneles * panel["potencia_wp"] * data.hsp * eficiencia / 1000, 2)
    produccion_mensual = round(produccion_diaria * 30, 2)

    # Area and weight
    area_requerida = round(num_paneles * (panel["area_m2"] or 2.5), 1)
    peso_total = round(num_paneles * (panel["peso_kg"] or 30), 1)

    # ── Suggest Inverter ──
    inversor_sugerido = None
    if data.inversor_id:
        inv = conn.execute("SELECT * FROM equipos WHERE id = ? AND categoria = 'inversor'", (data.inversor_id,)).fetchone()
        if inv:
            inversor_sugerido = dict_from_row(inv)

    if not inversor_sugerido:
        # Find best matching inverter
        inversores = conn.execute("""
            SELECT * FROM equipos WHERE categoria = 'inversor' AND activo = 1
            AND potencia_kw >= ? ORDER BY potencia_kw ASC LIMIT 1
        """, (potencia_real_kwp,)).fetchone()
        if inversores:
            inversor_sugerido = dict_from_row(inversores)

    conn.close()

    return {
        "consumo_diario_kwh": round(consumo_diario, 2),
        "potencia_kwp": potencia_real_kwp,
        "potencia_kwp_teorica": round(potencia_kwp, 2),
        "num_paneles": num_paneles,
        "panel": panel,
        "inversor_sugerido": inversor_sugerido,
        "produccion_diaria_kwh": produccion_diaria,
        "produccion_mensual_kwh": produccion_mensual,
        "produccion_anual_kwh": round(produccion_mensual * 12, 2),
        "area_requerida_m2": area_requerida,
        "peso_total_kg": peso_total,
        "eficiencia_usada": eficiencia,
        "hsp": data.hsp,
        "consumo_mensual_kwh": data.consumo_mensual_kwh,
        "cobertura_pct": round((produccion_mensual / data.consumo_mensual_kwh * 100) if data.consumo_mensual_kwh > 0 else 0, 1)
    }


# ── Financial Analysis Endpoint ──

@router.post("/cotizaciones/calcular-financiero")
def calcular_financiero(data: CalcularFinancieroRequest):
    """
    Calculate full financial analysis with ROI and 25-year projection.
    Returns: savings, ROI with/without incentives, 25-year cash flow table.
    """
    produccion_anual = data.produccion_mensual_kwh * 12

    # ── Scenario 1: Without Tax Incentives ──
    ahorro_mensual = data.produccion_mensual_kwh * data.costo_kwh
    ahorro_anual = ahorro_mensual * 12

    if data.pct_autoconsumo < 100:
        pct_auto = data.pct_autoconsumo / 100
        ahorro_mensual_auto = data.produccion_mensual_kwh * pct_auto * data.costo_kwh
        ahorro_mensual_excedente = data.produccion_mensual_kwh * (1 - pct_auto) * data.precio_excedente_kwh
        ahorro_mensual = ahorro_mensual_auto + ahorro_mensual_excedente
        ahorro_anual = ahorro_mensual * 12

    roi_sin_incentivos_meses = round(data.total_inversion / ahorro_mensual, 1) if ahorro_mensual > 0 else 999
    roi_sin_incentivos_anos = round(roi_sin_incentivos_meses / 12, 1)

    # ── Scenario 2: With Tax Incentives (Law 1715) ──
    deduccion_renta = data.total_inversion * (data.deduccion_renta_pct / 100)
    beneficio_fiscal = deduccion_renta * (data.tasa_impositiva / 100)
    inversion_neta = data.total_inversion - beneficio_fiscal

    roi_con_incentivos_meses = round(inversion_neta / ahorro_mensual, 1) if ahorro_mensual > 0 else 999
    roi_con_incentivos_anos = round(roi_con_incentivos_meses / 12, 1)

    # ── 25-Year Projection Table ──
    proyeccion = []
    saldo_inversion_s1 = data.total_inversion
    saldo_inversion_s2 = inversion_neta
    ahorro_acumulado_s1 = 0
    ahorro_acumulado_s2 = beneficio_fiscal
    costo_total_aom = 0
    valor_total_energia = 0
    degradacion = data.degradacion_anual_pct / 100
    inflacion = data.inflacion_tarifa_pct / 100
    aom_inc = data.aom_incremento_pct / 100
    pct_auto = data.pct_autoconsumo / 100

    for anio in range(1, 26):
        # Energy with degradation
        energia_anual = produccion_anual * ((1 - degradacion) ** (anio - 1))
        energia_anual = round(energia_anual, 1)

        # Price with inflation
        precio_kwh_anio = data.costo_kwh * ((1 + inflacion) ** (anio - 1))
        precio_kwh_anio = round(precio_kwh_anio, 2)

        # AOM with yearly increase
        aom_anio = data.aom_anual * ((1 + aom_inc) ** (anio - 1)) if data.aom_anual > 0 else 0
        aom_anio = round(aom_anio, 0)

        # Energy value (considering self-consumption vs surplus)
        valor_autoconsumo = energia_anual * pct_auto * precio_kwh_anio
        valor_excedente = energia_anual * (1 - pct_auto) * data.precio_excedente_kwh * ((1 + inflacion) ** (anio - 1)) if pct_auto < 1 else 0
        valor_energia = round(valor_autoconsumo + valor_excedente, 0)

        # Net cash flow
        flujo_neto = valor_energia - aom_anio

        # Running totals
        saldo_inversion_s1 -= flujo_neto
        saldo_inversion_s2 -= flujo_neto
        ahorro_acumulado_s1 += flujo_neto
        ahorro_acumulado_s2 += flujo_neto
        costo_total_aom += aom_anio
        valor_total_energia += valor_energia

        proyeccion.append({
            "anio": anio,
            "energia_kwh": energia_anual,
            "precio_kwh": precio_kwh_anio,
            "aom": aom_anio,
            "valor_energia": valor_energia,
            "flujo_neto": round(flujo_neto, 0),
            "saldo_inversion_s1": round(saldo_inversion_s1, 0),
            "saldo_inversion_s2": round(saldo_inversion_s2, 0),
            "ahorro_acumulado_s1": round(ahorro_acumulado_s1, 0),
            "ahorro_acumulado_s2": round(ahorro_acumulado_s2, 0)
        })

    # ── Financial Summary ──
    ahorro_neto_25 = valor_total_energia - data.total_inversion - costo_total_aom

    return {
        "escenario_1": {
            "titulo": "Sin Incentivos Tributarios",
            "ahorro_mensual": round(ahorro_mensual, 0),
            "ahorro_anual": round(ahorro_anual, 0),
            "roi_meses": roi_sin_incentivos_meses,
            "roi_anos": roi_sin_incentivos_anos
        },
        "escenario_2": {
            "titulo": "Con Incentivos Tributarios (Ley 1715)",
            "deduccion_renta": round(deduccion_renta, 0),
            "beneficio_fiscal": round(beneficio_fiscal, 0),
            "inversion_neta": round(inversion_neta, 0),
            "ahorro_mensual": round(ahorro_mensual, 0),
            "ahorro_anual": round(ahorro_anual, 0),
            "roi_meses": roi_con_incentivos_meses,
            "roi_anos": roi_con_incentivos_anos
        },
        "resumen_25_anos": {
            "inversion_inicial": round(data.total_inversion, 0),
            "costo_total_aom": round(costo_total_aom, 0),
            "valor_total_energia": round(valor_total_energia, 0),
            "ahorro_neto_25": round(ahorro_neto_25, 0),
            "roi_total_pct": round((valor_total_energia / data.total_inversion * 100 - 100) if data.total_inversion > 0 else 0, 1)
        },
        "proyeccion": proyeccion
    }


# ── CRUD Cotizaciones ──

@router.get("/cotizaciones")
def listar_cotizaciones(
    buscar: Optional[str] = Query(None),
    estado: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100)
):
    conn = get_db()
    offset = (page - 1) * limit
    query = """
        SELECT c.*, cl.nombre as cliente_nombre, cl.ciudad as cliente_ciudad
        FROM cotizaciones c
        LEFT JOIN clientes cl ON c.cliente_id = cl.id
        WHERE 1=1
    """
    params = []

    if buscar:
        query += " AND (cl.nombre LIKE ? OR c.codigo LIKE ?)"
        search = f"%{buscar}%"
        params.extend([search, search])
    if estado:
        query += " AND c.estado = ?"
        params.append(estado)

    count_query = query.replace("SELECT c.*, cl.nombre as cliente_nombre, cl.ciudad as cliente_ciudad", "SELECT COUNT(*)")
    total = conn.execute(count_query, params).fetchone()[0]

    query += " ORDER BY c.fecha DESC LIMIT ? OFFSET ?"
    params.extend([limit, offset])
    rows = conn.execute(query, params).fetchall()
    conn.close()

    return {"data": dicts_from_rows(rows), "total": total, "page": page, "limit": limit}


@router.get("/cotizaciones/{cotizacion_id}")
def obtener_cotizacion(cotizacion_id: int):
    conn = get_db()
    row = conn.execute("""
        SELECT c.*, cl.nombre as cliente_nombre, cl.cedula_nit as cliente_cedula,
        cl.direccion as cliente_direccion, cl.telefono as cliente_telefono,
        cl.correo as cliente_correo, cl.ciudad as cliente_ciudad,
        cl.operador_red as cliente_operador, cl.tipo_tarifa as cliente_tarifa,
        cl.consumo_mensual_kwh as cliente_consumo, cl.costo_kwh as cliente_costo_kwh,
        cl.hsp as cliente_hsp, cl.historial_consumo as cliente_historial
        FROM cotizaciones c
        LEFT JOIN clientes cl ON c.cliente_id = cl.id
        WHERE c.id = ?
    """, (cotizacion_id,)).fetchone()

    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Cotización no encontrada")

    cot = dict_from_row(row)

    if cot.get("cliente_historial"):
        try:
            cot["cliente_historial"] = json.loads(cot["cliente_historial"])
        except (json.JSONDecodeError, TypeError):
            cot["cliente_historial"] = []

    # Load panel info
    if cot.get("panel_id"):
        panel = conn.execute("SELECT * FROM equipos WHERE id = ?", (cot["panel_id"],)).fetchone()
        cot["panel"] = dict_from_row(panel) if panel else None

    # Load inversor info
    if cot.get("inversor_id"):
        inversor = conn.execute("SELECT * FROM equipos WHERE id = ?", (cot["inversor_id"],)).fetchone()
        cot["inversor"] = dict_from_row(inversor) if inversor else None

    # Load battery info
    if cot.get("bateria_id"):
        bateria = conn.execute("SELECT * FROM equipos WHERE id = ?", (cot["bateria_id"],)).fetchone()
        cot["bateria"] = dict_from_row(bateria) if bateria else None

    # Parse JSON fields
    for field in ["items_json", "proyeccion_25_json", "cronograma_json"]:
        if cot.get(field):
            try:
                cot[field] = json.loads(cot[field])
            except (json.JSONDecodeError, TypeError):
                cot[field] = []

    # Load config for company info (including design images)
    config_rows = conn.execute("SELECT clave, valor FROM configuracion WHERE clave LIKE 'empresa_%' OR clave LIKE 'diseno_%'").fetchall()
    cot["empresa"] = {row["clave"]: row["valor"] for row in config_rows}

    # Load config for advisor info
    asesor_rows = conn.execute("SELECT clave, valor FROM configuracion WHERE clave LIKE 'asesor_%' OR clave = 'firma_asesor'").fetchall()
    cot["asesor"] = {row["clave"]: row["valor"] for row in asesor_rows}

    conn.close()
    return cot


@router.post("/cotizaciones")
def crear_cotizacion(data: CotizacionCreate):
    conn = get_db()

    # Verify client exists
    cliente = conn.execute("SELECT id FROM clientes WHERE id = ?", (data.cliente_id,)).fetchone()
    if not cliente:
        conn.close()
        raise HTTPException(status_code=404, detail="Cliente no encontrado")

    codigo = generate_codigo(conn)

    # Build default cronograma
    cronograma = data.cronograma_json
    if cronograma == "[]":
        pago_anticipo = get_config_value(conn, "pago_anticipo_pct", 60)
        pago_entrega = get_config_value(conn, "pago_contraentrega_pct", 40)
        cronograma = json.dumps([
            {"semana": 1, "actividad": "Firma de contrato y anticipo", "hito_pago": f"{int(pago_anticipo)}% anticipo", "completado": False},
            {"semana": 1, "actividad": "Compra de equipos y materiales", "hito_pago": "", "completado": False},
            {"semana": 2, "actividad": "Diseño eléctrico y memorias de cálculo", "hito_pago": "", "completado": False},
            {"semana": 2, "actividad": "Trámites ante operador de red", "hito_pago": "", "completado": False},
            {"semana": 3, "actividad": "Instalación de estructura y paneles", "hito_pago": "", "completado": False},
            {"semana": 3, "actividad": "Instalación eléctrica e inversor", "hito_pago": "", "completado": False},
            {"semana": 4, "actividad": "Pruebas, puesta en marcha y certificación", "hito_pago": "", "completado": False},
            {"semana": 4, "actividad": "Entrega y capacitación", "hito_pago": f"{int(pago_entrega)}% contra entrega", "completado": False}
        ])

    cursor = conn.execute("""
        INSERT INTO cotizaciones (codigo, cliente_id, potencia_kwp, num_paneles, panel_id,
            inversor_id, bateria_id, num_baterias, produccion_diaria_kwh, produccion_mensual_kwh,
            area_requerida_m2, peso_total_kg, items_json, subtotal, margen_comercial_pct,
            total_inversion, ahorro_mensual, ahorro_anual, roi_sin_incentivos_meses,
            roi_con_incentivos_meses, deduccion_renta_pct, degradacion_anual_pct,
            inflacion_tarifa_pct, aom_anual, aom_incremento_pct, pct_autoconsumo,
            precio_excedente_kwh, proyeccion_25_json, cronograma_json, notas)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (codigo, data.cliente_id, data.potencia_kwp, data.num_paneles, data.panel_id,
          data.inversor_id, data.bateria_id, data.num_baterias, data.produccion_diaria_kwh,
          data.produccion_mensual_kwh, data.area_requerida_m2, data.peso_total_kg,
          data.items_json, data.subtotal, data.margen_comercial_pct, data.total_inversion,
          data.ahorro_mensual, data.ahorro_anual, data.roi_sin_incentivos_meses,
          data.roi_con_incentivos_meses, data.deduccion_renta_pct, data.degradacion_anual_pct,
          data.inflacion_tarifa_pct, data.aom_anual, data.aom_incremento_pct,
          data.pct_autoconsumo, data.precio_excedente_kwh, data.proyeccion_25_json,
          cronograma, data.notas))

    conn.commit()
    cotizacion_id = cursor.lastrowid
    conn.close()
    return {"id": cotizacion_id, "codigo": codigo, "message": "Cotización creada exitosamente"}


@router.put("/cotizaciones/{cotizacion_id}")
def actualizar_cotizacion(cotizacion_id: int, data: CotizacionUpdate):
    conn = get_db()
    row = conn.execute("SELECT id FROM cotizaciones WHERE id = ?", (cotizacion_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Cotización no encontrada")

    # Build default cronograma if empty
    cronograma = data.cronograma_json
    if cronograma == "[]":
        pago_anticipo = get_config_value(conn, "pago_anticipo_pct", 60)
        pago_entrega = get_config_value(conn, "pago_contraentrega_pct", 40)
        cronograma = json.dumps([
            {"semana": 1, "actividad": "Firma de contrato y anticipo", "hito_pago": f"{int(pago_anticipo)}% anticipo", "completado": False},
            {"semana": 1, "actividad": "Compra de equipos y materiales", "hito_pago": "", "completado": False},
            {"semana": 2, "actividad": "Diseño eléctrico y memorias de cálculo", "hito_pago": "", "completado": False},
            {"semana": 2, "actividad": "Trámites ante operador de red", "hito_pago": "", "completado": False},
            {"semana": 3, "actividad": "Instalación de estructura y paneles", "hito_pago": "", "completado": False},
            {"semana": 3, "actividad": "Instalación eléctrica e inversor", "hito_pago": "", "completado": False},
            {"semana": 4, "actividad": "Pruebas, puesta en marcha y certificación", "hito_pago": "", "completado": False},
            {"semana": 4, "actividad": "Entrega y capacitación", "hito_pago": f"{int(pago_entrega)}% contra entrega", "completado": False}
        ])

    conn.execute("""
        UPDATE cotizaciones SET cliente_id=?, estado=?, potencia_kwp=?, num_paneles=?,
        panel_id=?, inversor_id=?, bateria_id=?, num_baterias=?, produccion_diaria_kwh=?,
        produccion_mensual_kwh=?, area_requerida_m2=?, peso_total_kg=?, items_json=?,
        subtotal=?, margen_comercial_pct=?, total_inversion=?, ahorro_mensual=?,
        ahorro_anual=?, roi_sin_incentivos_meses=?, roi_con_incentivos_meses=?,
        deduccion_renta_pct=?, degradacion_anual_pct=?, inflacion_tarifa_pct=?,
        aom_anual=?, aom_incremento_pct=?, pct_autoconsumo=?, precio_excedente_kwh=?,
        proyeccion_25_json=?, cronograma_json=?, notas=?, updated_at=CURRENT_TIMESTAMP
        WHERE id=?
    """, (data.cliente_id, data.estado, data.potencia_kwp, data.num_paneles, data.panel_id,
          data.inversor_id, data.bateria_id, data.num_baterias, data.produccion_diaria_kwh,
          data.produccion_mensual_kwh, data.area_requerida_m2, data.peso_total_kg,
          data.items_json, data.subtotal, data.margen_comercial_pct, data.total_inversion,
          data.ahorro_mensual, data.ahorro_anual, data.roi_sin_incentivos_meses,
          data.roi_con_incentivos_meses, data.deduccion_renta_pct, data.degradacion_anual_pct,
          data.inflacion_tarifa_pct, data.aom_anual, data.aom_incremento_pct,
          data.pct_autoconsumo, data.precio_excedente_kwh, data.proyeccion_25_json,
          data.cronograma_json, data.notas, cotizacion_id))

    conn.commit()
    conn.close()
    return {"message": "Cotización actualizada exitosamente"}


@router.put("/cotizaciones/{cotizacion_id}/estado")
def cambiar_estado(cotizacion_id: int, data: EstadoUpdate):
    conn = get_db()
    row = conn.execute("SELECT id FROM cotizaciones WHERE id = ?", (cotizacion_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Cotización no encontrada")

    valid_states = ["borrador", "enviada", "firmada", "rechazada"]
    if data.estado not in valid_states:
        conn.close()
        raise HTTPException(status_code=400, detail=f"Estado inválido. Opciones: {valid_states}")

    conn.execute(
        "UPDATE cotizaciones SET estado=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
        (data.estado, cotizacion_id)
    )
    conn.commit()
    conn.close()
    return {"message": f"Estado actualizado a '{data.estado}'"}


@router.delete("/cotizaciones/{cotizacion_id}")
def eliminar_cotizacion(cotizacion_id: int):
    conn = get_db()
    row = conn.execute("SELECT id FROM cotizaciones WHERE id = ?", (cotizacion_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Cotización no encontrada")

    conn.execute("DELETE FROM cotizaciones WHERE id = ?", (cotizacion_id,))
    conn.commit()
    conn.close()
    return {"message": "Cotización eliminada exitosamente"}
