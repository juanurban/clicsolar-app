const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
require('dotenv').config();

const app = express();
const authRouter = require('./routes/auth');
const { verifyPdfToken } = require('./utils/pdfToken');
const PORT = process.env.PORT || 8000;

// Trust proxy (behind Nginx/Apache/cPanel)
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// Middleware
app.use(cors({
  origin: ['http://localhost:8000', 'https://clicsolar.com', 'https://www.clicsolar.com'],
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.get('/health', async (req, res) => {
  try {
    await require('./db').execute('SELECT 1');
    res.json({ status: 'ok', service: 'plantas-solares-colombia' });
  } catch (error) {
    res.status(503).json({ status: 'error', detail: 'Base de datos no disponible' });
  }
});

// Static files
app.use('/static', express.static(path.join(__dirname, 'static')));

// ── API Routes ──
// Auth (login, logout, me)
app.use('/api/auth', authRouter);
app.use('/api/empresas', require('./routes/empresas'));

// Configuración (branding - público para login)
app.use('/api/configuracion', require('./routes/configuracion'));

// Every non-authenticated API call is scoped to the signed-in company.
app.use('/api', async (req, res, next) => {
  if (req.path === '/auth' || req.path.startsWith('/auth/') || req.path === '/login' || req.path.startsWith('/login/') || req.path === '/logout' || req.path.startsWith('/logout/')) return next();
  if (req.path === '/configuracion' || req.path.startsWith('/configuracion/')) return next();
  // El renderizador headless no comparte las cookies del navegador. Sólo se
  // permite saltar la sesión con un token HMAC de corta duración generado por
  // la propia descarga PDF y únicamente para consultar una cotización.
  const pdfMatch = req.method === 'GET' && req.path.match(/^\/cotizaciones\/(\d+)$/);
  if (pdfMatch && verifyPdfToken(pdfMatch[1], req.query.pdf_token)) {
    req.user = { empresa_id: 0, es_superadmin: true, pdf_render: true };
    return next();
  }
  try {
    const user = await authRouter.getCurrentUser(req);
    if (!user) return res.status(401).json({ detail: 'No autenticado' });
    req.user = user;
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({ detail: 'Error de autenticación' });
  }
});

// Usuarios, Perfiles, Permisos (all under /api)
const usuariosRouter = require('./routes/usuarios');
app.use('/api/productos', usuariosRouter);
app.use('/api/perfiles', usuariosRouter); // Re-route /api/perfiles/* to usuarios router (which handles /perfiles)
app.use('/api/permisos', usuariosRouter); // Re-route /api/permisos to usuarios router

// Clientes
app.use('/api/clientes', require('./routes/clientes'));

// Perfiles energéticos horarios importados desde analizadores
app.use('/api/perfiles-energeticos', require('./routes/perfilesEnergeticos'));

// Inventario (frontend calls /api/equipos)
app.use('/api/equipos', require('./routes/inventario'));

// Cotizaciones
app.use('/api/cotizaciones', require('./routes/cotizaciones'));

// Proyectos (Kanban)
app.use('/api/proyectos', require('./routes/proyectos'));

// Dashboard & Reportes
app.use('/api', require('./routes/reportes'));

// ── Serve HTML Pages ──
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'templates/login.html'));
});

app.get('/pdf/:id', (req, res) => {
  res.sendFile(path.join(__dirname, 'templates/pdf_template.html'));
});

// Fallback for SPA routing
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'templates/index.html'));
});

// Start Server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Plantas Solares de Colombia running on port ${PORT}`);
});
