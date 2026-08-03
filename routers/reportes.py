"""
SunQuote - Reportes API Router
Dashboard statistics and PDF data generation.
"""
from fastapi import APIRouter
from database import get_db

router = APIRouter()


@router.get("/dashboard/stats")
def dashboard_stats():
    """Get dashboard statistics."""
    conn = get_db()

    # Active quotes
    total_cotizaciones = conn.execute("SELECT COUNT(*) FROM cotizaciones").fetchone()[0]
    borradores = conn.execute("SELECT COUNT(*) FROM cotizaciones WHERE estado = 'borrador'").fetchone()[0]
    enviadas = conn.execute("SELECT COUNT(*) FROM cotizaciones WHERE estado = 'enviada'").fetchone()[0]
    firmadas = conn.execute("SELECT COUNT(*) FROM cotizaciones WHERE estado = 'firmada'").fetchone()[0]

    # Total revenue (from signed quotes)
    revenue_row = conn.execute("SELECT COALESCE(SUM(total_inversion), 0) FROM cotizaciones WHERE estado = 'firmada'").fetchone()
    total_revenue = revenue_row[0]

    # Total energy saved (sum of annual production from signed quotes)
    energy_row = conn.execute("SELECT COALESCE(SUM(produccion_mensual_kwh * 12), 0) FROM cotizaciones WHERE estado = 'firmada'").fetchone()
    total_energy_kwh = energy_row[0]

    # Conversion rate
    conversion = round((firmadas / total_cotizaciones * 100) if total_cotizaciones > 0 else 0, 1)

    # Total clients
    total_clientes = conn.execute("SELECT COUNT(*) FROM clientes").fetchone()[0]

    # Recent quotes
    recent = conn.execute("""
        SELECT c.id, c.codigo, c.estado, c.total_inversion, c.potencia_kwp, c.fecha,
               cl.nombre as cliente_nombre, cl.tipo_tarifa
        FROM cotizaciones c
        LEFT JOIN clientes cl ON c.cliente_id = cl.id
        ORDER BY c.fecha DESC LIMIT 5
    """).fetchall()

    recent_list = []
    for r in recent:
        recent_list.append({
            "id": r["id"],
            "codigo": r["codigo"],
            "estado": r["estado"],
            "total_inversion": r["total_inversion"],
            "potencia_kwp": r["potencia_kwp"],
            "fecha": r["fecha"],
            "cliente_nombre": r["cliente_nombre"],
            "tipo_tarifa": r["tipo_tarifa"]
        })

    conn.close()

    return {
        "total_cotizaciones": total_cotizaciones,
        "borradores": borradores,
        "enviadas": enviadas,
        "firmadas": firmadas,
        "total_revenue": total_revenue,
        "total_energy_kwh": total_energy_kwh,
        "conversion_rate": conversion,
        "total_clientes": total_clientes,
        "recent_cotizaciones": recent_list
    }
