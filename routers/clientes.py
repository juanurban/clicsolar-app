"""
SunQuote - Clientes API Router
CRUD operations for clients and energy profiles.
"""
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Optional, List
import json
from database import get_db, dict_from_row, dicts_from_rows

router = APIRouter()


class ClienteCreate(BaseModel):
    nombre: str
    cedula_nit: Optional[str] = ""
    direccion: Optional[str] = ""
    telefono: Optional[str] = ""
    correo: Optional[str] = ""
    ciudad: Optional[str] = ""
    operador_red: Optional[str] = ""
    tipo_tarifa: Optional[str] = "Residencial"
    consumo_mensual_kwh: Optional[float] = 0
    costo_kwh: Optional[float] = 0
    hsp: Optional[float] = 4.2
    cargas_especiales_kwh_dia: Optional[float] = 0
    historial_consumo: Optional[List[float]] = []


class ClienteUpdate(ClienteCreate):
    pass


@router.get("/clientes")
def listar_clientes(
    buscar: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100)
):
    conn = get_db()
    offset = (page - 1) * limit

    if buscar:
        query = """
            SELECT * FROM clientes
            WHERE nombre LIKE ? OR cedula_nit LIKE ? OR ciudad LIKE ? OR correo LIKE ?
            ORDER BY updated_at DESC LIMIT ? OFFSET ?
        """
        search = f"%{buscar}%"
        rows = conn.execute(query, (search, search, search, search, limit, offset)).fetchall()
        count_query = """
            SELECT COUNT(*) FROM clientes
            WHERE nombre LIKE ? OR cedula_nit LIKE ? OR ciudad LIKE ? OR correo LIKE ?
        """
        total = conn.execute(count_query, (search, search, search, search)).fetchone()[0]
    else:
        rows = conn.execute(
            "SELECT * FROM clientes ORDER BY updated_at DESC LIMIT ? OFFSET ?",
            (limit, offset)
        ).fetchall()
        total = conn.execute("SELECT COUNT(*) FROM clientes").fetchone()[0]

    conn.close()
    clientes = dicts_from_rows(rows)
    for c in clientes:
        if c.get("historial_consumo"):
            try:
                c["historial_consumo"] = json.loads(c["historial_consumo"])
            except (json.JSONDecodeError, TypeError):
                c["historial_consumo"] = []

    return {"data": clientes, "total": total, "page": page, "limit": limit}


@router.get("/clientes/{cliente_id}")
def obtener_cliente(cliente_id: int):
    conn = get_db()
    row = conn.execute("SELECT * FROM clientes WHERE id = ?", (cliente_id,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    cliente = dict_from_row(row)
    if cliente.get("historial_consumo"):
        h = cliente["historial_consumo"]
        while isinstance(h, str):
            try:
                p = json.loads(h)
                if p == h: break
                h = p
            except Exception:
                break
        cliente["historial_consumo"] = h if isinstance(h, list) else []
    return cliente


@router.post("/clientes")
def crear_cliente(data: ClienteCreate):
    conn = get_db()
    historial_json = json.dumps(data.historial_consumo or [])

    # If historial provided, calculate average
    consumo = data.consumo_mensual_kwh
    if data.historial_consumo and len(data.historial_consumo) > 0 and consumo == 0:
        consumo = sum(data.historial_consumo) / len(data.historial_consumo)

    cursor = conn.execute("""
        INSERT INTO clientes (nombre, cedula_nit, direccion, telefono, correo, ciudad,
                              operador_red, tipo_tarifa, consumo_mensual_kwh, costo_kwh,
                              hsp, cargas_especiales_kwh_dia, historial_consumo)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (data.nombre, data.cedula_nit, data.direccion, data.telefono, data.correo,
          data.ciudad, data.operador_red, data.tipo_tarifa, consumo, data.costo_kwh,
          data.hsp, data.cargas_especiales_kwh_dia, historial_json))
    conn.commit()
    cliente_id = cursor.lastrowid
    conn.close()
    return {"id": cliente_id, "message": "Cliente creado exitosamente"}


@router.put("/clientes/{cliente_id}")
def actualizar_cliente(cliente_id: int, data: ClienteUpdate):
    conn = get_db()
    row = conn.execute("SELECT id FROM clientes WHERE id = ?", (cliente_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Cliente no encontrado")

    historial_json = json.dumps(data.historial_consumo or [])
    consumo = data.consumo_mensual_kwh
    if data.historial_consumo and len(data.historial_consumo) > 0 and consumo == 0:
        consumo = sum(data.historial_consumo) / len(data.historial_consumo)

    conn.execute("""
        UPDATE clientes SET nombre=?, cedula_nit=?, direccion=?, telefono=?, correo=?,
        ciudad=?, operador_red=?, tipo_tarifa=?, consumo_mensual_kwh=?, costo_kwh=?,
        hsp=?, cargas_especiales_kwh_dia=?, historial_consumo=?,
        updated_at=CURRENT_TIMESTAMP
        WHERE id=?
    """, (data.nombre, data.cedula_nit, data.direccion, data.telefono, data.correo,
          data.ciudad, data.operador_red, data.tipo_tarifa, consumo, data.costo_kwh,
          data.hsp, data.cargas_especiales_kwh_dia, historial_json, cliente_id))
    conn.commit()
    conn.close()
    return {"message": "Cliente actualizado exitosamente"}


@router.delete("/clientes/{cliente_id}")
def eliminar_cliente(cliente_id: int):
    conn = get_db()
    try:
        row = conn.execute("SELECT id FROM clientes WHERE id = ?", (cliente_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Cliente no encontrado")

        conn.execute("DELETE FROM cotizaciones WHERE cliente_id = ?", (cliente_id,))
        conn.execute("DELETE FROM clientes WHERE id = ?", (cliente_id,))
        conn.commit()
        return {"message": "Cliente eliminado exitosamente"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"No se pudo eliminar el cliente: {str(e)}")
    finally:
        conn.close()
