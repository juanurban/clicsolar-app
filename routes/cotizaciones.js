const express = require('express');
const router = express.Router();
const pool = require('../db');

// ── Helper: Get config value ──
async function getConfigValue(clave, defaultVal = null) {
  const [rows] = await pool.execute('SELECT valor, tipo FROM configuracion WHERE clave = ?', [clave]);
  if (rows.length === 0) return defaultVal;
  const { valor, tipo } = rows[0];
  if (tipo === 'number') { const n = parseFloat(valor); return isNaN(n) ? defaultVal : n; }
  return valor;
}

// ── Helper: Generate next code ──
async function generateCodigo() {
  const [rows] = await pool.execute('SELECT MAX(id) as max_id FROM cotizaciones');
  const nextId = (rows[0].max_id || 0) + 1;
  return `PROP-${String(nextId).padStart(4, '0')}`;
}

// ══════════════════════════════════════════
//  DIMENSIONING
// ══════════════════════════════════════════

router.post('/dimensionar', async (req, res) => {
  try {
    const d = req.body;
    const [panels] = await pool.execute("SELECT * FROM equipos WHERE id = ? AND categoria = 'panel'", [d.panel_id]);
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
    const areaRequerida = Math.round(numPaneles * panelArea * 10) / 10;
    const pesoTotal = Math.round(numPaneles * panelPeso * 10) / 10;

    let inversorSugerido = null;
    if (d.inversor_id) {
      const [invs] = await pool.execute("SELECT * FROM equipos WHERE id = ? AND categoria = 'inversor'", [d.inversor_id]);
      if (invs.length > 0) inversorSugerido = invs[0];
    }
    if (!inversorSugerido) {
      const [invs] = await pool.execute(
        "SELECT * FROM equipos WHERE categoria = 'inversor' AND activo = 1 AND potencia_kw >= ? ORDER BY potencia_kw ASC LIMIT 1",
        [potenciaRealKwp]
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
    let where = '1=1', params = [];

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
      cl.operador_red as cliente_operador, cl.tipo_tarifa as cliente_tarifa,
      cl.consumo_mensual_kwh as cliente_consumo, cl.costo_kwh as cliente_costo_kwh,
      cl.hsp as cliente_hsp, cl.historial_consumo as cliente_historial
      FROM cotizaciones c LEFT JOIN clientes cl ON c.cliente_id = cl.id WHERE c.id = ?
    `, [req.params.id]);

    if (rows.length === 0) return res.status(404).json({ detail: 'Cotización no encontrada' });
    const cot = rows[0];

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

    // Load company config
    const [configRows] = await pool.execute("SELECT clave, valor FROM configuracion WHERE clave LIKE 'empresa_%' OR clave LIKE 'diseno_%'");
    cot.empresa = {};
    configRows.forEach(r => { cot.empresa[r.clave] = r.valor; });

    // Load advisor & terms config
    const [asesorRows] = await pool.execute("SELECT clave, valor FROM configuracion WHERE clave LIKE 'asesor_%' OR clave = 'firma_asesor' OR clave = 'terminos_condiciones'");
    cot.asesor = {};
    asesorRows.forEach(r => { cot.asesor[r.clave] = r.valor; });

    res.json(cot);
  } catch (error) {
    console.error(error);
    res.status(500).json({ detail: 'Error del servidor' });
  }
});

// ── Create ──
router.post('/', async (req, res) => {
  try {
    const d = req.body;
    const [clients] = await pool.execute('SELECT id FROM clientes WHERE id = ?', [d.cliente_id]);
    if (clients.length === 0) return res.status(404).json({ detail: 'Cliente no encontrado' });

    const codigo = await generateCodigo();

    let cronograma = d.cronograma_json || '[]';
    if (cronograma === '[]') {
      const pagoAnticipo = await getConfigValue('pago_anticipo_pct', 60);
      const pagoEntrega = await getConfigValue('pago_contraentrega_pct', 40);
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
      `INSERT INTO cotizaciones (codigo, cliente_id, potencia_kwp, num_paneles, panel_id,
        inversor_id, bateria_id, num_baterias, produccion_diaria_kwh, produccion_mensual_kwh,
        area_requerida_m2, peso_total_kg, items_json, subtotal, margen_comercial_pct,
        total_inversion, ahorro_mensual, ahorro_anual, roi_sin_incentivos_meses,
        roi_con_incentivos_meses, deduccion_renta_pct, degradacion_anual_pct,
        inflacion_tarifa_pct, aom_anual, aom_incremento_pct, pct_autoconsumo,
        precio_excedente_kwh, proyeccion_25_json, cronograma_json, notas)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [codigo, d.cliente_id, d.potencia_kwp || 0, d.num_paneles || 0, d.panel_id,
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
    const [existing] = await pool.execute('SELECT id FROM cotizaciones WHERE id = ?', [req.params.id]);
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
    const [existing] = await pool.execute('SELECT id FROM cotizaciones WHERE id = ?', [req.params.id]);
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
    const [existing] = await pool.execute('SELECT id FROM cotizaciones WHERE id = ?', [req.params.id]);
    if (existing.length === 0) return res.status(404).json({ detail: 'Cotización no encontrada' });

    await pool.execute('DELETE FROM cotizaciones WHERE id = ?', [req.params.id]);
    res.json({ message: 'Cotización eliminada exitosamente' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ detail: 'Error del servidor' });
  }
});

module.exports = router;
