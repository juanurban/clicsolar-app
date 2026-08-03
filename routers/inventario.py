"""
SunQuote - Inventario API Router
CRUD operations for equipment and services inventory.
"""
from fastapi import APIRouter, HTTPException, Query, UploadFile, File
import os
import shutil
from pydantic import BaseModel
from typing import Optional, List
from database import get_db, dict_from_row, dicts_from_rows

router = APIRouter()


class EquipoCreate(BaseModel):
    categoria: str
    marca: Optional[str] = ""
    modelo: Optional[str] = ""
    descripcion: Optional[str] = ""
    potencia_wp: Optional[float] = 0
    potencia_kw: Optional[float] = 0
    capacidad_kwh: Optional[float] = 0
    tipo: Optional[str] = ""
    costo: Optional[float] = 0
    precio_venta: Optional[float] = 0
    utilidad_pct: Optional[float] = 0
    unidad: Optional[str] = "und"
    peso_kg: Optional[float] = 0
    area_m2: Optional[float] = 0
    activo: Optional[int] = 1
    imagen_url: Optional[str] = ""
    iva: Optional[bool] = True


class EquipoUpdate(EquipoCreate):
    pass


@router.get("/equipos")
def listar_equipos(
    categoria: Optional[str] = Query(None),
    buscar: Optional[str] = Query(None),
    activo: Optional[int] = Query(None)
):
    conn = get_db()
    query = "SELECT * FROM equipos WHERE 1=1"
    params = []

    if categoria:
        query += " AND categoria = ?"
        params.append(categoria)
    if buscar:
        query += " AND (marca LIKE ? OR modelo LIKE ? OR descripcion LIKE ?)"
        search = f"%{buscar}%"
        params.extend([search, search, search])
    if activo is not None:
        query += " AND activo = ?"
        params.append(activo)

    query += " ORDER BY categoria, marca, modelo"
    rows = conn.execute(query, params).fetchall()
    conn.close()
    return {"data": dicts_from_rows(rows)}


@router.get("/equipos/{equipo_id}")
def obtener_equipo(equipo_id: int):
    conn = get_db()
    row = conn.execute("SELECT * FROM equipos WHERE id = ?", (equipo_id,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Equipo no encontrado")
    return dict_from_row(row)


@router.post("/equipos")
def crear_equipo(data: EquipoCreate):
    conn = get_db()
    cursor = conn.execute("""
        INSERT INTO equipos (categoria, marca, modelo, descripcion, potencia_wp, potencia_kw,
                             capacidad_kwh, tipo, costo, precio_venta, utilidad_pct, unidad, peso_kg, area_m2, activo, imagen_url, iva)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (data.categoria, data.marca, data.modelo, data.descripcion, data.potencia_wp,
          data.potencia_kw, data.capacidad_kwh, data.tipo, data.costo, data.precio_venta, data.utilidad_pct, data.unidad, data.peso_kg,
          data.area_m2, data.activo, data.imagen_url, data.iva))
    conn.commit()
    equipo_id = cursor.lastrowid
    conn.close()
    return {"id": equipo_id, "message": "Equipo creado exitosamente"}


@router.put("/equipos/{equipo_id}")
def actualizar_equipo(equipo_id: int, data: EquipoUpdate):
    conn = get_db()
    row = conn.execute("SELECT id FROM equipos WHERE id = ?", (equipo_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Equipo no encontrado")

    conn.execute("""
        UPDATE equipos SET categoria=?, marca=?, modelo=?, descripcion=?, potencia_wp=?,
        potencia_kw=?, capacidad_kwh=?, tipo=?, costo=?, precio_venta=?, utilidad_pct=?, unidad=?,
        peso_kg=?, area_m2=?, activo=?, imagen_url=?, iva=?
        WHERE id=?
    """, (data.categoria, data.marca, data.modelo, data.descripcion, data.potencia_wp,
          data.potencia_kw, data.capacidad_kwh, data.tipo, data.costo, data.precio_venta, data.utilidad_pct,
          data.unidad, data.peso_kg, data.area_m2, data.activo, data.imagen_url, data.iva, equipo_id))
    conn.commit()
    conn.close()
    return {"message": "Equipo actualizado exitosamente"}


@router.delete("/equipos/{equipo_id}")
def eliminar_equipo(equipo_id: int):
    conn = get_db()
    row = conn.execute("SELECT id FROM equipos WHERE id = ?", (equipo_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Equipo no encontrado")

    conn.execute("DELETE FROM equipos WHERE id = ?", (equipo_id,))
    conn.commit()
    conn.close()
    return {"message": "Equipo eliminado exitosamente"}


@router.post("/equipos/upload-imagen")
def upload_imagen(file: UploadFile = File(...)):
    uploads_dir = os.path.join("static", "uploads")
    os.makedirs(uploads_dir, exist_ok=True)
    
    file_name = f"{file.filename}"
    file_path = os.path.join(uploads_dir, file_name)
    
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    return {"url": f"/static/uploads/{file_name}"}


class BulkDeleteRequest(BaseModel):
    ids: List[int]

@router.post("/equipos/bulk-delete")
def bulk_delete_equipos(data: BulkDeleteRequest):
    conn = get_db()
    
    if not data.ids:
        conn.close()
        raise HTTPException(status_code=400, detail="No se proporcionaron IDs")
        
    placeholders = ",".join("?" for _ in data.ids)
    conn.execute(f"DELETE FROM equipos WHERE id IN ({placeholders})", tuple(data.ids))
    conn.commit()
    conn.close()
    return {"message": f"{len(data.ids)} ítems eliminados exitosamente"}
