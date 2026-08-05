"""
SunQuote - Configuración API Router
Global system configuration management.
"""
import os
import shutil
from fastapi import APIRouter, UploadFile, File, Form
from pydantic import BaseModel
from typing import Dict
from database import get_db, dicts_from_rows

router = APIRouter()


class ConfigUpdate(BaseModel):
    configuracion: Dict[str, str]


@router.get("/configuracion")
def obtener_configuracion():
    conn = get_db()
    rows = conn.execute("SELECT * FROM configuracion ORDER BY clave").fetchall()
    conn.close()
    config = dicts_from_rows(rows)
    result = {}
    for item in config:
        result[item["clave"]] = {
            "valor": item["valor"],
            "tipo": item["tipo"],
            "descripcion": item["descripcion"]
        }
    return result


@router.put("/configuracion")
def actualizar_configuracion(data: ConfigUpdate):
    conn = get_db()
    for clave, valor in data.configuracion.items():
        conn.execute(
            "INSERT INTO configuracion (clave, valor) VALUES (?, ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor",
            (clave, str(valor))
        )
    conn.commit()
    conn.close()
    return {"message": "Configuración actualizada exitosamente"}


@router.post("/configuracion/upload")
def upload_archivo(file: UploadFile = File(...), prefix: str = Form("file")):
    uploads_dir = os.path.join("static", "uploads")
    os.makedirs(uploads_dir, exist_ok=True)
    file_name = f"{prefix}_{file.filename}"
    file_path = os.path.join(uploads_dir, file_name)
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    return {"url": f"/static/uploads/{file_name}"}
