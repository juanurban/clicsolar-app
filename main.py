"""
SunQuote - Main FastAPI Application
Solar PV Dimensioning and Quoting System
"""
import os
import webbrowser
import threading
import asyncio
import uvicorn
from fastapi import FastAPI, Request, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, FileResponse, Response
from fastapi.templating import Jinja2Templates
from fastapi.middleware.cors import CORSMiddleware

from database import init_db, seed_data
from routers import clientes, inventario, cotizaciones, configuracion, reportes, usuarios

# ── App Setup ──
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

app = FastAPI(
    title="SunQuote - Cotizador Solar FV",
    description="Dimensionador y Cotizador Automático de Plantas Solares Fotovoltaicas",
    version="2.4.0"
)

# ── CORS Middleware ──
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8000", "https://clicsolar.com", "https://www.clicsolar.com"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static files
app.mount("/static", StaticFiles(directory=os.path.join(BASE_DIR, "static")), name="static")

# Templates
templates = Jinja2Templates(directory=os.path.join(BASE_DIR, "templates"))

# ── Include API Routers ──
app.include_router(clientes.router, prefix="/api", tags=["Clientes"])
app.include_router(inventario.router, prefix="/api", tags=["Inventario"])
app.include_router(cotizaciones.router, prefix="/api", tags=["Cotizaciones"])
app.include_router(configuracion.router, prefix="/api", tags=["Configuración"])
app.include_router(reportes.router, prefix="/api", tags=["Reportes"])
app.include_router(usuarios.router, prefix="/api", tags=["Usuarios"])


# ── Startup Event ──
@app.on_event("startup")
async def startup_event():
    """Initialize database and seed data on startup."""
    init_db()
    seed_data()
    print("🌞 SunQuote server ready at http://localhost:8000")


# ── Root Route → SPA Shell ──
@app.get("/", response_class=HTMLResponse)
async def root(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})


# ── Login Route ──
@app.get("/login", response_class=HTMLResponse)
async def login_page(request: Request):
    return templates.TemplateResponse("login.html", {"request": request})


# ── SPA Routes ──
@app.get("/propuestas")
@app.get("/clientes")
@app.get("/cotizador")
@app.get("/configuracion")
@app.get("/usuarios")
async def spa(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})


# ── Favicon ──
@app.get("/favicon.ico")
async def favicon():
    return FileResponse(os.path.join(BASE_DIR, "static", "img", "logo.svg"))


# ── PDF Preview Route ──
@app.get("/pdf/{cotizacion_id}", response_class=HTMLResponse)
async def pdf_preview(request: Request, cotizacion_id: int):
    return templates.TemplateResponse("pdf_template.html", {
        "request": request,
        "cotizacion_id": cotizacion_id
    })


# ── PDF Download Route (server-side with Playwright for pixel-perfect output) ──
@app.get("/api/cotizaciones/{cotizacion_id}/pdf-download")
async def descargar_pdf(cotizacion_id: int):
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        raise HTTPException(500, "Playwright no está instalado")

    try:
        pdf_url = f"http://localhost:8000/pdf/{cotizacion_id}"

        def generate():
            with sync_playwright() as p:
                browser = p.chromium.launch(headless=True)
                page = browser.new_page(device_scale_factor=2)
                page.goto(pdf_url, wait_until="networkidle", timeout=30000)
                try:
                    page.wait_for_selector("#prod-chart", timeout=15000)
                except Exception:
                    pass
                page.wait_for_timeout(1000)
                pdf_bytes = page.pdf(
                    print_background=True,
                    prefer_css_page_size=True
                )
                browser.close()
                return pdf_bytes

        loop = asyncio.get_event_loop()
        pdf_bytes = await loop.run_in_executor(None, generate)

        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename=propuesta_{cotizacion_id}.pdf"}
        )
    except Exception as e:
        raise HTTPException(500, f"Error generando PDF: {str(e)}")


def open_browser():
    """Open browser after a short delay to let the server start."""
    import time
    time.sleep(1.5)
    webbrowser.open("http://localhost:8000")


if __name__ == "__main__":
    # Open browser in a separate thread
    threading.Thread(target=open_browser, daemon=True).start()
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
