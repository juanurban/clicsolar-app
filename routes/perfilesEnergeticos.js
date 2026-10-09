const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const pdfParse = require('pdf-parse');
const pool = require('../db');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);
const { createWorker } = require('tesseract.js');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /\.(xlsx|xls|csv)$/i.test(file.originalname);
    cb(allowed ? null : new Error('Solo se permiten archivos .xlsx, .xls o .csv'), allowed);
  }
});

const receiptUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /\.pdf$/i.test(file.originalname) || file.mimetype === 'application/pdf';
    cb(allowed ? null : new Error('El recibo debe estar en formato PDF'), allowed);
  }
});

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function parseNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const normalized = String(value).trim().replace(',', '.');
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

// Algunos analizadores exportan decimales en kW y otros enteros en W.
function normalizePower(value) {
  const number = parseNumber(value);
  if (number === null) return null;
  return Math.abs(number) > 100 ? number / 1000 : number;
}

function parseDateTime(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const number = parseNumber(value);
  if (typeof value === 'number' && number !== null) {
    const date = new Date(Date.UTC(1899, 11, 30) + number * 86400000);
    if (!Number.isNaN(date.getTime())) return date;
  }
  const text = String(value ?? '').trim();
  if (!text) return null;
  const isoText = text.replace(/^(\d{4})\/(\d{1,2})\/(\d{1,2})/, '$1-$2-$3');
  const date = new Date(isoText);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function isoDateTime(date) {
  const pad = value => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function median(numbers) {
  if (!numbers.length) return 60;
  const sorted = [...numbers].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function findColumns(rows) {
  for (let rowIndex = 0; rowIndex < Math.min(rows.length, 20); rowIndex++) {
    const normalized = rows[rowIndex].map(normalizeText);
    const dateColumn = normalized.findIndex(value => /datetime|fecha.?hora|timestamp|date/.test(value));
    const consumptionColumn = normalized.findIndex(value => /consumo|consumption|demanda|load/.test(value));
    const productionColumn = normalized.findIndex(value => /produccion|production|generacion|generation/.test(value));
    if (dateColumn >= 0 && consumptionColumn >= 0) {
      return { headerRow: rowIndex, dateColumn, consumptionColumn, productionColumn };
    }
  }
  throw new Error('No encontré columnas de fecha/hora y consumo en el archivo.');
}

function analyzeWorkbook(buffer, originalName) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true, raw: true });
  const sheetName = workbook.SheetNames.find(name => normalizeText(name).includes('device')) || workbook.SheetNames[0];
  if (!sheetName) throw new Error('El archivo no contiene hojas de cálculo.');

  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true });
  const columns = findColumns(rows);
  const measurements = [];

  for (const row of rows.slice(columns.headerRow + 1)) {
    const date = parseDateTime(row[columns.dateColumn]);
    const consumption = normalizePower(row[columns.consumptionColumn]);
    if (!date || consumption === null) continue;
    const production = columns.productionColumn >= 0 ? (normalizePower(row[columns.productionColumn]) ?? 0) : 0;
    measurements.push({
      fecha_hora: isoDateTime(date),
      consumo_kw: Math.round(consumption * 1000) / 1000,
      produccion_kw: Math.round(production * 1000) / 1000,
      consumo_original: row[columns.consumptionColumn],
      produccion_original: columns.productionColumn >= 0 ? row[columns.productionColumn] : null
    });
  }

  if (!measurements.length) throw new Error('No encontré mediciones válidas de consumo.');
  measurements.sort((a, b) => a.fecha_hora.localeCompare(b.fecha_hora));

  const dates = measurements.map(m => new Date(m.fecha_hora.replace(' ', 'T') + 'Z'));
  const gaps = [];
  for (let i = 1; i < dates.length; i++) {
    const gap = (dates[i] - dates[i - 1]) / 60000;
    if (gap > 0 && gap <= 1440) gaps.push(gap);
  }
  const intervaloMinutos = median(gaps);
  const intervalHours = intervaloMinutos / 60;
  const daily = new Map();
  const hourly = Array.from({ length: 24 }, (_, hora) => ({ hora, suma_kw: 0, mediciones: 0, max_kw: 0 }));
  let consumoTotal = 0;
  let produccionTotal = 0;
  let demandaTotal = 0;
  let demandaMaxima = 0;

  for (const measurement of measurements) {
    const date = new Date(measurement.fecha_hora.replace(' ', 'T') + 'Z');
    const energy = measurement.consumo_kw * intervalHours;
    consumoTotal += energy;
    produccionTotal += measurement.produccion_kw * intervalHours;
    demandaTotal += measurement.consumo_kw;
    demandaMaxima = Math.max(demandaMaxima, measurement.consumo_kw);
    const day = isoDate(date);
    const dayItem = daily.get(day) || { fecha: day, consumo_kwh: 0, demanda_max_kw: 0, mediciones: 0 };
    dayItem.consumo_kwh += energy;
    dayItem.demanda_max_kw = Math.max(dayItem.demanda_max_kw, measurement.consumo_kw);
    dayItem.mediciones++;
    daily.set(day, dayItem);
    const hour = hourly[date.getUTCHours()];
    hour.suma_kw += measurement.consumo_kw;
    hour.mediciones++;
    hour.max_kw = Math.max(hour.max_kw, measurement.consumo_kw);
  }

  const resumenDiario = [...daily.values()].map(item => ({
    ...item,
    consumo_kwh: Math.round(item.consumo_kwh * 1000) / 1000,
    demanda_max_kw: Math.round(item.demanda_max_kw * 1000) / 1000
  }));
  const dias = resumenDiario.length || 1;
  const consumoDiarioPromedio = consumoTotal / dias;
  const perfilHorario = hourly.map(item => ({
    hora: item.hora,
    promedio_kw: item.mediciones ? Math.round(item.suma_kw / item.mediciones * 1000) / 1000 : 0,
    max_kw: Math.round(item.max_kw * 1000) / 1000
  }));

  return {
    archivo_nombre: originalName,
    hoja_origen: sheetName,
    intervalo_minutos: Math.round(intervaloMinutos * 100) / 100,
    fecha_inicio: measurements[0].fecha_hora,
    fecha_fin: measurements.at(-1).fecha_hora,
    numero_mediciones: measurements.length,
    consumo_total_kwh: Math.round(consumoTotal * 1000) / 1000,
    consumo_diario_promedio_kwh: Math.round(consumoDiarioPromedio * 1000) / 1000,
    consumo_mensual_estimado_kwh: Math.round(consumoDiarioPromedio * 30 * 10) / 10,
    demanda_promedio_kw: Math.round(demandaTotal / measurements.length * 1000) / 1000,
    demanda_maxima_kw: Math.round(demandaMaxima * 1000) / 1000,
    produccion_total_kwh: Math.round(produccionTotal * 1000) / 1000,
    perfil_horario_json: JSON.stringify(perfilHorario),
    resumen_diario_json: JSON.stringify(resumenDiario),
    mediciones_json: JSON.stringify(measurements),
    observaciones: 'Valores mayores a 100 fueron interpretados como W y convertidos a kW; valores decimales se interpretaron como kW.'
  };
}

function parseJson(value, fallback = []) {
  try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
}

function numericValue(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const raw = String(value).replace(/\s/g, '');
  const text = raw.includes(',')
    ? raw.replace(/\./g, '').replace(',', '.')
    : raw.replace(/(\d)\.(\d{3})(?=\D|$)/g, '$1$2');
  const match = text.match(/-?\d+(?:\.\d+)?/);
  const number = match ? Number(match[0]) : NaN;
  return Number.isFinite(number) ? number : null;
}

function parseReceiptResponse(text) {
  const parsed = JSON.parse(String(text || '').replace(/```json/i, '').replace(/```/g, '').trim());
  const result = {
    periodo: parsed.periodo || null,
    fecha_inicio: parsed.fecha_inicio || null,
    fecha_fin: parsed.fecha_fin || null,
    consumo_kwh_mes: numericValue(parsed.consumo_kwh_mes),
    tarifa_kwh: numericValue(parsed.tarifa_kwh),
    valor_total: numericValue(parsed.valor_total),
    proveedor: parsed.proveedor || null,
    cuenta: parsed.cuenta || null,
    observaciones: parsed.observaciones || null
  };
  result.historial_mensual = Array.isArray(parsed.historial_mensual)
    ? parsed.historial_mensual.map(item => ({
      periodo: item.periodo || item.mes || null,
      consumo_kwh: numericValue(item.consumo_kwh ?? item.consumo),
      tarifa_kwh: numericValue(item.tarifa_kwh ?? item.tarifa)
    })).filter(item => item.consumo_kwh !== null).slice(-6)
    : [];
  if (!result.consumo_kwh_mes) throw new Error('No pude encontrar el consumo mensual en el recibo.');
  if (!result.tarifa_kwh && result.valor_total) result.tarifa_kwh = Math.round(result.valor_total / result.consumo_kwh_mes);
  return result;
}

function findTariffInText(text) {
  const normalized = String(text || '').replace(/\s+/g, ' ');
  const patterns = [
    /(?:tarifa|precio|valor)\s*(?:de\s*)?(?:la\s*)?(?:energ[ií]a|energ[eé]tico|kwh)?[^\d]{0,40}(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2}))[ \t]*\/?\s*kwh/i,
    /(?:valor|costo)\s*kwh[^\d]{0,30}(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2}))/i,
    /(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2}))[ \t]*\/?\s*kwh[^\d]{0,20}(?:tarifa|precio|valor)/i
  ];
  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    const value = numericValue(match?.[1]);
    if (value && value > 100 && value < 10000) return value;
  }
  return null;
}

// Umbrales de un consumo mensual doméstico/comercial razonable en Colombia.
// Por debajo o por encima de estos límites lo que se leyó no es un consumo
// mensual (suele ser la lectura del contador, un importe en pesos o un
// acumulados del período).
const KWH_MENSUAL_MINIMO = 5;
const KWH_MENSUAL_MAXIMO = 200000;

function esConsumoPlausible(valor) {
  const numero = Number(valor);
  return Number.isFinite(numero) && numero >= KWH_MENSUAL_MINIMO && numero <= KWH_MENSUAL_MAXIMO;
}

const FORMA_MES = {
  ene: 0, enero: 0, feb: 1, febrero: 1, mar: 2, marzo: 2, abr: 3, abril: 3,
  may: 4, mayo: 4, jun: 5, junio: 5, jul: 6, julio: 6, ago: 7, agosto: 7,
  sep: 8, set: 8, septiembre: 8, setiembre: 8, oct: 9, octubre: 9,
  nov: 10, noviembre: 10, dic: 11, diciembre: 11
};

// Los recibidos digitales traen el histórico de meses en la capa de texto del
// PDF (las barras del gráfico suelen llevar al lado su etiqueta y su valor).
// Este extractor recorre los tokens buscando "Ene 166 kWh Feb 152 …" sin
// depender del OCR. Solo se acepta una racha de al menos 3 meses consecutivos
// con valores plausibles, para no tomar cifras sueltas de otras secciones.
function extraerHistorialDelTexto(texto) {
  const tokens = String(texto || '').replace(/\u00a0/g, ' ').split(/\s+/).filter(Boolean);
  const hallazgos = [];
  for (let i = 0; i + 1 < tokens.length; i++) {
    const indiceMes = FORMA_MES[normalizeText(tokens[i].replace(/[^\p{L}]/gu, ''))];
    if (indiceMes === undefined) continue;
    const contexto = tokens.slice(i, i + 4).join(' ');
    const llevaUnidad = /kwh/i.test(contexto);
    for (let salto = 1; salto <= 2; salto++) {
      const intermedio = tokens[i + salto - 1];
      if (salto > 1 && !/kwh/i.test(intermedio) && !/^[:.)\-]$/.test(intermedio)) break;
      const consumo = numericValue(tokens[i + salto] || '');
      if (!esConsumoPlausible(consumo)) continue;
      // Un número de 4 cifras entre 1900 y 2100 sin unidad al lado es un año,
      // no un consumo (p. ej. "julio 2026").
      if (!llevaUnidad && /^\d{4}$/.test(consumo.toString()) && consumo >= 1900 && consumo <= 2100) continue;
      hallazgos.push({ indiceMes, periodo: tokens[i].toUpperCase().slice(0, 3), consumo_kwh: consumo });
      break;
    }
  }
  // Racha más larga de meses consecutivos (envuelta al terminar el año).
  let mejor = [];
  for (let inicio = 0; inicio < hallazgos.length; inicio++) {
    const racha = [hallazgos[inicio]];
    for (let siguiente = inicio + 1; siguiente < hallazgos.length; siguiente++) {
      if (hallazgos[siguiente].indiceMes === (racha[racha.length - 1].indiceMes + 1) % 12) racha.push(hallazgos[siguiente]);
    }
    if (racha.length > mejor.length) mejor = racha;
  }
  if (mejor.length < 3) return [];
  return mejor.map(({ periodo, consumo_kwh }) => ({ periodo, consumo_kwh, tarifa_kwh: null }));
}

// Umbrales de la tarifa en Colombia. El cargo por energía suele estar entre
// $120 y $1.500 por kWh; si se leyó muy fuera de ese rango (p. ej. "8,76" en
// lugar de "876") cualquier cálculo hecho con ella es mentira.
const TARIFA_MINIMA = 50;
const TARIFA_MAXIMA = 5000;

function esTarifaPlausible(valor) {
  const numero = Number(valor);
  return Number.isFinite(numero) && numero >= TARIFA_MINIMA && numero <= TARIFA_MAXIMA;
}

// Descarta lecturas imposibles y deja constancia escrita de cada corrección.
// Solo se sustituye el consumo cuando lo leído no es un consumo mensual. Si es
// plausible se conserva aunque no cuadre con el total facturado: en los recibos
// colombianos ese total incluye POT, distribución, administración e IVA, así
// que dividirlo por la tarifa de energía infla el consumo varias veces (leer
// 29.011 kWh en un recibo de 634 kWh es signo de una tarifa mal interpretada,
// no de un consumo enorme).
function validarLecturaRecibo(parsed) {
  const advertencias = [];
  parsed.historial_mensual = (parsed.historial_mensual || []).filter(item => esConsumoPlausible(item.consumo_kwh));

  if (parsed.tarifa_kwh && !esTarifaPlausible(parsed.tarifa_kwh)) {
    advertencias.push(`La tarifa leída (${parsed.tarifa_kwh} $/kWh) no es creíble; se conservará el costo/kWh que ya tuvieras registrado.`);
    parsed.tarifa_kwh = null;
  }

  const estimado = (parsed.valor_total && parsed.tarifa_kwh)
    ? Math.round(parsed.valor_total / parsed.tarifa_kwh * 10) / 10
    : null;

  if (!esConsumoPlausible(parsed.consumo_kwh_mes)) {
    if (esConsumoPlausible(estimado)) {
      advertencias.push(`El consumo mensual leído (${parsed.consumo_kwh_mes} kWh) no es válido; se usó el calculado de la factura: ${estimado} kWh.`);
      parsed.consumo_kwh_mes = estimado;
    } else {
      throw new Error(`No pude identificar el consumo mensual en kWh del recibo (leí "${parsed.consumo_kwh_mes}"). Escribe los consumos mensuales a mano en el perfil energético.`);
    }
  } else if (esConsumoPlausible(estimado)) {
    // El consumo no puede costar más que el propio recibo: la energía es solo uno
    // de los cargos. Si consumo × tarifa supera el total facturado, lo leído no es
    // un consumo (suele ser la lectura del contador o un acumulado) y sí conviene
    // sustituirlo. Si el total es mayor, lo normal es que ese extra sean POT,
    // distribución e IVA: entonces se conserva el consumo del recibo y solo se avisa.
    const costoEnergia = parsed.consumo_kwh_mes * parsed.tarifa_kwh;
    if (costoEnergia > Number(parsed.valor_total) * 1.5) {
      advertencias.push(`El consumo leído (${parsed.consumo_kwh_mes} kWh) costaría más que todo el recibo ($${parsed.valor_total}); se usó el valor compatible con la factura: ${estimado} kWh.`);
      parsed.consumo_kwh_mes = estimado;
    } else {
      const relacion = estimado / parsed.consumo_kwh_mes;
      if (relacion < 0.5 || relacion > 2) {
        advertencias.push(`El consumo del recibo (${parsed.consumo_kwh_mes} kWh) no coincide con el total facturado ÷ tarifa (${estimado} kWh). El total incluye otros cargos, así que se conservó ${parsed.consumo_kwh_mes} kWh: contrasta el consumo con tu recibo.`);
      }
    }
  }

  if (!parsed.historial_mensual.length) {
    advertencias.push('No pude leer el gráfico de consumos mensuales del recibo; se guardó únicamente el mes facturado. Captura los meses restantes a mano.');
  }
  parsed.advertencias = advertencias;
  return parsed;
}

// Los recibos de operadores grandes (p. ej. ENEL Factura Expres) imprimen la
// frase "Consumo promedio / últimos 6 meses / 18.560 kWh". La capa de texto del
// PDF separa la etiqueta de su cifra con saltos de línea y además desordena las
// columnas, así que "CONSUMO MES" puede quedar lejos de su número. Esta ancla
// es la referencia más fiable del consumo mensual típico del cliente.
function extraerPromedioSeisMeses(texto) {
  const normalizado = String(texto || '').replace(/\s+/g, ' ');
  const buscador = /consumo\s+promedio/gi;
  const posiciones = [];
  let match;
  while ((match = buscador.exec(normalizado)) !== null) posiciones.push(match.index);
  for (const indice of posiciones) {
    const ventana = normalizado.slice(indice, indice + 160);
    if (!/meses/i.test(ventana)) continue;
    const cifra = ventana.match(/([\d]{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?)\s*kwh/i);
    if (!cifra) continue;
    const valor = numericValue(cifra[1]);
    if (esConsumoPlausible(valor)) return valor;
  }
  return null;
}

async function analyzeReceipt(buffer, originalName) {
  const extracted = await pdfParse(buffer);
  const extractedText = String(extracted.text || '').trim();
  const enelReceipt = /ENEL|CODENSA/i.test(extractedText);
  let text = extractedText;
  let ocrUsado = false;
  // ENEL and other providers often draw the six-month history as a chart.
  // OCR supplements the PDF text so those chart labels are available to the model.
  if (process.env.RECEIPT_OCR !== 'false') {
    try {
      const ocrText = await ocrPdf(buffer, enelReceipt);
      ocrUsado = true;
      // For ENEL, never send the full page text: it contains a second graph
      // for municipal waste/aseo with unrelated monthly values.
      text = enelReceipt
        ? `ENEL - BLOQUE EXCLUSIVO DE CONSUMO DE ENERGÍA:\n${ocrText}`
        : `${text}\n\nOCR del recibo:\n${ocrText}`.trim();
    } catch (error) {
      console.warn('OCR del recibo no disponible:', error.message);
    }
  }
  if (text.length < 40) {
    throw new Error('El PDF no contiene texto legible. Exporta el recibo como PDF con texto o utiliza un recibo digital.');
  }
  const apiKey = (process.env.GROQ_API_KEY || '').trim().replace(/[\'"]/g, '');
  if (!apiKey) throw new Error('GROQ_API_KEY no está configurado en el servidor.');
  const prompt = `You are an expert at reading Colombian electricity bills. Extract only values explicitly present in this bill.
Return one raw JSON object without markdown with exactly these fields:
{"periodo":"billing period or null","fecha_inicio":"YYYY-MM-DD or null","fecha_fin":"YYYY-MM-DD or null","consumo_kwh_mes":number,"tarifa_kwh":number,"valor_total":number,"proveedor":"string or null","cuenta":"string or null","observaciones":"string or null","historial_mensual":[{"periodo":"month shown","consumo_kwh":number,"tarifa_kwh":number}]}
Rules: consume only the electricity section and the graph titled "Comportamiento consumo". Never use values from aseo, residuos, limpieza urbana, or any municipal waste graph. consumo_kwh_mes is the current billed electricity consumption, not pesos. tarifa_kwh is the exact energy price in Colombian pesos per kWh; preserve decimals such as 875,89 as 875.89. valor_total is the total bill in Colombian pesos. historial_mensual must contain every monthly electricity-consumption row shown in the graph, preferably the latest 6 months, in chronological order. Return numbers only and do not invent missing values.
Important about layout: in these PDFs labels and numbers are printed in separate blocks, so a label such as "CONSUMO MES:" may appear far from its value. Never take a reactive-energy ("reactiva"), demand ("demanda"), power or meter-reading number as consumo_kwh_mes. If the bill shows "Consumo promedio últimos 6 meses", that figure is the customer's typical monthly consumption: report it in observaciones as "promedio_6m=<value>" and prefer it over an ambiguous "CONSUMO MES" reading when the two differ by more than three times.
Receipt text (${originalName}):\n${text.slice(0, 30000)}`;
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: process.env.GROQ_MODEL || 'openai/gpt-oss-120b', messages: [{ role: 'user', content: prompt }], temperature: 0.1, response_format: { type: 'json_object' } })
  });
  if (!response.ok) throw new Error(`Groq API Error: ${await response.text()}`);
  const completion = await response.json();
  const parsed = validarLecturaRecibo(parseReceiptResponse(completion.choices?.[0]?.message?.content));
  // Prefer an explicit tariff written next to kWh in the receipt text over an
  // inferred or misclassified value returned by the model.
  const explicitTariff = findTariffInText(text);
  if (explicitTariff) parsed.tarifa_kwh = explicitTariff;
  // Cuando el modelo no devolvió el histórico (típico si el gráfico es una
  // imagen y el OCR no está disponible), se intenta leer la secuencia de meses
  // directamente de la capa de texto del PDF.
  if (!parsed.historial_mensual.length) {
    const delTexto = extraerHistorialDelTexto(`${extractedText}\n${text}`).filter(item => esConsumoPlausible(item.consumo_kwh));
    if (delTexto.length) {
      parsed.historial_mensual = delTexto.map(item => ({ ...item, tarifa_kwh: parsed.tarifa_kwh }));
      parsed.advertencias = (parsed.advertencias || []).filter(texto => !texto.startsWith('No pude leer el gráfico'));
      parsed.advertencias.push(`Histórico de meses recuperado del texto del recibo (${delTexto.length} meses).`);
    }
  }
  // Ancla determinista: el propio recibo anuncia su promedio de los últimos
  // 6 meses. Si difiere mucho de lo que se tomó como consumo mensual, se avisa
  // (no se reemplaza: el usuario decide cuál corresponde a su proyecto).
  const promedioSeisMeses = extraerPromedioSeisMeses(`${extractedText}\n${text}`);
  if (promedioSeisMeses) {
    parsed.promedio_seis_meses = promedioSeisMeses;
    if (esConsumoPlausible(parsed.consumo_kwh_mes)) {
      const relacion = promedioSeisMeses / parsed.consumo_kwh_mes;
      if (relacion > 3 || relacion < 0.33) {
        parsed.advertencias = parsed.advertencias || [];
        parsed.advertencias.push(`El recibo anuncia un consumo promedio de los últimos 6 meses de ${promedioSeisMeses.toLocaleString('es-CO')} kWh, muy distinto del consumo mensual leído (${parsed.consumo_kwh_mes} kWh). En este tipo de factura la etiqueta "CONSUMO MES" suele quedar separada de su cifra: escribe los meses reales del cliente antes de guardar.`);
      }
    }
  }
  parsed.ocr_disponible = ocrUsado;
  if (!ocrUsado) {
    parsed.advertencias = (parsed.advertencias || []);
    parsed.advertencias.push('Este servidor no tiene el lector óptico (OCR) instalado: si el recibo es una imagen escaneada, los meses del gráfico no se pueden leer automáticamente.');
  }
  return parsed;
}

async function ocrPdf(buffer, enelLayout = false) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sunquote-receipt-'));
  const pdfPath = path.join(dir, 'receipt.pdf');
  const imagePrefix = path.join(dir, 'page');
  let worker;
  try {
    fs.writeFileSync(pdfPath, buffer);
    const pdftoppm = process.env.PDFTOPPM_PATH || 'pdftoppm';
    const renderArgs = enelLayout
      // ENEL puts energy consumption in the upper chart on page 2. The lower
      // chart is municipal waste/aseo and must not enter the OCR prompt.
      ? ['-f', '2', '-l', '2', '-png', '-r', '200', '-x', '500', '-y', '100', '-W', '700', '-H', '400', pdfPath, imagePrefix]
      : ['-png', '-r', '200', pdfPath, imagePrefix];
    await execFileAsync(pdftoppm, renderArgs, { timeout: 60000, maxBuffer: 1024 * 1024 });
    const images = fs.readdirSync(dir).filter(name => /^page-\d+\.png$/.test(name)).sort();
    if (!images.length) throw new Error('No se pudieron convertir las páginas del recibo.');
    worker = await createWorker('spa');
    const chunks = [];
    for (const image of images.slice(0, 4)) {
      const result = await worker.recognize(path.join(dir, image));
      chunks.push(result.data.text || '');
    }
    if (enelLayout) {
      const bundledPython = '/Users/morris/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3';
      const python = process.env.PYTHON_PATH || (fs.existsSync(bundledPython) ? bundledPython : 'python3');
      const chartScript = path.join(__dirname, '..', 'scripts', 'extract-enel-chart.py');
      const chart = await execFileAsync(python, [chartScript, path.join(dir, images[0])], { timeout: 30000, maxBuffer: 1024 * 1024 });
      chunks.push(`Historial gráfico de consumo ENEL (Ene a Jul): ${chart.stdout.trim()}`);
    }
    return chunks.join('\n');
  } finally {
    if (worker) await worker.terminate();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// ── Create profile from an electricity bill PDF ──
router.post('/recibo/:clienteId', receiptUpload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ detail: 'Selecciona un recibo de energía en PDF.' });
    const [clients] = await pool.execute('SELECT id FROM clientes WHERE id = ? AND (empresa_id = ? OR ? = 1)', [req.params.clienteId, req.user.empresa_id, req.user.es_superadmin ? 1 : 0]);
    if (!clients.length) return res.status(404).json({ detail: 'Cliente no encontrado' });

    const receipt = await analyzeReceipt(req.file.buffer, req.file.originalname);
    const advertencias = receipt.advertencias || [];
    const monthlyHistory = receipt.historial_mensual.length
      ? receipt.historial_mensual
      : [{ periodo: receipt.periodo || 'Periodo actual', consumo_kwh: receipt.consumo_kwh_mes, tarifa_kwh: receipt.tarifa_kwh }];
    const consumptionValues = monthlyHistory.map(item => item.consumo_kwh).filter(value => Number.isFinite(value));
    // El promedio usa todos los meses leídos. Antes, para ENEL se descartaba el
    // último mes asumiendo que el gráfico siempre termina antes del mes
    // facturado; con recibos de otros operadores eso distorsionaba el promedio.
    const monthly = Math.round(consumptionValues.reduce((sum, value) => sum + value, 0) / consumptionValues.length * 10) / 10;
    const latest = consumptionValues[consumptionValues.length - 1] || receipt.consumo_kwh_mes;
    const tariff = receipt.tarifa_kwh || monthlyHistory.find(item => item.tarifa_kwh > 0)?.tarifa_kwh || 0;
    const profile = {
      archivo_nombre: req.file.originalname, hoja_origen: 'Recibo de energía', intervalo_minutos: 0,
      fecha_inicio: receipt.fecha_inicio, fecha_fin: receipt.fecha_fin, numero_mediciones: 1,
      consumo_total_kwh: monthly, consumo_diario_promedio_kwh: Math.round(monthly / 30 * 1000) / 1000,
      consumo_mensual_estimado_kwh: monthly, demanda_promedio_kw: 0, demanda_maxima_kw: 0,
      produccion_total_kwh: 0, perfil_horario_json: '[]',
      resumen_diario_json: JSON.stringify(monthlyHistory.map(item => ({ fecha: item.periodo, consumo_kwh: item.consumo_kwh, demanda_max_kw: 0, mediciones: 1 }))),
      mediciones_json: JSON.stringify([{ fecha_hora: receipt.fecha_fin || receipt.periodo || null, consumo_kwh_mes: monthly, tarifa_kwh: tariff, valor_total: receipt.valor_total }]),
      observaciones: `Perfil creado desde recibo. Proveedor: ${receipt.proveedor || 'no identificado'}. Cuenta: ${receipt.cuenta || 'no identificada'}. ${advertencias.join(' ')} ${receipt.observaciones || ''}`.trim()
    };
    const [result] = await pool.execute(`
      INSERT INTO perfiles_energeticos (cliente_id, archivo_nombre, hoja_origen, intervalo_minutos, fecha_inicio, fecha_fin,
        numero_mediciones, consumo_total_kwh, consumo_diario_promedio_kwh, consumo_mensual_estimado_kwh,
        demanda_promedio_kw, demanda_maxima_kw, produccion_total_kwh, perfil_horario_json, resumen_diario_json, mediciones_json, observaciones)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [req.params.clienteId, profile.archivo_nombre, profile.hoja_origen, profile.intervalo_minutos, profile.fecha_inicio,
      profile.fecha_fin, profile.numero_mediciones, profile.consumo_total_kwh, profile.consumo_diario_promedio_kwh,
      profile.consumo_mensual_estimado_kwh, profile.demanda_promedio_kw, profile.demanda_maxima_kw,
      profile.produccion_total_kwh, profile.perfil_horario_json, profile.resumen_diario_json, profile.mediciones_json, profile.observaciones]);

    // La tarifa solo se sobreescribe si el recibo entregó un valor creíble; si no,
    // no se debe borrar el costo/kWh que el usuario ya tenía registrado.
    const campos = ['consumo_mensual_kwh = ?', 'historial_consumo = ?'];
    const valores = [monthly, JSON.stringify(consumptionValues)];
    if (esTarifaPlausible(tariff)) { campos.push('costo_kwh = ?'); valores.push(tariff); }
    valores.push(req.params.clienteId);
    await pool.execute(`UPDATE clientes SET ${campos.join(', ')} WHERE id = ?`, valores);
    res.status(201).json({ id: result.insertId, ...receipt, consumo_kwh_mes: latest, consumo_promedio_kwh: monthly,
      tarifa_kwh: esTarifaPlausible(tariff) ? tariff : 0, ...profile, perfil_horario: [], historial_mensual: monthlyHistory,
      meses_leidos: monthlyHistory.length, advertencias, ocr_disponible: receipt.ocr_disponible,
      resumen_diario: parseJson(profile.resumen_diario_json) });
  } catch (error) {
    console.error('Error analizando recibo energético:', error);
    if (!res.headersSent) res.status(400).json({ detail: error.message || 'No se pudo analizar el recibo' });
  }
});

router.get('/:clienteId', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT * FROM perfiles_energeticos WHERE cliente_id = ? ORDER BY created_at DESC, id DESC',
      [req.params.clienteId]
    );
    rows.forEach(row => {
      row.perfil_horario = parseJson(row.perfil_horario_json);
      row.resumen_diario = parseJson(row.resumen_diario_json);
      row.mediciones = parseJson(row.mediciones_json);
    });
    res.json(rows);
  } catch (error) {
    console.error('Error fetching perfil energético:', error);
    res.status(500).json({ detail: 'Error al cargar el perfil energético' });
  }
});

router.post('/:clienteId', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ detail: 'Selecciona un archivo Excel o CSV' });
    const [clients] = await pool.execute('SELECT id FROM clientes WHERE id = ? AND (empresa_id = ? OR ? = 1)', [req.params.clienteId, req.user.empresa_id, req.user.es_superadmin ? 1 : 0]);
    if (!clients.length) return res.status(404).json({ detail: 'Cliente no encontrado' });

    const profile = analyzeWorkbook(req.file.buffer, req.file.originalname);
    const [result] = await pool.execute(`
      INSERT INTO perfiles_energeticos (
        cliente_id, archivo_nombre, hoja_origen, intervalo_minutos, fecha_inicio, fecha_fin,
        numero_mediciones, consumo_total_kwh, consumo_diario_promedio_kwh,
        consumo_mensual_estimado_kwh, demanda_promedio_kw, demanda_maxima_kw,
        produccion_total_kwh, perfil_horario_json, resumen_diario_json, mediciones_json, observaciones
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      req.params.clienteId, profile.archivo_nombre, profile.hoja_origen, profile.intervalo_minutos,
      profile.fecha_inicio, profile.fecha_fin, profile.numero_mediciones, profile.consumo_total_kwh,
      profile.consumo_diario_promedio_kwh, profile.consumo_mensual_estimado_kwh,
      profile.demanda_promedio_kw, profile.demanda_maxima_kw, profile.produccion_total_kwh,
      profile.perfil_horario_json, profile.resumen_diario_json, profile.mediciones_json, profile.observaciones
    ]);

    await pool.execute(
      'UPDATE clientes SET consumo_mensual_kwh = ?, historial_consumo = ? WHERE id = ?',
      [profile.consumo_mensual_estimado_kwh, JSON.stringify([profile.consumo_mensual_estimado_kwh]), req.params.clienteId]
    );

    res.status(201).json({ id: result.insertId, ...profile, perfil_horario: parseJson(profile.perfil_horario_json), resumen_diario: parseJson(profile.resumen_diario_json) });
  } catch (error) {
    console.error('Error analizando perfil energético:', error);
    res.status(400).json({ detail: error.message || 'No se pudo analizar el archivo' });
  }
});

module.exports = router;
