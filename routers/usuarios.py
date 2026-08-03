"""
SunQuote - Usuarios & Perfiles API Router
Authentication, user management, and granular permission profiles.
"""
import json
import secrets
from datetime import datetime, timedelta
from fastapi import APIRouter, Request, HTTPException, Response
from pydantic import BaseModel
from typing import Optional, List
from database import get_db, dicts_from_rows, dict_from_row, hash_password, ALL_PERMISSIONS

router = APIRouter()

SESSION_DURATION_HOURS = 24


# ══════════════════════════════════════════
#  PYDANTIC MODELS
# ══════════════════════════════════════════

class LoginRequest(BaseModel):
    username: str
    password: str


class UsuarioCreate(BaseModel):
    username: str
    password: str
    nombre_completo: str
    correo: Optional[str] = ""
    perfil_id: int
    activo: Optional[int] = 1


class UsuarioUpdate(BaseModel):
    nombre_completo: Optional[str] = None
    correo: Optional[str] = None
    perfil_id: Optional[int] = None
    activo: Optional[int] = None


class PasswordChange(BaseModel):
    password: str


class PerfilCreate(BaseModel):
    nombre: str
    descripcion: Optional[str] = ""
    permisos: List[str] = []


class PerfilUpdate(BaseModel):
    nombre: Optional[str] = None
    descripcion: Optional[str] = None
    permisos: Optional[List[str]] = None


# ══════════════════════════════════════════
#  AUTH HELPERS
# ══════════════════════════════════════════

def get_current_user(request: Request):
    """Extract and validate session from cookie. Returns user dict or None."""
    token = request.cookies.get("sq_session")
    if not token:
        return None

    conn = get_db()
    session = conn.execute(
        "SELECT * FROM sesiones WHERE token = ? AND expires_at > datetime('now')",
        (token,)
    ).fetchone()

    if not session:
        conn.close()
        return None

    user = conn.execute("""
        SELECT u.id, u.username, u.nombre_completo, u.correo, u.perfil_id, u.activo,
               p.nombre as perfil_nombre, p.permisos
        FROM usuarios u
        JOIN perfiles p ON u.perfil_id = p.id
        WHERE u.id = ? AND u.activo = 1
    """, (session["usuario_id"],)).fetchone()

    conn.close()

    if not user:
        return None

    user_dict = dict_from_row(user)
    user_dict["permisos"] = json.loads(user_dict["permisos"])
    return user_dict


def require_auth(request: Request):
    """Require authentication. Raises 401 if not authenticated."""
    user = get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="No autenticado")
    return user


def require_permission(request: Request, permission: str):
    """Require a specific permission. Raises 403 if missing."""
    user = require_auth(request)
    if permission not in user["permisos"]:
        raise HTTPException(status_code=403, detail=f"Sin permiso: {permission}")
    return user


# ══════════════════════════════════════════
#  AUTH ENDPOINTS
# ══════════════════════════════════════════

@router.post("/auth/login")
def login(data: LoginRequest, response: Response):
    conn = get_db()
    user = conn.execute(
        "SELECT * FROM usuarios WHERE username = ?",
        (data.username,)
    ).fetchone()

    if not user:
        conn.close()
        raise HTTPException(status_code=401, detail="Usuario o contraseña incorrectos")

    user = dict_from_row(user)

    if not user["activo"]:
        conn.close()
        raise HTTPException(status_code=401, detail="Usuario desactivado")

    # Verify password
    pw_hash, _ = hash_password(data.password, user["password_salt"])
    if pw_hash != user["password_hash"]:
        conn.close()
        raise HTTPException(status_code=401, detail="Usuario o contraseña incorrectos")

    # Create session
    token = secrets.token_urlsafe(48)
    expires = datetime.now() + timedelta(hours=SESSION_DURATION_HOURS)

    conn.execute(
        "INSERT INTO sesiones (token, usuario_id, expires_at) VALUES (?, ?, ?)",
        (token, user["id"], expires.isoformat())
    )

    # Update last access
    conn.execute(
        "UPDATE usuarios SET ultimo_acceso = datetime('now') WHERE id = ?",
        (user["id"],)
    )

    conn.commit()
    conn.close()

    # Set cookie (SameSite=none and Secure=True for cross-origin API support)
    response.set_cookie(
        key="sq_session",
        value=token,
        httponly=True,
        samesite="none",
        secure=True,
        max_age=SESSION_DURATION_HOURS * 3600,
        path="/"
    )

    return {"message": "Login exitoso", "username": user["username"]}


@router.post("/auth/logout")
def logout(request: Request, response: Response):
    token = request.cookies.get("sq_session")
    if token:
        conn = get_db()
        conn.execute("DELETE FROM sesiones WHERE token = ?", (token,))
        conn.commit()
        conn.close()

    response.delete_cookie("sq_session", path="/")
    return {"message": "Sesión cerrada"}


@router.get("/auth/me")
def get_me(request: Request):
    user = get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="No autenticado")
    return {
        "id": user["id"],
        "username": user["username"],
        "nombre_completo": user["nombre_completo"],
        "correo": user["correo"],
        "perfil_id": user["perfil_id"],
        "perfil_nombre": user["perfil_nombre"],
        "permisos": user["permisos"],
    }


# ══════════════════════════════════════════
#  PERMISOS
# ══════════════════════════════════════════

@router.get("/permisos")
def listar_permisos(request: Request):
    require_auth(request)
    # Return permissions grouped by module
    groups = {}
    for p in ALL_PERMISSIONS:
        module, action = p.split(".", 1)
        if module not in groups:
            groups[module] = []
        groups[module].append(p)
    return {"permisos": ALL_PERMISSIONS, "grupos": groups}


# ══════════════════════════════════════════
#  PERFILES (ROLES) CRUD
# ══════════════════════════════════════════

@router.get("/perfiles")
def listar_perfiles(request: Request):
    require_auth(request)
    conn = get_db()
    rows = conn.execute("""
        SELECT p.*, (SELECT COUNT(*) FROM usuarios u WHERE u.perfil_id = p.id) as num_usuarios
        FROM perfiles p ORDER BY p.id
    """).fetchall()
    conn.close()
    result = []
    for r in rows:
        d = dict_from_row(r)
        d["permisos"] = json.loads(d["permisos"])
        result.append(d)
    return result


@router.post("/perfiles")
def crear_perfil(data: PerfilCreate, request: Request):
    require_permission(request, "usuarios.crear")

    # Validate permissions
    invalid = [p for p in data.permisos if p not in ALL_PERMISSIONS]
    if invalid:
        raise HTTPException(400, f"Permisos inválidos: {', '.join(invalid)}")

    conn = get_db()
    try:
        conn.execute(
            "INSERT INTO perfiles (nombre, descripcion, permisos, es_sistema) VALUES (?, ?, ?, 0)",
            (data.nombre, data.descripcion, json.dumps(data.permisos))
        )
        conn.commit()
        perfil_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    except Exception as e:
        conn.close()
        if "UNIQUE" in str(e):
            raise HTTPException(400, "Ya existe un perfil con ese nombre")
        raise HTTPException(500, str(e))

    conn.close()
    return {"message": "Perfil creado", "id": perfil_id}


@router.put("/perfiles/{perfil_id}")
def editar_perfil(perfil_id: int, data: PerfilUpdate, request: Request):
    require_permission(request, "usuarios.editar")

    conn = get_db()
    perfil = conn.execute("SELECT * FROM perfiles WHERE id = ?", (perfil_id,)).fetchone()
    if not perfil:
        conn.close()
        raise HTTPException(404, "Perfil no encontrado")

    perfil = dict_from_row(perfil)

    # Protect system profile name (but allow permission changes)
    if perfil["es_sistema"] and data.nombre and data.nombre != perfil["nombre"]:
        conn.close()
        raise HTTPException(400, "No se puede cambiar el nombre de un perfil de sistema")

    if data.permisos is not None:
        invalid = [p for p in data.permisos if p not in ALL_PERMISSIONS]
        if invalid:
            conn.close()
            raise HTTPException(400, f"Permisos inválidos: {', '.join(invalid)}")

    updates = []
    values = []
    if data.nombre is not None:
        updates.append("nombre = ?")
        values.append(data.nombre)
    if data.descripcion is not None:
        updates.append("descripcion = ?")
        values.append(data.descripcion)
    if data.permisos is not None:
        updates.append("permisos = ?")
        values.append(json.dumps(data.permisos))

    if updates:
        values.append(perfil_id)
        conn.execute(f"UPDATE perfiles SET {', '.join(updates)} WHERE id = ?", values)
        conn.commit()

    conn.close()
    return {"message": "Perfil actualizado"}


@router.delete("/perfiles/{perfil_id}")
def eliminar_perfil(perfil_id: int, request: Request):
    require_permission(request, "usuarios.eliminar")

    conn = get_db()
    perfil = conn.execute("SELECT * FROM perfiles WHERE id = ?", (perfil_id,)).fetchone()
    if not perfil:
        conn.close()
        raise HTTPException(404, "Perfil no encontrado")

    if perfil["es_sistema"]:
        conn.close()
        raise HTTPException(400, "No se puede eliminar un perfil de sistema")

    # Check if any users are assigned to this profile
    user_count = conn.execute("SELECT COUNT(*) FROM usuarios WHERE perfil_id = ?", (perfil_id,)).fetchone()[0]
    if user_count > 0:
        conn.close()
        raise HTTPException(400, f"No se puede eliminar: {user_count} usuario(s) asignado(s) a este perfil")

    conn.execute("DELETE FROM perfiles WHERE id = ?", (perfil_id,))
    conn.commit()
    conn.close()
    return {"message": "Perfil eliminado"}


# ══════════════════════════════════════════
#  USUARIOS CRUD
# ══════════════════════════════════════════

@router.get("/usuarios")
def listar_usuarios(request: Request):
    require_permission(request, "usuarios.ver")
    conn = get_db()
    rows = conn.execute("""
        SELECT u.id, u.username, u.nombre_completo, u.correo, u.perfil_id,
               u.activo, u.ultimo_acceso, u.created_at,
               p.nombre as perfil_nombre
        FROM usuarios u
        JOIN perfiles p ON u.perfil_id = p.id
        ORDER BY u.id
    """).fetchall()
    conn.close()
    return dicts_from_rows(rows)


@router.post("/usuarios")
def crear_usuario(data: UsuarioCreate, request: Request):
    require_permission(request, "usuarios.crear")

    conn = get_db()

    # Verify profile exists
    perfil = conn.execute("SELECT id FROM perfiles WHERE id = ?", (data.perfil_id,)).fetchone()
    if not perfil:
        conn.close()
        raise HTTPException(400, "Perfil no encontrado")

    pw_hash, pw_salt = hash_password(data.password)

    try:
        conn.execute(
            "INSERT INTO usuarios (username, password_hash, password_salt, nombre_completo, correo, perfil_id, activo) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (data.username, pw_hash, pw_salt, data.nombre_completo, data.correo, data.perfil_id, data.activo)
        )
        conn.commit()
        user_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    except Exception as e:
        conn.close()
        if "UNIQUE" in str(e):
            raise HTTPException(400, "El nombre de usuario ya existe")
        raise HTTPException(500, str(e))

    conn.close()
    return {"message": "Usuario creado", "id": user_id}


@router.put("/usuarios/{usuario_id}")
def editar_usuario(usuario_id: int, data: UsuarioUpdate, request: Request):
    require_permission(request, "usuarios.editar")

    conn = get_db()
    user = conn.execute("SELECT * FROM usuarios WHERE id = ?", (usuario_id,)).fetchone()
    if not user:
        conn.close()
        raise HTTPException(404, "Usuario no encontrado")

    # Prevent deactivating the last admin
    if data.activo == 0:
        user_dict = dict_from_row(user)
        admin_perfil = conn.execute("SELECT id FROM perfiles WHERE nombre = 'Administrador'").fetchone()
        if admin_perfil and user_dict["perfil_id"] == admin_perfil["id"]:
            active_admins = conn.execute(
                "SELECT COUNT(*) FROM usuarios WHERE perfil_id = ? AND activo = 1 AND id != ?",
                (admin_perfil["id"], usuario_id)
            ).fetchone()[0]
            if active_admins == 0:
                conn.close()
                raise HTTPException(400, "No se puede desactivar el último administrador activo")

    if data.perfil_id is not None:
        perfil = conn.execute("SELECT id FROM perfiles WHERE id = ?", (data.perfil_id,)).fetchone()
        if not perfil:
            conn.close()
            raise HTTPException(400, "Perfil no encontrado")

    updates = []
    values = []
    if data.nombre_completo is not None:
        updates.append("nombre_completo = ?")
        values.append(data.nombre_completo)
    if data.correo is not None:
        updates.append("correo = ?")
        values.append(data.correo)
    if data.perfil_id is not None:
        updates.append("perfil_id = ?")
        values.append(data.perfil_id)
    if data.activo is not None:
        updates.append("activo = ?")
        values.append(data.activo)

    if updates:
        values.append(usuario_id)
        conn.execute(f"UPDATE usuarios SET {', '.join(updates)} WHERE id = ?", values)
        conn.commit()

    conn.close()
    return {"message": "Usuario actualizado"}


@router.put("/usuarios/{usuario_id}/password")
def cambiar_password(usuario_id: int, data: PasswordChange, request: Request):
    current_user = require_auth(request)

    # Users can change their own password, or admins can change any
    if current_user["id"] != usuario_id and "usuarios.editar" not in current_user["permisos"]:
        raise HTTPException(403, "Sin permiso para cambiar contraseña de otro usuario")

    if len(data.password) < 4:
        raise HTTPException(400, "La contraseña debe tener al menos 4 caracteres")

    conn = get_db()
    user = conn.execute("SELECT id FROM usuarios WHERE id = ?", (usuario_id,)).fetchone()
    if not user:
        conn.close()
        raise HTTPException(404, "Usuario no encontrado")

    pw_hash, pw_salt = hash_password(data.password)
    conn.execute(
        "UPDATE usuarios SET password_hash = ?, password_salt = ? WHERE id = ?",
        (pw_hash, pw_salt, usuario_id)
    )
    conn.commit()
    conn.close()
    return {"message": "Contraseña actualizada"}


@router.delete("/usuarios/{usuario_id}")
def eliminar_usuario(usuario_id: int, request: Request):
    current_user = require_permission(request, "usuarios.eliminar")

    conn = get_db()
    user = conn.execute("SELECT * FROM usuarios WHERE id = ?", (usuario_id,)).fetchone()
    if not user:
        conn.close()
        raise HTTPException(404, "Usuario no encontrado")

    # Prevent self-deletion
    if usuario_id == current_user["id"]:
        conn.close()
        raise HTTPException(400, "No puedes eliminarte a ti mismo")

    # Prevent deleting the last admin
    user_dict = dict_from_row(user)
    admin_perfil = conn.execute("SELECT id FROM perfiles WHERE nombre = 'Administrador'").fetchone()
    if admin_perfil and user_dict["perfil_id"] == admin_perfil["id"]:
        active_admins = conn.execute(
            "SELECT COUNT(*) FROM usuarios WHERE perfil_id = ? AND activo = 1",
            (admin_perfil["id"],)
        ).fetchone()[0]
        if active_admins <= 1:
            conn.close()
            raise HTTPException(400, "No se puede eliminar el último administrador")

    # Delete user sessions
    conn.execute("DELETE FROM sesiones WHERE usuario_id = ?", (usuario_id,))
    conn.execute("DELETE FROM usuarios WHERE id = ?", (usuario_id,))
    conn.commit()
    conn.close()
    return {"message": "Usuario eliminado"}
