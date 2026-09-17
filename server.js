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
  if (req.path === '/configuracion/public') return next();
  // El renderizador headless no comparte las cookies del navegador. Sólo se
  // permite saltar la sesión con un token HMAC de corta duración generado por
  // la propia descarga PDF y únicamente para consultar una cotización.
  const pdfMatch = req.method === 'GET' && req.path.match(/^\/cotizaciones\/(\d+)(?:\/pdf-download)?$/);
  if (pdfMatch && verifyPdfToken(pdfMatch[1], req.query.pdf_token)) {
    try {
      const [cots] = await require('./db').execute(`
        SELECT c.empresa_id, cl.empresa_id AS cliente_empresa_id
        FROM cotizaciones c LEFT JOIN clientes cl ON cl.id = c.cliente_id
        WHERE c.id = ?
      `, [pdfMatch[1]]);
      const cotEmpresaId = cots.length
        ? (Number(cots[0].empresa_id) || Number(cots[0].cliente_empresa_id) || 1)
        : 1;
      req.user = { empresa_id: cotEmpresaId, es_superadmin: true, pdf_render: true };
    } catch {
      req.user = { empresa_id: 1, es_superadmin: true, pdf_render: true };
    }
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

// Proxy seguro para que el respaldo PDF del navegador pueda incluir imágenes
// de productos alojadas en otros dominios que no habilitan CORS.
app.get('/api/imagen-proxy', async (req, res) => {
  const rawUrl = String(req.query.url || '').trim();
  let targetUrl;

  const esDestinoPublico = (url) => {
    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    return !(
      hostname === 'localhost' ||
      hostname.endsWith('.local') ||
      hostname === '0.0.0.0' ||
      hostname === '::1' ||
      /^127\./.test(hostname) ||
      /^10\./.test(hostname) ||
      /^192\.168\./.test(hostname) ||
      /^169\.254\./.test(hostname) ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)
    );
  };

  try {
    targetUrl = new URL(rawUrl);
    if (!['http:', 'https:'].includes(targetUrl.protocol) || !esDestinoPublico(targetUrl)) {
      return res.status(400).json({ detail: 'URL de imagen no permitida' });
    }

    let upstream;
    for (let redirects = 0; redirects <= 3; redirects++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12000);
      try {
        upstream = await fetch(targetUrl, {
          redirect: 'manual',
          signal: controller.signal,
          headers: { Accept: 'image/*', 'User-Agent': 'ClicSolar PDF image proxy' }
        });
      } finally {
        clearTimeout(timeout);
      }

      if (![301, 302, 303, 307, 308].includes(upstream.status)) break;
      const location = upstream.headers.get('location');
      if (!location) break;
      targetUrl = new URL(location, targetUrl);
      if (!['http:', 'https:'].includes(targetUrl.protocol) || !esDestinoPublico(targetUrl)) {
        return res.status(400).json({ detail: 'Redirección de imagen no permitida' });
      }
    }

    if (!upstream || !upstream.ok) {
      return res.status(502).json({ detail: 'No se pudo cargar la imagen del producto' });
    }

    const contentType = (upstream.headers.get('content-type') || '').split(';')[0].toLowerCase();
    if (!contentType.startsWith('image/')) {
      return res.status(415).json({ detail: 'El recurso remoto no es una imagen' });
    }

    const contentLength = Number(upstream.headers.get('content-length') || 0);
    if (contentLength > 8 * 1024 * 1024) {
      return res.status(413).json({ detail: 'La imagen supera el tamaño permitido' });
    }

    const buffer = Buffer.from(await upstream.arrayBuffer());
    if (buffer.length > 8 * 1024 * 1024) {
      return res.status(413).json({ detail: 'La imagen supera el tamaño permitido' });
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', buffer.length);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.end(buffer);
  } catch (error) {
    console.error('Error en proxy de imagen:', error.message);
    if (!res.headersSent) res.status(502).json({ detail: 'No se pudo cargar la imagen del producto' });
  }
});

// Usuarios, Perfiles, Permisos (all under /api)
const usuariosRouter = require('./routes/usuarios');
app.use('/api/usuarios', usuariosRouter);
app.use('/api/perfiles', (req, res, next) => {
    req.url = req.url === '/' ? '/perfiles' : `/perfiles${req.url}`;
    usuariosRouter(req, res, next);
});
app.use('/api/permisos', (req, res, next) => {
    req.url = req.url === '/' ? '/permisos' : `/permisos${req.url}`;
    usuariosRouter(req, res, next);
});

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
