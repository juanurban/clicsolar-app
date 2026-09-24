const express = require('express');
const router = express.Router();
const pool = require('../db');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { createPdfToken } = require('../utils/pdfToken');
const puppeteer = require('puppeteer');
const {
  resolverLogo,
  esEmpresaPlantas,
  PLANTAS_ASESOR_POR_DEFECTO,
  PLANTAS_TERMINOS_POR_DEFECTO,
  parecePerfilDru
} = require('../utils/empresaConfig');



// ── Helper: Get config value ──
async function getConfigValue(clave, defaultVal = null, empresaId = 1) {
  const [rows] = await pool.execute('SELECT valor, tipo FROM configuracion WHERE clave = ? AND empresa_id = ?', [clave, empresaId]);
  if (rows.length === 0) return defaultVal;
  const { valor, tipo } = rows[0];
  if (tipo === 'number') { const n = parseFloat(valor); return isNaN(n) ? defaultVal : n; }
  return valor;
}

// Algunas cotizaciones antiguas guardaron 999 meses cuando el ahorro mensual
// llegó vacío durante el primer cálculo. Si la proyección sí contiene ahorro,
// usamos esa información para reparar el retorno sin alterar sus valores.
function calcularRoiDesdeProyeccion(cotizacion) {
  const proyeccion = Array.isArray(cotizacion.proyeccion_25_json)
    ? cotizacion.proyeccion_25_json
    : [];
  const primeraAnualidad = proyeccion[0] || {};
  const valorEnergiaAnual = Number(primeraAnualidad.valor_energia)
    || (Number(primeraAnualidad.valor_autoconsumo) || 0)
      + (Number(primeraAnualidad.valor_excedentes) || 0);
  const ahorroMensualGuardado = Number(cotizacion.ahorro_mensual) || 0;
  const ahorroMensual = ahorroMensualGuardado > 0
    ? ahorroMensualGuardado
    : valorEnergiaAnual > 0 ? Math.round(valorEnergiaAnual / 12) : 0;
  const inversion = Number(cotizacion.total_inversion) || 0;
  if (ahorroMensual <= 0 || inversion <= 0) return null;

  const tasaDeduccion = Number(cotizacion.deduccion_renta_pct) || 50;
  const beneficioFiscal = inversion * (tasaDeduccion / 100) * 0.33;
  return {
    ahorroMensual,
    ahorroAnual: ahorroMensual * 12,
    roiSinIncentivosMeses: Math.round(inversion / ahorroMensual * 10) / 10,
    roiConIncentivosMeses: Math.round((inversion - beneficioFiscal) / ahorroMensual * 10) / 10
  };
}

// Algunas propuestas antiguas se guardaron con producción cero aunque aún
// conservan el panel, la cantidad de paneles y la HSP del cliente. En ese
// caso podemos reconstruir la producción con la misma eficiencia por defecto
// usada por /dimensionar (82 %) y reparar el análisis financiero al abrirla.
function calcularProduccionDesdeCotizacion(cotizacion) {
  const produccionMensual = Number(cotizacion.produccion_mensual_kwh) || 0;
  if (produccionMensual > 0) return null;

  const produccionDiariaGuardada = Number(cotizacion.produccion_diaria_kwh) || 0;
  if (produccionDiariaGuardada > 0) {
    return {
      diaria: Math.round(produccionDiariaGuardada * 100) / 100,
      mensual: Math.round(produccionDiariaGuardada * 30 * 100) / 100
    };
  }

  const panelWp = Number(cotizacion.panel?.potencia_wp) || 0;
  const potenciaKwp = Number(cotizacion.potencia_kwp) || 0;
  const numPaneles = Number(cotizacion.num_paneles) > 0
    ? Number(cotizacion.num_paneles)
    : panelWp > 0 && potenciaKwp > 0
      ? Math.ceil(potenciaKwp * 1000 / panelWp)
      : 0;
  const hsp = Number(cotizacion.cliente_hsp) > 0 ? Number(cotizacion.cliente_hsp) : 4.2;
  const eficiencia = 0.82;

  if (panelWp <= 0 || numPaneles <= 0 || hsp <= 0) return null;

  const diaria = Math.round(numPaneles * panelWp * hsp * eficiencia / 1000 * 100) / 100;
  return {
    diaria,
    mensual: Math.round(diaria * 30 * 100) / 100
  };
}

// ── Helper: Generate next code ──
async function generateCodigo() {
  const [rows] = await pool.execute('SELECT MAX(id) as max_id FROM cotizaciones');
  const nextId = (rows[0].max_id || 0) + 1;
  return `PROP-${String(nextId).padStart(4, '0')}`;
}

// Estima las Horas Sol Pico para la ubicación seleccionada. La clave de IA
// permanece en el servidor; el navegador sólo recibe el resultado validado.
router.post('/calcular-hsp', async (req, res) => {
  const departamento = String(req.body.departamento || '').trim();
  const municipio = String(req.body.municipio || '').trim();
  if (!departamento || !municipio) {
    return res.status(400).json({ detail: 'Selecciona departamento y municipio.' });
  }

  const fallbackByDepartment = {
    Amazonas: 4.4, Antioquia: 4.8, Arauca: 5.2, Atlántico: 5.3, Bolívar: 5.1,
    Boyacá: 4.6, Caldas: 4.3, Caquetá: 4.4, Casanare: 5.0, Cauca: 4.5,
    Cesar: 5.3, Chocó: 4.0, Cundinamarca: 4.6, Córdoba: 5.2, Guainía: 4.7,
    Guaviare: 4.5, Huila: 5.1, 'La Guajira': 5.8, Magdalena: 5.4, Meta: 4.9,
    Nariño: 4.4, 'Norte de Santander': 5.0, Putumayo: 4.2, Quindío: 4.3,
    Risaralda: 4.2, 'San Andrés y Providencia': 5.3, Santander: 4.8, Sucre: 5.4,
    Tolima: 5.0, 'Valle del Cauca': 4.8, Vaupés: 4.4, Vichada: 5.1
  };
  const fallback = fallbackByDepartment[departamento] || 4.6;
  const apiKey = (process.env.GROQ_API_KEY || '').trim().replace(/[\'\"]/g, '');

  if (!apiKey) return res.json({ hsp: fallback, fuente: 'estimación regional', detalle: 'IA no configurada' });
  try {
    const prompt = `Eres especialista en recurso solar fotovoltaico en Colombia. Estima las Horas Sol Pico (HSP) promedio diario anual para ${municipio}, ${departamento}, Colombia. Devuelve únicamente JSON válido con las claves hsp (número entre 3.5 y 6.5, máximo 2 decimales) y justificacion (texto breve). Usa un valor climatológicamente razonable para la ubicación, no la radiación de un día específico.`;
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        response_format: { type: 'json_object' }
      })
    });
    if (!response.ok) throw new Error(`Groq ${response.status}`);
    const body = await response.json();
    const content = body.choices?.[0]?.message?.content || '{}';
    const parsed = JSON.parse(content);
    const hsp = Number(parsed.hsp);
    if (!Number.isFinite(hsp) || hsp < 3.5 || hsp > 6.5) throw new Error('HSP fuera de rango');
    return res.json({ hsp: Math.round(hsp * 100) / 100, fuente: 'IA integrada', detalle: parsed.justificacion || '' });
  } catch (error) {
    console.warn(`No fue posible calcular HSP con IA para ${municipio}, ${departamento}:`, error.message);
    return res.json({ hsp: fallback, fuente: 'estimación regional', detalle: 'Se aplicó un valor regional de respaldo.' });
  }
});

// ══════════════════════════════════════════
//  DIMENSIONING
// ══════════════════════════════════════════

router.post('/dimensionar', async (req, res) => {
  try {
    const d = req.body;
    const [panels] = await pool.execute("SELECT * FROM equipos WHERE id = ? AND categoria = 'panel' AND (empresa_id = ? OR ? = 1)", [d.panel_id, req.user.empresa_id, req.user.es_superadmin ? 1 : 0]);
    if (panels.length === 0) return res.status(404).json({ detail: 'Panel no encontrado' });
    const panel = panels[0];

    // Sanitize all numeric inputs — MySQL2 returns DECIMALs as strings and values can be null
    const consumoMensual = parseFloat(d.consumo_mensual_kwh) || 0;
    const costoKwh = parseFloat(d.costo_kwh) || 0;
    const hsp = parseFloat(d.hsp) || 4.2;
    const cargasEsp = parseFloat(d.cargas_especiales_kwh_dia) || 0;
    const panelWp = parseFloat(panel.potencia_wp) || 1; // avoid division by zero
    const panelArea = parseFloat(panel.area_m2) || 2.5;
    const panelPeso = parseFloat(panel.peso_kg) || 30;

    let eficiencia = parseFloat(d.eficiencia) || 0.82;
    if (eficiencia === 0.82) {
      const configEf = await getConfigValue('eficiencia_sistema', 0.82);
      eficiencia = parseFloat(configEf) || 0.82;
    }

    const consumoDiario = (consumoMensual / 30) + cargasEsp;
    const potenciaKwp = (hsp * eficiencia) > 0 ? consumoDiario / (hsp * eficiencia) : 0;
    const numPaneles = panelWp > 0 ? Math.ceil(potenciaKwp * 1000 / panelWp) : 0;
    const potenciaRealKwp = Math.round((numPaneles * panelWp) / 1000 * 100) / 100;
    const produccionDiaria = Math.round(numPaneles * panelWp * hsp * eficiencia / 1000 * 100) / 100;
    const produccionMensual = Math.round(produccionDiaria * 30 * 100) / 100;
    // Panel footprint plus 10% for spacing, access and installation clearances.
    const areaRequerida = Math.round(numPaneles * panelArea * 1.10 * 10) / 10;
    const pesoTotal = Math.round(numPaneles * panelPeso * 10) / 10;

    let inversorSugerido = null;
    if (d.inversor_id) {
      const [invs] = await pool.execute("SELECT * FROM equipos WHERE id = ? AND categoria = 'inversor' AND (empresa_id = ? OR ? = 1)", [d.inversor_id, req.user.empresa_id, req.user.es_superadmin ? 1 : 0]);
      if (invs.length > 0) inversorSugerido = invs[0];
    }
    if (!inversorSugerido) {
      const [invs] = await pool.execute(
        "SELECT * FROM equipos WHERE categoria = 'inversor' AND activo = 1 AND potencia_kw >= ? AND (empresa_id = ? OR ? = 1) ORDER BY potencia_kw ASC LIMIT 1",
        [potenciaRealKwp, req.user.empresa_id, req.user.es_superadmin ? 1 : 0]
      );
      if (invs.length > 0) inversorSugerido = invs[0];
    }

    res.json({
      consumo_diario_kwh: Math.round(consumoDiario * 100) / 100,
      potencia_kwp: potenciaRealKwp,
      potencia_kwp_teorica: Math.round(potenciaKwp * 100) / 100,
      num_paneles: numPaneles,
      panel,
      inversor_sugerido: inversorSugerido,
      produccion_diaria_kwh: produccionDiaria,
      produccion_mensual_kwh: produccionMensual,
      produccion_anual_kwh: Math.round(produccionMensual * 12 * 100) / 100,
      area_requerida_m2: areaRequerida,
      peso_total_kg: pesoTotal,
      eficiencia_usada: eficiencia,
      hsp: hsp,
      consumo_mensual_kwh: consumoMensual,
      cobertura_pct: consumoMensual > 0 ? Math.round(produccionMensual / consumoMensual * 1000) / 10 : 0
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ detail: 'Error del servidor' });
  }
});

// ══════════════════════════════════════════
//  FINANCIAL ANALYSIS
// ══════════════════════════════════════════

router.post('/calcular-financiero', async (req, res) => {
  try {
    const d = req.body;
    const produccionMensual = parseFloat(d.produccion_mensual_kwh) || 0;
    const consumoMensual = parseFloat(d.consumo_mensual_kwh) || 0;
    const costoKwh = parseFloat(d.costo_kwh) || 0;
    const totalInversion = parseFloat(d.total_inversion) || 0;
    const deduccionRentaPct = parseFloat(d.deduccion_renta_pct) || 50;
    const tasaImpositiva = parseFloat(d.tasa_impositiva) || 33;
    const degradacionAnual = parseFloat(d.degradacion_anual_pct) || 0.74;
    const inflacionTarifa = parseFloat(d.inflacion_tarifa_pct) || 10;
    const aomAnual = parseFloat(d.aom_anual) || 0;
    const aomIncremento = parseFloat(d.aom_incremento_pct) || 5;
    const precioExcedente = (d.precio_excedente_kwh && parseFloat(d.precio_excedente_kwh) > 0)
      ? parseFloat(d.precio_excedente_kwh)
      : Math.round(costoKwh * 0.30); // ~30% del costo comercial

    // 1. Autoconsumo vs Excedentes
    let kwhAutoMes = Math.min(produccionMensual, consumoMensual);
    let kwhExcMes = Math.max(0, produccionMensual - consumoMensual);

    if (d.pct_autoconsumo !== undefined && parseFloat(d.pct_autoconsumo) < 100) {
      const pctAuto = parseFloat(d.pct_autoconsumo) || 100;
      kwhAutoMes = produccionMensual * (pctAuto / 100);
      kwhExcMes = produccionMensual * (1 - pctAuto / 100);
    }

    const ahorroAutoMes = Math.round(kwhAutoMes * costoKwh);
    const ingresoExcMes = Math.round(kwhExcMes * precioExcedente);
    const ahorroMensual = ahorroAutoMes + ingresoExcMes;
    const ahorroAnual = ahorroMensual * 12;

    const roiSinInc = ahorroMensual > 0 ? Math.round(totalInversion / ahorroMensual * 10) / 10 : 999;

    // Scenario 2: With Tax Incentives (Law 1715)
    const deduccionRenta = totalInversion * (deduccionRentaPct / 100);
    const beneficioFiscal = deduccionRenta * (tasaImpositiva / 100);
    const inversionNeta = totalInversion - beneficioFiscal;
    const roiConInc = ahorroMensual > 0 ? Math.round(inversionNeta / ahorroMensual * 10) / 10 : 999;

    // 25-Year Projection
    const proyeccion = [];
    let saldoS1 = totalInversion, saldoS2 = inversionNeta;
    let acumS1 = 0, acumS2 = beneficioFiscal;
    let costoTotalAom = 0, valorTotalEnergia = 0, valorTotalAutoconsumo = 0, valorTotalExcedentes = 0;
    const deg = degradacionAnual / 100;
    const inf = inflacionTarifa / 100;
    const aomInc = aomIncremento / 100;

    const ratioAuto = produccionMensual > 0 ? (kwhAutoMes / produccionMensual) : 1;
    const ratioExc = produccionMensual > 0 ? (kwhExcMes / produccionMensual) : 0;

    for (let anio = 1; anio <= 25; anio++) {
      const energiaAnual = Math.round(produccionMensual * 12 * Math.pow(1 - deg, anio - 1) * 10) / 10;
      const precioKwhAnio = Math.round(costoKwh * Math.pow(1 + inf, anio - 1) * 100) / 100;
      const precioExcAnio = Math.round(precioExcedente * Math.pow(1 + inf, anio - 1) * 100) / 100;
      const aomAnio = aomAnual > 0 ? Math.round(aomAnual * Math.pow(1 + aomInc, anio - 1)) : 0;

      const valorAuto = Math.round(energiaAnual * ratioAuto * precioKwhAnio);
      const valorExc = Math.round(energiaAnual * ratioExc * precioExcAnio);
      const valorEnergia = valorAuto + valorExc;

      const flujoNeto = valorEnergia - aomAnio;
      saldoS1 -= flujoNeto; saldoS2 -= flujoNeto;
      acumS1 += flujoNeto; acumS2 += flujoNeto;
      costoTotalAom += aomAnio;
      valorTotalAutoconsumo += valorAuto;
      valorTotalExcedentes += valorExc;
      valorTotalEnergia += valorEnergia;

      proyeccion.push({
        anio, energia_kwh: energiaAnual, precio_kwh: precioKwhAnio, precio_exc: precioExcAnio,
        valor_autoconsumo: valorAuto, valor_excedentes: valorExc,
        aom: aomAnio, valor_energia: valorEnergia, flujo_neto: Math.round(flujoNeto),
        saldo_inversion_s1: Math.round(saldoS1), saldo_inversion_s2: Math.round(saldoS2),
        ahorro_acumulado_s1: Math.round(acumS1), ahorro_acumulado_s2: Math.round(acumS2)
      });
    }

    const ahorroNeto25 = valorTotalEnergia - totalInversion - costoTotalAom;

    res.json({
      simulacion_excedentes: {
        precio_excedente_kwh: precioExcedente,
        kwh_autoconsumo_mes: Math.round(kwhAutoMes),
        kwh_excedentes_mes: Math.round(kwhExcMes),
        ahorro_autoconsumo_mes: ahorroAutoMes,
        ingreso_excedentes_mes: ingresoExcMes,
        beneficio_total_mes: ahorroMensual,
        beneficio_total_anual: ahorroAnual
      },
      escenario_1: {
        titulo: 'Sin Incentivos Tributarios (Ahorro + Excedentes)',
        ahorro_mensual: Math.round(ahorroMensual), ahorro_anual: Math.round(ahorroAnual),
        roi_meses: roiSinInc, roi_anos: Math.round(roiSinInc / 12 * 10) / 10
      },
      escenario_2: {
        titulo: 'Con Incentivos Tributarios (Ahorro + Excedentes + Ley 1715)',
        deduccion_renta: Math.round(deduccionRenta), beneficio_fiscal: Math.round(beneficioFiscal),
        inversion_neta: Math.round(inversionNeta),
        ahorro_mensual: Math.round(ahorroMensual), ahorro_anual: Math.round(ahorroAnual),
        roi_meses: roiConInc, roi_anos: Math.round(roiConInc / 12 * 10) / 10
      },
      resumen_25_anos: {
        inversion_inicial: Math.round(totalInversion), costo_total_aom: Math.round(costoTotalAom),
        valor_total_autoconsumo: Math.round(valorTotalAutoconsumo),
        valor_total_excedentes: Math.round(valorTotalExcedentes),
        valor_total_energia: Math.round(valorTotalEnergia), ahorro_neto_25: Math.round(ahorroNeto25),
        roi_total_pct: totalInversion > 0 ? Math.round((valorTotalEnergia / totalInversion * 100 - 100) * 10) / 10 : 0
      },
      proyeccion
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ detail: 'Error del servidor' });
  }
});

// ══════════════════════════════════════════
//  CRUD COTIZACIONES
// ══════════════════════════════════════════

// ── List ──
router.get('/', async (req, res) => {
  try {
    const { buscar, estado, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let where = '(c.empresa_id = ? OR ? = 1)', params = [req.user.empresa_id, req.user.es_superadmin ? 1 : 0];

    if (buscar) {
      where += ' AND (cl.nombre LIKE ? OR c.codigo LIKE ?)';
      const s = `%${buscar}%`; params.push(s, s);
    }
    if (estado) { where += ' AND c.estado = ?'; params.push(estado); }

    const [[{total}]] = await pool.execute(
      `SELECT COUNT(*) as total FROM cotizaciones c LEFT JOIN clientes cl ON c.cliente_id = cl.id WHERE ${where}`, params
    );

    params.push(parseInt(limit), offset);
    const [rows] = await pool.execute(
      `SELECT c.*, cl.nombre as cliente_nombre, cl.ciudad as cliente_ciudad
       FROM cotizaciones c LEFT JOIN clientes cl ON c.cliente_id = cl.id
       WHERE ${where} ORDER BY c.fecha DESC LIMIT ? OFFSET ?`, params
    );

    res.json({ data: rows, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ detail: 'Error del servidor' });
  }
});

// ── Get by ID ──
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await pool.execute(`
      SELECT c.*, cl.nombre as cliente_nombre, cl.cedula_nit as cliente_cedula,
      cl.direccion as cliente_direccion, cl.telefono as cliente_telefono,
      cl.correo as cliente_correo, cl.ciudad as cliente_ciudad,
      cl.empresa_id as cliente_empresa_id,
      cl.operador_red as cliente_operador, cl.tipo_tarifa as cliente_tarifa,
      cl.consumo_mensual_kwh as cliente_consumo, cl.costo_kwh as cliente_costo_kwh,
      cl.hsp as cliente_hsp, cl.historial_consumo as cliente_historial
      FROM cotizaciones c LEFT JOIN clientes cl ON c.cliente_id = cl.id
      WHERE c.id = ? AND (c.empresa_id = ? OR (c.empresa_id IS NULL AND cl.empresa_id = ?) OR ? = 1)
    `, [req.params.id, req.user.empresa_id, req.user.empresa_id, req.user.es_superadmin ? 1 : 0]);

    if (rows.length === 0) return res.status(404).json({ detail: 'Cotización no encontrada' });
    const cot = rows[0];
    const empresaDelCliente = Number(cot.cliente_empresa_id) || null;
    const empresaDeLaCotizacion = Number(cot.empresa_id) || null;
    const empresaDeLaSesion = Number(req.user?.empresa_id) || null;
    const empresaResuelta = empresaDeLaCotizacion || empresaDelCliente || empresaDeLaSesion || 1;

    // Las cotizaciones antiguas pueden no tener empresa_id. Se repara usando
    // la empresa del cliente para que el documento no tome la configuración de
    // otra compañía por el valor predeterminado 1.
    if (!empresaDeLaCotizacion && empresaResuelta) {
      cot.empresa_id = empresaResuelta;
      await pool.execute('UPDATE cotizaciones SET empresa_id = ? WHERE id = ? AND (empresa_id IS NULL OR empresa_id = 0)', [empresaResuelta, req.params.id]);
    }
    delete cot.cliente_empresa_id;

    if (cot.cliente_historial) {
      let h = cot.cliente_historial;
      while (typeof h === 'string') {
        try {
          const p = JSON.parse(h);
          if (p === h) break;
          h = p;
        } catch { break; }
      }
      cot.cliente_historial = Array.isArray(h) ? h : [];
    }

    // Load related equipment
    if (cot.panel_id) { const [p] = await pool.execute('SELECT * FROM equipos WHERE id = ?', [cot.panel_id]); cot.panel = p[0] || null; }
    if (cot.inversor_id) { const [i] = await pool.execute('SELECT * FROM equipos WHERE id = ?', [cot.inversor_id]); cot.inversor = i[0] || null; }
    if (cot.bateria_id) { const [b] = await pool.execute('SELECT * FROM equipos WHERE id = ?', [cot.bateria_id]); cot.bateria = b[0] || null; }

    // Parse JSON fields
    ['items_json', 'proyeccion_25_json', 'cronograma_json'].forEach(field => {
      if (cot[field] && typeof cot[field] === 'string') {
        try { cot[field] = JSON.parse(cot[field]); } catch { cot[field] = []; }
      }
    });

    // En propuestas de suministro, cargar también las fichas de los equipos
    // seleccionados como ítems para poder conservar sus fotografías en el PDF.
    if (cot.items_json && Array.isArray(cot.items_json.items)) {
      const equipoIds = [...new Set(cot.items_json.items
        .map(item => Number(item.equipo_id))
        .filter(Number.isInteger))];
      if (equipoIds.length > 0) {
        const placeholders = equipoIds.map(() => '?').join(',');
        const [equipos] = await pool.execute(
          `SELECT * FROM equipos WHERE id IN (${placeholders})`,
          equipoIds
        );
        const equiposById = new Map(equipos.map(equipo => [Number(equipo.id), equipo]));
        cot.items_json.items = cot.items_json.items.map(item => ({
          ...item,
          equipo: equiposById.get(Number(item.equipo_id)) || null
        }));
      }
    }

    // Recalculate the stored footprint with the current panel dimensions so older
    // proposals do not keep an obsolete area value.
    if (cot.panel && Number(cot.num_paneles) > 0 && Number(cot.panel.area_m2) > 0) {
      const currentArea = Math.round(Number(cot.num_paneles) * Number(cot.panel.area_m2) * 1.10 * 10) / 10;
      if (Number(cot.area_requerida_m2) !== currentArea) {
        cot.area_requerida_m2 = currentArea;
        await pool.execute('UPDATE cotizaciones SET area_requerida_m2=? WHERE id=?', [currentArea, req.params.id]);
      }
    }

    // Repair projections saved by older cotizaciones when the client's tariff was
    // not included in the calculation payload. This keeps the preview/PDF useful
    // and ensures the financial table uses the current client tariff.
    const storedProjection = cot.proyeccion_25_json;
    const storedTariff = storedProjection?.[0]?.precio_kwh;
    const tarifaCliente = Number(cot.cliente_costo_kwh) || 0;
    const tarifaGuardada = Number(storedTariff) || 0;
    const produccionReparada = calcularProduccionDesdeCotizacion(cot);
    if (produccionReparada) {
      cot.produccion_diaria_kwh = produccionReparada.diaria;
      cot.produccion_mensual_kwh = produccionReparada.mensual;
      await pool.execute(
        'UPDATE cotizaciones SET produccion_diaria_kwh=?, produccion_mensual_kwh=? WHERE id=?',
        [cot.produccion_diaria_kwh, cot.produccion_mensual_kwh, req.params.id]
      );
    }

    // Si la producción quedó guardada en cero, la proyección completa también
    // queda en cero y el retorno termina mostrándose como 83,3 años (999 meses).
    // Reconstruimos las 25 anualidades usando la producción recuperada y la
    // tarifa actual del cliente. Esto también funciona si la proyección estaba
    // vacía o tenía una tarifa antigua.
    const necesitaReconstruirProyeccion = Boolean(produccionReparada) || !tarifaGuardada;
    const hayDatosParaReconstruir = Boolean(produccionReparada)
      || (Array.isArray(storedProjection) && storedProjection.length > 0);
    if (hayDatosParaReconstruir && necesitaReconstruirProyeccion && (tarifaCliente > 0 || tarifaGuardada > 0)) {
      const production = Number(cot.produccion_mensual_kwh) || 0;
      const consumption = Number(cot.cliente_consumo) || 0;
      const tariff = tarifaCliente || tarifaGuardada;
      const pctAuto = Math.min(100, Math.max(0, Number(cot.pct_autoconsumo) || 100));
      const autoRatio = production > 0 ? (Math.min(production, consumption) / production) : 1;
      const ratioAuto = pctAuto < 100 ? pctAuto / 100 : autoRatio;
      const ratioExc = Math.max(0, 1 - ratioAuto);
      const degradation = (Number(cot.degradacion_anual_pct) || 0.74) / 100;
      const inflation = (Number(cot.inflacion_tarifa_pct) || 10) / 100;
      const excPrice = Number(cot.precio_excedente_kwh) || Math.round(tariff * 0.3);
      const investment = Number(cot.total_inversion) || 0;
      const taxBenefit = investment * ((Number(cot.deduccion_renta_pct) || 50) / 100) * 0.33;
      const aomBase = Number(cot.aom_anual) || 0;
      const aomIncrease = (Number(cot.aom_incremento_pct) || 5) / 100;
      let accumulated1 = 0;
      let accumulated2 = taxBenefit;
      let balance1 = investment;
      let balance2 = investment - taxBenefit;
      let rebuilt = [];
      for (let year = 1; year <= 25; year++) {
        const energy = Math.round(production * 12 * Math.pow(1 - degradation, year - 1) * 10) / 10;
        const yearTariff = Math.round(tariff * Math.pow(1 + inflation, year - 1) * 100) / 100;
        const yearExc = Math.round(excPrice * Math.pow(1 + inflation, year - 1) * 100) / 100;
        const aom = aomBase > 0 ? Math.round(aomBase * Math.pow(1 + aomIncrease, year - 1)) : 0;
        const autoValue = Math.round(energy * ratioAuto * yearTariff);
        const excValue = Math.round(energy * ratioExc * yearExc);
        const energyValue = autoValue + excValue;
        const netFlow = energyValue - aom;
        balance1 -= netFlow; balance2 -= netFlow;
        accumulated1 += netFlow; accumulated2 += netFlow;
        rebuilt.push({ anio: year, energia_kwh: energy, precio_kwh: yearTariff, precio_exc: yearExc,
          valor_autoconsumo: autoValue, valor_excedentes: excValue, aom,
          valor_energia: energyValue, flujo_neto: Math.round(netFlow),
          saldo_inversion_s1: Math.round(balance1), saldo_inversion_s2: Math.round(balance2),
          ahorro_acumulado_s1: Math.round(accumulated1), ahorro_acumulado_s2: Math.round(accumulated2) });
      }
      cot.proyeccion_25_json = rebuilt;
      const monthlySavings = Math.round((production * ratioAuto * tariff) + (production * ratioExc * excPrice));
      cot.ahorro_mensual = monthlySavings;
      cot.ahorro_anual = monthlySavings * 12;
      cot.roi_sin_incentivos_meses = monthlySavings > 0 ? Math.round(investment / monthlySavings * 10) / 10 : 999;
      cot.roi_con_incentivos_meses = monthlySavings > 0 ? Math.round((investment - taxBenefit) / monthlySavings * 10) / 10 : 999;
      await pool.execute(
        'UPDATE cotizaciones SET ahorro_mensual=?, ahorro_anual=?, roi_sin_incentivos_meses=?, roi_con_incentivos_meses=?, proyeccion_25_json=? WHERE id=?',
        [cot.ahorro_mensual, cot.ahorro_anual, cot.roi_sin_incentivos_meses, cot.roi_con_incentivos_meses, JSON.stringify(rebuilt), req.params.id]
      );
    }

    // Reparar el sentinel 999 meses cuando la proyección guardada ya contiene
    // energía valorizada. Esto corrige propuestas existentes sin obligar a
    // editarlas y evita mostrar falsamente retornos de 83 años.
    const roiActualSin = Number(cot.roi_sin_incentivos_meses);
    const roiActualCon = Number(cot.roi_con_incentivos_meses);
    if (roiActualSin >= 999 || roiActualCon >= 999) {
      const roiReparado = calcularRoiDesdeProyeccion(cot);
      if (roiReparado) {
        cot.ahorro_mensual = roiReparado.ahorroMensual;
        cot.ahorro_anual = roiReparado.ahorroAnual;
        cot.roi_sin_incentivos_meses = roiReparado.roiSinIncentivosMeses;
        cot.roi_con_incentivos_meses = roiReparado.roiConIncentivosMeses;
        await pool.execute(
          'UPDATE cotizaciones SET ahorro_mensual=?, ahorro_anual=?, roi_sin_incentivos_meses=?, roi_con_incentivos_meses=? WHERE id=?',
          [cot.ahorro_mensual, cot.ahorro_anual, cot.roi_sin_incentivos_meses, cot.roi_con_incentivos_meses, req.params.id]
        );
      }
    }

    // Load company config
    // Un administrador siempre ve la identidad de su propia empresa. El
    // superadmin y el renderizador PDF conservan la empresa de la cotización.
    const empId = (!req.user?.es_superadmin && !req.user?.pdf_render && empresaDeLaSesion)
      ? empresaDeLaSesion
      : empresaResuelta;
    const [companyRows] = await pool.execute('SELECT nombre FROM empresas WHERE id = ?', [empId]);
    const companyName = companyRows[0]?.nombre || 'Plantas Solares de Colombia';
    const [configRows] = await pool.execute("SELECT clave, valor FROM configuracion WHERE empresa_id = ? AND (clave LIKE 'empresa_%' OR clave LIKE 'diseno_%')", [empId]);
    cot.empresa = {};
    configRows.forEach(r => {
      cot.empresa[r.clave] = r.clave === 'empresa_logo'
        ? resolverLogo(r.valor, companyName)
        : r.valor;
    });
    if (!cot.empresa.empresa_logo) cot.empresa.empresa_logo = resolverLogo('', companyName);

    // Load advisor & terms config
    const [asesorRows] = await pool.execute("SELECT clave, valor FROM configuracion WHERE empresa_id = ? AND (clave LIKE 'asesor_%' OR clave = 'firma_asesor' OR clave = 'terminos_condiciones')", [empId]);
    cot.asesor = {};
    asesorRows.forEach(r => { cot.asesor[r.clave] = r.valor; });
    // Protección adicional para documentos en producción mientras termina la
    // normalización de una base que pudo haber heredado datos de DRU.
    if (esEmpresaPlantas(companyName)) {
      const asesorContaminado = [
        cot.asesor.asesor_nombre,
        cot.asesor.asesor_telefono,
        cot.asesor.asesor_correo
      ].some(parecePerfilDru);
      if (asesorContaminado) Object.assign(cot.asesor, PLANTAS_ASESOR_POR_DEFECTO);
      if (parecePerfilDru(cot.asesor.terminos_condiciones)) {
        cot.asesor.terminos_condiciones = PLANTAS_TERMINOS_POR_DEFECTO;
      }
    }

    res.json(cot);
  } catch (error) {
    console.error(error);
    res.status(500).json({ detail: 'Error del servidor' });
  }
});

// ── PDF generator (legacy, used as fallback when Chrome unavailable) ──
async function generateLegacyPDF(req, res) {
  try {
    const [rows] = await pool.execute(`
      SELECT c.*, cl.nombre as cliente_nombre, cl.cedula_nit as cliente_cedula,
             cl.direccion as cliente_direccion, cl.telefono as cliente_telefono,
             cl.correo as cliente_correo, cl.ciudad as cliente_ciudad,
             cl.costo_kwh as cliente_costo_kwh, cl.hsp as cliente_hsp
      FROM cotizaciones c
      LEFT JOIN clientes cl ON c.cliente_id = cl.id
      WHERE c.id = ?
    `, [req.params.id]);
    if (!rows.length) return res.status(404).json({ detail: 'Cotización no encontrada' });

    const cotizacion = rows[0];
    const parseJson = (value, fallback) => {
      if (!value) return fallback;
      try { return typeof value === 'string' ? JSON.parse(value) : value; } catch { return fallback; }
    };
    const itemData = parseJson(cotizacion.items_json, {});
    const items = Array.isArray(itemData) ? itemData : (itemData.items || []);
    const proyeccion = parseJson(cotizacion.proyeccion_25_json, []);
    const configRows = await pool.execute("SELECT clave, valor FROM configuracion WHERE empresa_id = ? AND (clave LIKE 'empresa_%' OR clave LIKE 'terminos%' OR clave = 'terminos_condiciones')", [cotizacion.empresa_id || 1]);
    const config = (configRows[0] || []).reduce((acc, row) => { acc[row.clave] = row.valor; return acc; }, {});
    const money = value => `$ ${Math.round(Number(value) || 0).toLocaleString('es-CO')}`;
    const number = (value, decimals = 1) => (Number(value) || 0).toLocaleString('es-CO', { maximumFractionDigits: decimals });
    const text = value => String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

    res.status(200);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="propuesta_${cotizacion.id}.pdf"`);
    const doc = new PDFDocument({ size: 'A4', margin: 48, bufferPages: true, info: { Title: `Propuesta ${cotizacion.codigo || cotizacion.id}`, Author: config.empresa_nombre || 'Plantas Solares de Colombia' } });
    doc.pipe(res);

    const gold = '#d4a800';
    const dark = '#202020';
    const gray = '#666666';
    const line = () => { doc.moveTo(48, doc.y).lineTo(547, doc.y).strokeColor('#dddddd').stroke(); doc.moveDown(0.8); };
    const section = title => { doc.moveDown(0.7).fontSize(11).fillColor(dark).font('Helvetica-Bold').text(title.toUpperCase()); doc.moveDown(0.25).strokeColor(gold).lineWidth(2).moveTo(48, doc.y).lineTo(180, doc.y).stroke().lineWidth(1); doc.moveDown(0.6); };

    doc.fillColor(gold).rect(48, 40, 499, 5).fill();
    doc.moveDown(1.2).fontSize(20).fillColor(dark).font('Helvetica-Bold').text(text(config.empresa_nombre || 'Plantas Solares de Colombia'));
    doc.fontSize(9).fillColor(gray).font('Helvetica').text(text(config.empresa_direccion || 'Propuesta comercial de sistema fotovoltaico'));
    doc.text(text(config.empresa_telefono || config.empresa_correo || ''));
    doc.moveDown(0.6).fontSize(17).fillColor(gold).font('Helvetica-Bold').text('PROPUESTA COMERCIAL', { align: 'right' });
    doc.fontSize(10).fillColor(dark).font('Helvetica').text(`Código: ${text(cotizacion.codigo || `PROP-${cotizacion.id}`)}`, { align: 'right' });
    doc.text(`Fecha: ${text(cotizacion.fecha || new Date().toISOString().slice(0, 10))}`, { align: 'right' });
    line();

    section('Cliente');
    doc.fontSize(11).fillColor(dark).font('Helvetica-Bold').text(text(cotizacion.cliente_nombre || 'Cliente'));
    doc.fontSize(9).fillColor(gray).font('Helvetica').text(`NIT/Cédula: ${text(cotizacion.cliente_cedula || '-')}`);
    doc.text(`Ciudad: ${text(cotizacion.cliente_ciudad || '-')}    Teléfono: ${text(cotizacion.cliente_telefono || '-')}`);
    doc.text(`Correo: ${text(cotizacion.cliente_correo || '-')}`);

    section('Resumen técnico');
    doc.fontSize(10).fillColor(dark).font('Helvetica');
    doc.text(`Potencia del sistema: ${number(cotizacion.potencia_kwp, 2)} kWp`);
    doc.text(`Paneles: ${number(cotizacion.num_paneles, 0)}    Producción estimada: ${number(cotizacion.produccion_mensual_kwh, 1)} kWh/mes`);
    doc.text(`Área requerida: ${number(cotizacion.area_requerida_m2, 1)} m2    Peso total: ${number(cotizacion.peso_total_kg, 1)} kg`);

    section('Desglose de inversión');
    doc.font('Helvetica-Bold').fontSize(9).text('Ítem', 48, doc.y, { width: 240, continued: true });
    doc.text('Cantidad', 288, doc.y, { width: 70, continued: true, align: 'right' });
    doc.text('Total', 400, doc.y, { width: 147, align: 'right' });
    doc.moveDown(0.3);
    doc.font('Helvetica').fontSize(9);
    for (const item of items) {
      const name = text(item.nombre || item.descripcion || item.modelo || item.marca || 'Equipo');
      const qty = item.cantidad ?? item.quantity ?? 1;
      const total = item.total ?? item.subtotal ?? ((item.precio_venta || item.precio || item.price || 0) * qty);
      doc.text(name.slice(0, 72), 48, doc.y, { width: 240, continued: true });
      doc.text(number(qty, 0), 288, doc.y, { width: 70, continued: true, align: 'right' });
      doc.text(money(total), 400, doc.y, { width: 147, align: 'right' });
      doc.moveDown(0.25);
    }
    line();
    doc.font('Helvetica-Bold').fontSize(11).text(`Subtotal: ${money(cotizacion.subtotal)}`, { align: 'right' });
    doc.text(`Inversión total: ${money(cotizacion.total_inversion)}`, { align: 'right' });

    section('Ahorro y retorno');
    doc.font('Helvetica').fontSize(10).text(`Ahorro mensual estimado: ${money(cotizacion.ahorro_mensual)}`);
    doc.text(`Ahorro anual estimado: ${money(cotizacion.ahorro_anual)}`);
    doc.text(`Retorno sin incentivos: ${number(cotizacion.roi_sin_incentivos_meses, 1)} meses`);
    doc.text(`Retorno con incentivos: ${number(cotizacion.roi_con_incentivos_meses, 1)} meses`);

    if (proyeccion.length) {
      section('Proyección a 25 años');
      const last = proyeccion[proyeccion.length - 1];
      doc.text(`Energía acumulada estimada: ${number(proyeccion.reduce((sum, row) => sum + (Number(row.energia_kwh) || 0), 0), 0)} kWh`);
      doc.text(`Ahorro acumulado al año 25: ${money(last.ahorro_acumulado_s1 || last.ahorro_acumulado_s2)}`);
    }
    const terminosKeys = Object.keys(config).filter(k => /terminos|condiciones|notas/i.test(k));
    let terminos = '';
    if (terminosKeys.length > 0) { terminos = config[terminosKeys[0]]; }
    else { terminos = cotizacion.notas || ''; }
    if (terminos.trim()) { section('Notas'); doc.font('Helvetica').fontSize(9).text(text(terminos)); }
    doc.moveDown(1.5).fontSize(8).fillColor(gray).text('Documento generado por Plantas Solares de Colombia. Valores sujetos a verificación técnica y comercial.', { align: 'center' });

    const range = doc.bufferedPageRange();
    for (let page = range.start; page < range.start + range.count; page++) {
      doc.switchToPage(page);
      doc.fontSize(8).fillColor(gray).text(`Página ${page - range.start + 1} de ${range.count}`, 48, 790, { align: 'right', width: 499 });
    }
    doc.end();
  } catch (error) {
    console.error('Error generando PDF:', error);
    if (!res.headersSent) res.status(500).json({ detail: 'No se pudo generar el PDF' });
  }
}

// ── Download PDF (Puppeteer exact rendering, legacy fallback) ──
router.get('/:id/pdf-download', async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT id FROM cotizaciones WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ detail: 'Cotización no encontrada' });

    const pdfToken = createPdfToken(req.params.id);
    const previewUrl = `${req.protocol}://${req.get('host')}/pdf/${encodeURIComponent(req.params.id)}?pdf=1&pdf_token=${encodeURIComponent(pdfToken)}`;

    const browser = await puppeteer.launch({
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
    });
    const page = await browser.newPage();
    await page.goto(previewUrl, { waitUntil: 'networkidle2', timeout: 35000 });
    await page.evaluate(async () => {
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
      let count = 0;
      while (!window.pdfRenderFinished && count < 40) {
        await new Promise(r => setTimeout(r, 100));
        count++;
      }
    });
    await new Promise(r => setTimeout(r, 1500));
    const pdfBuffer = Buffer.from(await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      margins: { top: 0, right: 0, bottom: 0, left: 0 }
    }));
    await browser.close();

    if (!pdfBuffer || pdfBuffer.toString().slice(0, 5) !== '%PDF-') {
      throw new Error('El renderizador no produjo un PDF válido');
    }
    res.status(200);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="propuesta_${req.params.id}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.end(pdfBuffer);
  } catch (error) {
    console.error('Puppeteer no disponible o falló:', error.message);
    if (!res.headersSent) {
      res.status(503).json({
        detail: 'El servidor requiere la vista interactiva para generar el PDF con diseño exacto.',
        fallback_print_url: `/pdf/${req.params.id}?print=1`
      });
    }
  }
});

// ── Create ──
router.post('/', async (req, res) => {
  try {
    const d = req.body;
    const [clients] = await pool.execute('SELECT id FROM clientes WHERE id = ? AND (empresa_id = ? OR ? = 1)', [d.cliente_id, req.user.empresa_id, req.user.es_superadmin ? 1 : 0]);
    if (clients.length === 0) return res.status(404).json({ detail: 'Cliente no encontrado' });

    const codigo = await generateCodigo();

    let cronograma = d.cronograma_json || '[]';
    if (cronograma === '[]') {
      const empId = req.user.es_superadmin ? (d.empresa_id || req.user.empresa_id || 1) : (req.user.empresa_id || 1);
      const pagoAnticipo = await getConfigValue('pago_anticipo_pct', 60, empId);
      const pagoEntrega = await getConfigValue('pago_contraentrega_pct', 40, empId);
      cronograma = JSON.stringify([
        { semana: 1, actividad: 'Firma de contrato y anticipo', hito_pago: `${Math.trunc(pagoAnticipo)}% anticipo`, completado: false },
        { semana: 1, actividad: 'Compra de equipos y materiales', hito_pago: '', completado: false },
        { semana: 2, actividad: 'Diseño eléctrico y memorias de cálculo', hito_pago: '', completado: false },
        { semana: 2, actividad: 'Trámites ante operador de red', hito_pago: '', completado: false },
        { semana: 3, actividad: 'Instalación de estructura y paneles', hito_pago: '', completado: false },
        { semana: 3, actividad: 'Instalación eléctrica e inversor', hito_pago: '', completado: false },
        { semana: 4, actividad: 'Pruebas, puesta en marcha y certificación', hito_pago: '', completado: false },
        { semana: 4, actividad: 'Entrega y capacitación', hito_pago: `${Math.trunc(pagoEntrega)}% contra entrega`, completado: false }
      ]);
    }

    const [result] = await pool.execute(
      `INSERT INTO cotizaciones (codigo, cliente_id, empresa_id, potencia_kwp, num_paneles, panel_id,
        inversor_id, bateria_id, num_baterias, produccion_diaria_kwh, produccion_mensual_kwh,
        area_requerida_m2, peso_total_kg, items_json, subtotal, margen_comercial_pct,
        total_inversion, ahorro_mensual, ahorro_anual, roi_sin_incentivos_meses,
        roi_con_incentivos_meses, deduccion_renta_pct, degradacion_anual_pct,
        inflacion_tarifa_pct, aom_anual, aom_incremento_pct, pct_autoconsumo,
        precio_excedente_kwh, proyeccion_25_json, cronograma_json, notas)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [codigo, d.cliente_id, req.user.es_superadmin ? (d.empresa_id || req.user.empresa_id) : req.user.empresa_id, d.potencia_kwp || 0, d.num_paneles || 0, d.panel_id,
       d.inversor_id, d.bateria_id || null, d.num_baterias || 0, d.produccion_diaria_kwh || 0,
       d.produccion_mensual_kwh || 0, d.area_requerida_m2 || 0, d.peso_total_kg || 0,
       d.items_json || '[]', d.subtotal || 0, d.margen_comercial_pct || 30, d.total_inversion || 0,
       d.ahorro_mensual || 0, d.ahorro_anual || 0, d.roi_sin_incentivos_meses || 0,
       d.roi_con_incentivos_meses || 0, d.deduccion_renta_pct || 50, d.degradacion_anual_pct || 0.74,
       d.inflacion_tarifa_pct || 10, d.aom_anual || 0, d.aom_incremento_pct || 5,
       d.pct_autoconsumo || 100, d.precio_excedente_kwh || 0, d.proyeccion_25_json || '[]',
       cronograma, d.notas || '']
    );

    res.json({ id: result.insertId, codigo, message: 'Cotización creada exitosamente' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ detail: 'Error del servidor' });
  }
});

// ── Update ──
router.put('/:id', async (req, res) => {
  try {
    const [existing] = await pool.execute('SELECT id FROM cotizaciones WHERE id = ? AND (empresa_id = ? OR ? = 1)', [req.params.id, req.user.empresa_id, req.user.es_superadmin ? 1 : 0]);
    if (existing.length === 0) return res.status(404).json({ detail: 'Cotización no encontrada' });

    const d = req.body;
    await pool.execute(
      `UPDATE cotizaciones SET cliente_id=?, estado=?, potencia_kwp=?, num_paneles=?,
       panel_id=?, inversor_id=?, bateria_id=?, num_baterias=?, produccion_diaria_kwh=?,
       produccion_mensual_kwh=?, area_requerida_m2=?, peso_total_kg=?, items_json=?,
       subtotal=?, margen_comercial_pct=?, total_inversion=?, ahorro_mensual=?,
       ahorro_anual=?, roi_sin_incentivos_meses=?, roi_con_incentivos_meses=?,
       deduccion_renta_pct=?, degradacion_anual_pct=?, inflacion_tarifa_pct=?,
       aom_anual=?, aom_incremento_pct=?, pct_autoconsumo=?, precio_excedente_kwh=?,
       proyeccion_25_json=?, cronograma_json=?, notas=? WHERE id=?`,
      [d.cliente_id, d.estado || 'borrador', d.potencia_kwp || 0, d.num_paneles || 0,
       d.panel_id, d.inversor_id, d.bateria_id || null, d.num_baterias || 0,
       d.produccion_diaria_kwh || 0, d.produccion_mensual_kwh || 0, d.area_requerida_m2 || 0,
       d.peso_total_kg || 0, d.items_json || '[]', d.subtotal || 0, d.margen_comercial_pct || 15,
       d.total_inversion || 0, d.ahorro_mensual || 0, d.ahorro_anual || 0,
       d.roi_sin_incentivos_meses || 0, d.roi_con_incentivos_meses || 0,
       d.deduccion_renta_pct || 50, d.degradacion_anual_pct || 0.74,
       d.inflacion_tarifa_pct || 10, d.aom_anual || 0, d.aom_incremento_pct || 5,
       d.pct_autoconsumo || 100, d.precio_excedente_kwh || 0, d.proyeccion_25_json || '[]',
       d.cronograma_json || '[]', d.notas || '', req.params.id]
    );
    res.json({ message: 'Cotización actualizada exitosamente' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ detail: 'Error del servidor' });
  }
});

// ── Change Status ──
router.put('/:id/estado', async (req, res) => {
  try {
    const [existing] = await pool.execute('SELECT id FROM cotizaciones WHERE id = ? AND (empresa_id = ? OR ? = 1)', [req.params.id, req.user.empresa_id, req.user.es_superadmin ? 1 : 0]);
    if (existing.length === 0) return res.status(404).json({ detail: 'Cotización no encontrada' });

    const validStates = ['borrador', 'enviada', 'firmada', 'rechazada'];
    if (!validStates.includes(req.body.estado)) {
      return res.status(400).json({ detail: `Estado inválido. Opciones: ${validStates.join(', ')}` });
    }

    await pool.execute('UPDATE cotizaciones SET estado=? WHERE id=?', [req.body.estado, req.params.id]);
    res.json({ message: `Estado actualizado a '${req.body.estado}'` });
  } catch (error) {
    console.error(error);
    res.status(500).json({ detail: 'Error del servidor' });
  }
});

// ── Delete ──
router.delete('/:id', async (req, res) => {
  try {
    const [existing] = await pool.execute('SELECT id FROM cotizaciones WHERE id = ? AND (empresa_id = ? OR ? = 1)', [req.params.id, req.user.empresa_id, req.user.es_superadmin ? 1 : 0]);
    if (existing.length === 0) return res.status(404).json({ detail: 'Cotización no encontrada' });

    await pool.execute('DELETE FROM cotizaciones WHERE id = ?', [req.params.id]);
    res.json({ message: 'Cotización eliminada exitosamente' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ detail: 'Error del servidor' });
  }
});

module.exports = router;
