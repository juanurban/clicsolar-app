// Almacén persistente de archivos subidos desde la web (imágenes de equipos,
// logos, fotos de clientes...).
//
// Debe vivir FUERA del repositorio: el despliegue automático de Hostinger
// sincroniza la app con git y elimina los archivos no trackeados, por eso las
// imágenes subidas a los equipos desaparecían después de cada push. Todo lo
// que se suba aquí sobrevive a los despliegues.
//
// Se sirve con la misma URL de siempre (/static/uploads/...) mediante un
// express.static registrado en server.js, así que las rutas ya guardadas en
// la base de datos siguen funcionando.
const os = require('os');
const path = require('path');
const fs = require('fs');

const PERSIST_DIR = process.env.UPLOADS_PERSIST_DIR
  ? path.resolve(process.env.UPLOADS_PERSIST_DIR)
  : path.join(os.homedir(), 'clicsolar-uploads');

// Devuelve (y crea si falta) la carpeta de destino dentro del almacén.
// Ejemplo: uploadsDir() -> ~/clicsolar-uploads/uploads
//          uploadsDir('clientes') -> ~/clicsolar-uploads/uploads/clientes
function uploadsDir(...subdirs) {
  const dir = path.join(PERSIST_DIR, 'uploads', ...subdirs);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

module.exports = { PERSIST_DIR, uploadsDir };
