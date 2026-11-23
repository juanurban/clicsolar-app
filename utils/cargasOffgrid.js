/**
 * Cargas eléctricas de un sistema off-grid.
 *
 * Cada equipo declara su potencia y cuántas horas funciona de día (con sol) y
 * de noche (sin sol). Con eso se obtiene la energía diaria que debe cubrir el
 * sistema, el banco de baterías se dimensiona con la energía de las horas sin
 * sol y el inversor con la potencia que puede estar encendida al mismo tiempo.
 */

const PARAMETROS_POR_DEFECTO = {
  voltaje_banco_v: 48,
  dias_autonomia: 1,
  profundidad_descarga_pct: 80,
  eficiencia_sistema_pct: 85,
  margen_inversor_pct: 25
};

const MAX_EQUIPOS = 60;

function numero(valor, defecto = 0) {
  if (valor === null || valor === undefined || valor === '') return defecto;
  const number = Number(String(valor).replace(',', '.'));
  return Number.isFinite(number) ? number : defecto;
}

function limitar(valor, minimo, maximo) {
  return Math.min(maximo, Math.max(minimo, valor));
}

function redondear(valor, decimales = 2) {
  const factor = 10 ** decimales;
  return Math.round(valor * factor) / factor;
}

// Un checkbox desmarcado puede llegar como false, 0, '0', 'false' o null según
// el cliente que envió el formulario.
function aBooleano(valor, defecto = true) {
  if (valor === undefined) return defecto;
  if (valor === null) return false;
  if (typeof valor === 'string') {
    const texto = valor.trim().toLowerCase();
    if (['', '0', 'false', 'no', 'off'].includes(texto)) return false;
    return true;
  }
  return Boolean(valor);
}

function normalizarEquipo(item = {}) {
  return {
    nombre: String(item.nombre || '').trim().slice(0, 120),
    cantidad: Math.max(1, Math.round(numero(item.cantidad, 1))),
    potencia_w: Math.max(0, numero(item.potencia_w)),
    horas_dia: limitar(numero(item.horas_dia), 0, 24),
    horas_noche: limitar(numero(item.horas_noche), 0, 24),
    simultaneo: aBooleano(item.simultaneo, true)
  };
}

function normalizarParametros(parametros = {}) {
  return {
    voltaje_banco_v: Math.max(1, numero(parametros.voltaje_banco_v, PARAMETROS_POR_DEFECTO.voltaje_banco_v)),
    dias_autonomia: Math.max(1, numero(parametros.dias_autonomia, PARAMETROS_POR_DEFECTO.dias_autonomia)),
    profundidad_descarga_pct: limitar(numero(parametros.profundidad_descarga_pct, PARAMETROS_POR_DEFECTO.profundidad_descarga_pct), 10, 100),
    eficiencia_sistema_pct: limitar(numero(parametros.eficiencia_sistema_pct, PARAMETROS_POR_DEFECTO.eficiencia_sistema_pct), 10, 100),
    margen_inversor_pct: limitar(numero(parametros.margen_inversor_pct, PARAMETROS_POR_DEFECTO.margen_inversor_pct), 0, 100)
  };
}

/**
 * Calcula energía y equipos principales a partir de las cargas.
 * Fórmulas:
 *  - energía diaria = Σ potencia × cantidad × (horas día + horas noche)
 *  - banco (kWh) = energía nocturna × días de autonomía ÷ (DoD × eficiencia)
 *  - banco (Ah) = banco kWh × 1000 ÷ voltaje del banco
 *  - inversor = potencia simultánea × (1 + margen)
 */
function calcularResumen(equipos, parametros) {
  let energiaDia = 0;
  let energiaNoche = 0;
  let potenciaInstalada = 0;
  let potenciaSimultanea = 0;

  for (const equipo of equipos) {
    const potenciaTotal = equipo.potencia_w * equipo.cantidad;
    energiaDia += potenciaTotal / 1000 * equipo.horas_dia;
    energiaNoche += potenciaTotal / 1000 * equipo.horas_noche;
    potenciaInstalada += potenciaTotal;
    if (equipo.simultaneo) potenciaSimultanea += potenciaTotal;
  }

  const energiaDiaria = energiaDia + energiaNoche;
  const energiaRespaldo = energiaNoche * parametros.dias_autonomia;
  const rendimiento = (parametros.profundidad_descarga_pct / 100) * (parametros.eficiencia_sistema_pct / 100);
  const capacidadBanco = rendimiento > 0 ? energiaRespaldo / rendimiento : 0;
  const capacidadBancoAh = parametros.voltaje_banco_v > 0 ? capacidadBanco * 1000 / parametros.voltaje_banco_v : 0;
  const potenciaInversor = potenciaSimultanea * (1 + parametros.margen_inversor_pct / 100);

  return {
    energia_diaria_kwh: redondear(energiaDiaria),
    energia_dia_kwh: redondear(energiaDia),
    energia_noche_kwh: redondear(energiaNoche),
    consumo_mensual_kwh: redondear(energiaDiaria * 30, 1),
    potencia_instalada_w: redondear(potenciaInstalada, 1),
    potencia_simultanea_w: redondear(potenciaSimultanea, 1),
    potencia_inversor_w: redondear(potenciaInversor, 1),
    capacidad_banco_kwh: redondear(capacidadBanco),
    capacidad_banco_ah: redondear(capacidadBancoAh, 1),
    equipos: equipos.length
  };
}

/**
 * Acepta el objeto nuevo ({ equipos, parametros }), un arreglo de equipos de
 * versiones anteriores o el JSON serializado, y devuelve siempre la misma
 * estructura con el resumen recalculado en el servidor.
 */
function normalizarCargas(valor) {
  let data = valor;
  while (typeof data === 'string') {
    try {
      const parsed = JSON.parse(data);
      if (parsed === data) break;
      data = parsed;
    } catch { break; }
  }

  const equiposBrutos = Array.isArray(data) ? data : (Array.isArray(data?.equipos) ? data.equipos : []);
  const parametros = normalizarParametros(Array.isArray(data) ? {} : (data?.parametros || {}));
  const equipos = equiposBrutos.slice(0, MAX_EQUIPOS).map(normalizarEquipo)
    .filter(equipo => equipo.nombre || equipo.potencia_w > 0);

  return {
    activo: equipos.length > 0,
    equipos,
    parametros,
    resumen: calcularResumen(equipos, parametros)
  };
}

module.exports = {
  PARAMETROS_POR_DEFECTO,
  normalizarCargas,
  calcularResumen
};
