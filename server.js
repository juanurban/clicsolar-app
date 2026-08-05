const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 8000;

// Middleware
app.use(cors({
  origin: ['http://localhost:8000', 'https://clicsolar.com', 'https://www.clicsolar.com'],
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Static files
app.use('/static', express.static(path.join(__dirname, 'static')));

// ── API Routes ──
// Auth (login, logout, me)
app.use('/api/auth', require('./routes/auth'));

// Usuarios, Perfiles, Permisos (all under /api)
const usuariosRouter = require('./routes/usuarios');
app.use('/api/usuarios', usuariosRouter);
app.use('/api/perfiles', usuariosRouter); // Re-route /api/perfiles/* to usuarios router (which handles /perfiles)
app.use('/api/permisos', usuariosRouter); // Re-route /api/permisos to usuarios router

// Clientes
app.use('/api/clientes', require('./routes/clientes'));

// Inventario (frontend calls /api/equipos)
app.use('/api/equipos', require('./routes/inventario'));

// Cotizaciones
app.use('/api/cotizaciones', require('./routes/cotizaciones'));

// Configuración
app.use('/api/configuracion', require('./routes/configuracion'));

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
app.listen(PORT, () => {
  console.log(`🚀 SunQuote Server running on port ${PORT}`);
});
