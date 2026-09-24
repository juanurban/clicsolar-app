const fs = require('fs');
const path = require('path');

const projectRoot = path.join(__dirname, '..');
const LOGO_PLANTAS = '/static/uploads/file_logopsc.svg';
const LOGO_GENERICO = '/static/img/logo.svg';

const PLANTAS_ASESOR_POR_DEFECTO = {
  asesor_nombre: 'JUAN CARLOS CAMARGO',
  asesor_telefono: '3212578095',
  asesor_correo: 'juan.camargo@outlook.com'
};

const PLANTAS_TERMINOS_POR_DEFECTO = JSON.stringify([
  'La cotización tiene una validez de 15 días calendario a partir de la fecha de emisión.',
  'Forma de pago: 60% de anticipo para la orden de compra y reserva de equipos y 40% a la puesta en marcha y pruebas de funcionamiento.',
  'Garantía Paneles Solares: 10 años contra defectos de fabricación y garantía de generación lineal de 25 años.',
  'Garantía de Baterías: Entre 5 a 10 años según la referencia y marca del equipo.',
  'Garantía de 6 meses sobre la instalación eléctrica y la fijación estructural frente a defectos de montaje.',
  'La gestión de trámites de legalización, certificación RETIE e inscripción ante el Operador de Red (OR) se sujetará a las agendas y tiempos de respuesta de las entidades. PSC no garantiza el exito de la gestión sin embargo se compromete a apoyarla y colaborar en su gestión.',
  'Refuerzos estructurales en techos, obras civiles de excavación especial o reparación de imperfecciones o filtraciones preexistentes en la cubierta NO están incluidos en la actual propuesta.',
  'Las marcas y referencias de los equipos especificadas en esta propuesta están sujetas a disponibilidad de inventario al momento del anticipo. En caso de requerirse un cambio, se utilizarán equipos de marcas equivalentes o superiores, garantizando que no se afectarán negativamente la calidad, la potencia nominal del sistema ni los tiempos de garantía originalmente ofrecidos.',
  'La presente oferta contempla única y exclusivamente las obras civiles, eléctricas, componentes y actividades descritos de forma explícita en el cuerpo de la propuesta. Cualquier equipo, adecuación, reubicación o trabajo complementario no especificado requerirá la tramitación formal de un adicionales u orden de cambio, la cual deberá ser aprobada por el cliente y generará costos y plazos de entrega independientes.'
]);

const CONFIGURACION_PROPIA_EMPRESA = new Set([
  'empresa_nombre',
  'empresa_nombre_corto',
  'empresa_nit',
  'empresa_direccion',
  'empresa_telefono',
  'empresa_correo',
  'empresa_web',
  'empresa_logo',
  'firma_asesor',
  'terminos_condiciones'
]);

function normalizarTexto(valor) {
  return String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function esEmpresaPlantas(nombre) {
  return normalizarTexto(nombre).includes('plantas solares');
}

function esConfiguracionPropiaEmpresa(clave) {
  const claveNormalizada = String(clave || '');
  return CONFIGURACION_PROPIA_EMPRESA.has(claveNormalizada)
    || claveNormalizada.startsWith('asesor_')
    || claveNormalizada.startsWith('diseno_');
}

function recursoDisponible(url) {
  const valor = String(url || '').trim();
  if (!valor) return false;
  if (/^https?:\/\//i.test(valor)) return true;
  if (!valor.startsWith('/')) return false;
  return fs.existsSync(path.join(projectRoot, valor.slice(1)));
}

function resolverLogo(valor, nombreEmpresa) {
  const logo = String(valor || '').trim();

  // El logo corporativo de Plantas está versionado en el repositorio. Esto
  // evita que una ruta de una carga local inexistente termine en otro logo.
  if (esEmpresaPlantas(nombreEmpresa) && (
    !logo
    || logo === LOGO_GENERICO
    || /logo[_-]?dru/i.test(logo)
    || !recursoDisponible(logo)
  )) {
    return LOGO_PLANTAS;
  }

  return recursoDisponible(logo)
    ? logo
    : (esEmpresaPlantas(nombreEmpresa) ? LOGO_PLANTAS : LOGO_GENERICO);
}

function parecePerfilDru(valor) {
  return /dru|diego|rincon|drincon|3203880918/i.test(String(valor || ''));
}

function resolverTerminosPlantas(valor) {
  const raw = String(valor || '').trim();
  if (!raw) return PLANTAS_TERMINOS_POR_DEFECTO;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (_) {
    return parecePerfilDru(raw) ? PLANTAS_TERMINOS_POR_DEFECTO : raw;
  }
  if (!Array.isArray(parsed)) return raw;

  const textoDe = item => typeof item === 'string' ? item : item?.texto || '';
  const limpios = parsed.filter(item => !parecePerfilDru(textoDe(item)));
  if (limpios.length === parsed.length) return raw;

  const defaults = JSON.parse(PLANTAS_TERMINOS_POR_DEFECTO);
  const existentes = new Set(limpios.map(item => String(textoDe(item)).trim().toLowerCase()));
  return JSON.stringify([
    ...defaults.filter(item => !existentes.has(String(item).trim().toLowerCase())),
    ...limpios
  ]);
}

module.exports = {
  LOGO_PLANTAS,
  LOGO_GENERICO,
  PLANTAS_ASESOR_POR_DEFECTO,
  PLANTAS_TERMINOS_POR_DEFECTO,
  esEmpresaPlantas,
  esConfiguracionPropiaEmpresa,
  resolverLogo,
  parecePerfilDru,
  resolverTerminosPlantas
};
