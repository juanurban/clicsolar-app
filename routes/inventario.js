const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const pool = require('../db');

// Configure multer for file uploads
const uploadsDir = path.join(__dirname, '..', 'static', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => cb(null, file.originalname)
});
const upload = multer({ storage });

// ── List Equipment ──
router.get('/', async (req, res) => {
  try {
    const { categoria, buscar, activo } = req.query;
    let query = 'SELECT * FROM equipos WHERE 1=1';
    const params = [];

    if (categoria) { query += ' AND categoria = ?'; params.push(categoria); }
    if (buscar) {
      query += ' AND (marca LIKE ? OR modelo LIKE ? OR descripcion LIKE ?)';
      const s = `%${buscar}%`;
      params.push(s, s, s);
    }
    if (activo !== undefined && activo !== '') { query += ' AND activo = ?'; params.push(parseInt(activo)); }

    query += ' ORDER BY categoria, marca, modelo';
    const [rows] = await pool.execute(query, params);
    res.json({ data: rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ detail: 'Error del servidor' });
  }
});

// ── Get Equipment by ID ──
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM equipos WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ detail: 'Equipo no encontrado' });
    res.json(rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ detail: 'Error del servidor' });
  }
});

// ── Create Equipment ──
router.post('/', async (req, res) => {
  try {
    const d = req.body;
    const [result] = await pool.execute(
      `INSERT INTO equipos (categoria, marca, modelo, descripcion, potencia_wp, potencia_kw,
        capacidad_kwh, tipo, costo, precio_venta, utilidad_pct, unidad, peso_kg, area_m2, activo, imagen_url, iva)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [d.categoria, d.marca || '', d.modelo || '', d.descripcion || '', d.potencia_wp || 0,
       d.potencia_kw || 0, d.capacidad_kwh || 0, d.tipo || '', d.costo || 0, d.precio_venta || 0,
       d.utilidad_pct || 0, d.unidad || 'und', d.peso_kg || 0, d.area_m2 || 0,
       d.activo !== undefined ? d.activo : 1, d.imagen_url || '', d.iva !== undefined ? d.iva : 1]
    );
    res.json({ id: result.insertId, message: 'Equipo creado exitosamente' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ detail: 'Error del servidor' });
  }
});

// ── Update Equipment ──
router.put('/:id', async (req, res) => {
  try {
    const [existing] = await pool.execute('SELECT id FROM equipos WHERE id = ?', [req.params.id]);
    if (existing.length === 0) return res.status(404).json({ detail: 'Equipo no encontrado' });

    const d = req.body;
    await pool.execute(
      `UPDATE equipos SET categoria=?, marca=?, modelo=?, descripcion=?, potencia_wp=?,
       potencia_kw=?, capacidad_kwh=?, tipo=?, costo=?, precio_venta=?, utilidad_pct=?, unidad=?,
       peso_kg=?, area_m2=?, activo=?, imagen_url=?, iva=? WHERE id=?`,
      [d.categoria, d.marca || '', d.modelo || '', d.descripcion || '', d.potencia_wp || 0,
       d.potencia_kw || 0, d.capacidad_kwh || 0, d.tipo || '', d.costo || 0, d.precio_venta || 0,
       d.utilidad_pct || 0, d.unidad || 'und', d.peso_kg || 0, d.area_m2 || 0,
       d.activo !== undefined ? d.activo : 1, d.imagen_url || '', d.iva !== undefined ? d.iva : 1, req.params.id]
    );
    res.json({ message: 'Equipo actualizado exitosamente' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ detail: 'Error del servidor' });
  }
});

// ── Delete Equipment ──
router.delete('/:id', async (req, res) => {
  try {
    const [existing] = await pool.execute('SELECT id FROM equipos WHERE id = ?', [req.params.id]);
    if (existing.length === 0) return res.status(404).json({ detail: 'Equipo no encontrado' });

    await pool.execute('DELETE FROM equipos WHERE id = ?', [req.params.id]);
    res.json({ message: 'Equipo eliminado exitosamente' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ detail: 'Error del servidor' });
  }
});

// ── Upload Image ──
router.post('/upload-imagen', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ detail: 'No se proporcionó archivo' });
  res.json({ url: `/static/uploads/${req.file.filename}` });
});



// ── Bulk Delete ──
router.post('/bulk-delete', async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids || ids.length === 0) return res.status(400).json({ detail: 'No se proporcionaron IDs' });

    const placeholders = ids.map(() => '?').join(',');
    await pool.execute(`DELETE FROM equipos WHERE id IN (${placeholders})`, ids);
    res.json({ message: `${ids.length} ítems eliminados exitosamente` });
  } catch (error) {
    console.error(error);
    res.status(500).json({ detail: 'Error del servidor' });
  }
});

// ── Extract Data from URL/PDF ──
router.post('/extract-data', upload.single('file'), async (req, res) => {
  try {
    const pdfParse = require('pdf-parse');
    const cheerio = require('cheerio');

    const { url, categoria } = req.body;
    let text = '';
    let imageUrl = '';

    if (req.file) {
      if (req.file.mimetype !== 'application/pdf') {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ detail: 'Solo se aceptan archivos PDF' });
      }
      const dataBuffer = fs.readFileSync(req.file.path);
      const data = await pdfParse(dataBuffer);
      text = data.text;
      fs.unlinkSync(req.file.path); // Cleanup
    } else if (url) {
      const response = await fetch(url);
      if (!response.ok) throw new Error('No se pudo acceder a la URL');
      const html = await response.text();
      const $ = cheerio.load(html);
      
      $('script, style, noscript, iframe, svg').remove();
      text = $('body').text().replace(/\s+/g, ' ').trim();
      imageUrl = $('meta[property="og:image"]').attr('content') || '';
    } else {
      return res.status(400).json({ detail: 'Debes proveer una URL o un archivo PDF' });
    }

    if (!text || text.length < 50) {
      return res.status(400).json({ detail: 'No se pudo extraer texto suficiente para analizar.' });
    }

    if (text.length > 40000) text = text.substring(0, 40000);

    const apiKey = (process.env.GROQ_API_KEY || '').trim().replace(/['"]/g, '');
    if (!apiKey) {
      return res.status(500).json({ detail: 'GROQ_API_KEY no está configurado en el servidor.' });
    }

    const prompt = `
Extract the technical specifications of a solar equipment (${categoria}) from the following text.
Return a valid JSON object EXACTLY matching this structure. Use null if a value is not found.
Do not wrap the JSON in markdown blocks. Just return the raw JSON object.

Structure:
{
  "marca": "string",
  "modelo": "string",
  "descripcion": "string (short summary)",
  "potencia_wp": number (only for panels, in Watts peak. E.g. 550),
  "potencia_kw": number (only for inverters, in kW. E.g. 10.5),
  "capacidad_kwh": number (only for batteries, in kWh. E.g. 5.12),
  "peso_kg": number,
  "area_m2": number (only for panels),
  "tipo": "string (e.g., Monocristalino, Híbrido, Litio)"
}

Text to analyze:
${text}
    `;

    const responseGroq = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        response_format: { type: 'json_object' }
      })
    });

    if (!responseGroq.ok) {
      const errorData = await responseGroq.text();
      throw new Error(`Groq API Error: ${errorData}`);
    }

    const result = await responseGroq.json();
    let responseText = result.choices[0].message.content;
    responseText = responseText.replace(/```json/i, '').replace(/```/g, '').trim();
    
    let parsedData = JSON.parse(responseText);
    if (imageUrl) parsedData.imagen_url = imageUrl;

    res.json(parsedData);
  } catch (error) {
    console.error('Error in extract-data:', error);
    res.status(500).json({ detail: 'Error al extraer los datos: ' + error.message });
  }
});

// ── Bulk Import from PDF Price List ──
router.post('/bulk-import-pdf', upload.single('file'), async (req, res) => {
  try {
    const pdfParse = require('pdf-parse');

    if (!req.file) return res.status(400).json({ detail: 'No se proporcionó archivo PDF' });
    if (req.file.mimetype !== 'application/pdf') {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ detail: 'Solo se aceptan archivos PDF' });
    }

    const dataBuffer = fs.readFileSync(req.file.path);
    const data = await pdfParse(dataBuffer);
    fs.unlinkSync(req.file.path);

    let text = data.text;
    if (!text || text.length < 50) {
      return res.status(400).json({ detail: 'No se pudo extraer texto suficiente del PDF.' });
    }
    if (text.length > 60000) text = text.substring(0, 60000);

    const apiKey = (process.env.GROQ_API_KEY || '').trim().replace(/['"]/g, '');
    if (!apiKey) {
      return res.status(500).json({ detail: 'GROQ_API_KEY no está configurado en el servidor.' });
    }

    const prompt = `
You are an expert at reading solar equipment price lists. Analyze the following text extracted from a supplier PDF price list.
Extract ALL products found and classify each one as either "inversor" (inverter) or "bateria" (battery) based on the product description.
Also detect panels ("panel") if present.

Return a valid JSON object with this EXACT structure:
{
  "productos": [
    {
      "categoria": "inversor" | "bateria" | "panel",
      "marca": "string (brand name)",
      "modelo": "string (model name/number)",
      "descripcion": "string (short description)",
      "potencia_wp": number or null (only for panels, in Watts peak),
      "potencia_kw": number or null (only for inverters, in kW),
      "capacidad_kwh": number or null (only for batteries, in kWh),
      "tipo": "string (e.g., Híbrido, On-Grid, Microinversor, Litio, LFP, Monocristalino)",
      "costo": number (price in the currency shown, WITHOUT tax. Use the raw number without thousands separators. E.g. 1500000),
      "peso_kg": number or null
    }
  ]
}

Rules:
- Extract EVERY product you can find, do not skip any.
- The price/cost MUST be taken ONLY from the column with the header "Agencia" (or the first price column if multiple exist).
- The price/cost should be the raw number. Remove any currency symbols or thousands separators.
- If the list shows prices with tax (IVA), try to extract the pre-tax price if possible.
- If you cannot determine a field, use null.
- Do NOT wrap the JSON in markdown code blocks.

Text from PDF:
${text}
    `;

    const responseGroq = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        response_format: { type: 'json_object' }
      })
    });

    if (!responseGroq.ok) {
      const errorData = await responseGroq.text();
      throw new Error(`Groq API Error: ${errorData}`);
    }

    const result = await responseGroq.json();
    let responseText = result.choices[0].message.content;
    responseText = responseText.replace(/```json/i, '').replace(/```/g, '').trim();

    const parsed = JSON.parse(responseText);
    const productos = parsed.productos || [];

    if (productos.length === 0) {
      return res.status(400).json({ detail: 'No se encontraron productos en el PDF.' });
    }

    // Return preview for user confirmation (don't insert yet)
    res.json({ productos });

  } catch (error) {
    console.error('Error in bulk-import-pdf:', error);
    res.status(500).json({ detail: 'Error al procesar el PDF: ' + error.message });
  }
});

// ── Bulk Create Equipment ──
router.post('/bulk-create', async (req, res) => {
  try {
    const { productos } = req.body;
    if (!productos || productos.length === 0) {
      return res.status(400).json({ detail: 'No se proporcionaron productos' });
    }

    let created = 0;
    for (const p of productos) {
      await pool.execute(
        `INSERT INTO equipos (categoria, marca, modelo, descripcion, potencia_wp, potencia_kw,
          capacidad_kwh, tipo, costo, precio_venta, utilidad_pct, unidad, peso_kg, area_m2, activo, imagen_url, iva)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [p.categoria || 'inversor', p.marca || '', p.modelo || '', p.descripcion || '',
         p.potencia_wp || 0, p.potencia_kw || 0, p.capacidad_kwh || 0, p.tipo || '',
         p.costo || 0, 0, 0, 'und', p.peso_kg || 0, p.area_m2 || 0, 1, '', 1]
      );
      created++;
    }

    res.json({ message: `${created} equipos creados exitosamente` });
  } catch (error) {
    console.error('Error in bulk-create:', error);
    res.status(500).json({ detail: 'Error al crear equipos: ' + error.message });
  }
});

module.exports = router;
