const express = require('express');
const router = express.Router();
const pool = require('../db');

// --- ESTADOS ---

router.get('/estados', async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM estados_proyecto ORDER BY orden ASC');
    res.json(rows);
  } catch (error) {
    console.error('Error fetching estados:', error);
    res.status(500).json({ error: 'Error fetching estados' });
  }
});

router.post('/estados', async (req, res) => {
  try {
    const { nombre, color, orden } = req.body;
    if (!nombre) return res.status(400).json({ error: 'El nombre es obligatorio' });
    
    const [result] = await pool.execute(
      'INSERT INTO estados_proyecto (nombre, color, orden) VALUES (?, ?, ?)',
      [nombre, color || 'border-l-4 border-gray-400 bg-surface-container', orden || 0]
    );
    res.status(201).json({ id: result.insertId, message: 'Estado creado' });
  } catch (error) {
    console.error('Error creating estado:', error);
    res.status(500).json({ error: 'Error al crear estado' });
  }
});

router.put('/estados/:id', async (req, res) => {
  try {
    const { nombre, color, orden } = req.body;
    const [result] = await pool.execute(
      'UPDATE estados_proyecto SET nombre = COALESCE(?, nombre), color = COALESCE(?, color), orden = COALESCE(?, orden) WHERE id = ?',
      [nombre !== undefined ? nombre : null, color !== undefined ? color : null, orden !== undefined ? orden : null, req.params.id]
    );
    res.json({ message: 'Estado actualizado' });
  } catch (error) {
    console.error('Error updating estado:', error);
    res.status(500).json({ error: 'Error al actualizar estado' });
  }
});

router.delete('/estados/:id', async (req, res) => {
  try {
    // Check if there are projects with this state
    const [proyectos] = await pool.execute('SELECT id FROM proyectos WHERE estado_id = ?', [req.params.id]);
    if (proyectos.length > 0) {
      return res.status(400).json({ error: 'No se puede eliminar un estado que tiene proyectos asignados' });
    }
    await pool.execute('DELETE FROM estados_proyecto WHERE id = ?', [req.params.id]);
    res.json({ message: 'Estado eliminado' });
  } catch (error) {
    console.error('Error deleting estado:', error);
    res.status(500).json({ error: 'Error al eliminar estado' });
  }
});

// --- PROYECTOS ---

// GET all projects (with client name and quote code)
router.get('/', async (req, res) => {
  try {
    const query = `
      SELECT p.*, c.nombre as cliente_nombre, cot.codigo as cotizacion_codigo, e.nombre as estado_nombre, e.color as estado_color
      FROM proyectos p
      JOIN clientes c ON p.cliente_id = c.id
      LEFT JOIN cotizaciones cot ON p.cotizacion_id = cot.id
      LEFT JOIN estados_proyecto e ON p.estado_id = e.id
      ORDER BY p.created_at DESC
    `;
    const [rows] = await pool.execute(query);
    res.json(rows);
  } catch (error) {
    console.error('Error fetching proyectos:', error);
    res.status(500).json({ error: 'Error fetching proyectos' });
  }
});

// POST new project
router.post('/', async (req, res) => {
  try {
    const { nombre, cliente_id, cotizacion_id, estado_id, fecha_entrega_estimada, notas } = req.body;
    
    if (!nombre || !cliente_id) {
      return res.status(400).json({ error: 'El nombre y el cliente son obligatorios' });
    }

    let defaultEstadoId = estado_id;
    if (!defaultEstadoId) {
       const [est] = await pool.execute('SELECT id FROM estados_proyecto ORDER BY orden ASC LIMIT 1');
       if (est.length > 0) defaultEstadoId = est[0].id;
    }

    const query = `
      INSERT INTO proyectos (nombre, cliente_id, cotizacion_id, estado_id, fecha_entrega_estimada, notas)
      VALUES (?, ?, ?, ?, ?, ?)
    `;
    const values = [
      nombre, 
      cliente_id, 
      cotizacion_id || null, 
      defaultEstadoId || null, 
      fecha_entrega_estimada || null, 
      notas || ''
    ];
    
    const [result] = await pool.execute(query, values);
    res.status(201).json({ id: result.insertId, message: 'Proyecto creado exitosamente' });
  } catch (error) {
    console.error('Error creating proyecto:', error);
    res.status(500).json({ error: 'Error al crear proyecto' });
  }
});

// PUT update project (e.g. changing status in kanban)
router.put('/:id', async (req, res) => {
  try {
    const projectId = req.params.id;
    const { nombre, cliente_id, cotizacion_id, estado_id, fecha_entrega_estimada, fecha_entrega_real, notas } = req.body;

    const query = `
      UPDATE proyectos 
      SET nombre = COALESCE(?, nombre),
          cliente_id = COALESCE(?, cliente_id),
          cotizacion_id = COALESCE(?, cotizacion_id),
          estado_id = COALESCE(?, estado_id),
          fecha_entrega_estimada = COALESCE(?, fecha_entrega_estimada),
          fecha_entrega_real = COALESCE(?, fecha_entrega_real),
          notas = COALESCE(?, notas)
      WHERE id = ?
    `;
    
    const values = [
      nombre !== undefined ? nombre : null,
      cliente_id !== undefined ? cliente_id : null,
      cotizacion_id !== undefined ? cotizacion_id : null,
      estado_id !== undefined ? estado_id : null,
      fecha_entrega_estimada !== undefined ? fecha_entrega_estimada : null,
      fecha_entrega_real !== undefined ? fecha_entrega_real : null,
      notas !== undefined ? notas : null,
      projectId
    ];

    const [result] = await pool.execute(query, values);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Proyecto no encontrado' });
    }
    
    res.json({ message: 'Proyecto actualizado exitosamente' });
  } catch (error) {
    console.error('Error updating proyecto:', error);
    res.status(500).json({ error: 'Error al actualizar proyecto' });
  }
});

// DELETE project
router.delete('/:id', async (req, res) => {
  try {
    const projectId = req.params.id;
    
    // Tareas will be deleted automatically due to ON DELETE CASCADE
    const [result] = await pool.execute('DELETE FROM proyectos WHERE id = ?', [projectId]);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Proyecto no encontrado' });
    }
    
    res.json({ message: 'Proyecto eliminado exitosamente' });
  } catch (error) {
    console.error('Error deleting proyecto:', error);
    res.status(500).json({ error: 'Error al eliminar proyecto' });
  }
});

// --- TASKS (tareas_proyecto) ---

// GET tasks for a project
router.get('/:id/tareas', async (req, res) => {
  try {
    const projectId = req.params.id;
    const [rows] = await pool.execute('SELECT * FROM tareas_proyecto WHERE proyecto_id = ? ORDER BY created_at ASC', [projectId]);
    res.json(rows);
  } catch (error) {
    console.error('Error fetching tareas:', error);
    res.status(500).json({ error: 'Error fetching tareas' });
  }
});

// POST new task
router.post('/:id/tareas', async (req, res) => {
  try {
    const projectId = req.params.id;
    const { descripcion } = req.body;
    
    if (!descripcion) {
      return res.status(400).json({ error: 'La descripción es obligatoria' });
    }

    const [result] = await pool.execute(
      'INSERT INTO tareas_proyecto (proyecto_id, descripcion, completada) VALUES (?, ?, 0)',
      [projectId, descripcion]
    );
    
    res.status(201).json({ id: result.insertId, message: 'Tarea añadida exitosamente' });
  } catch (error) {
    console.error('Error creating tarea:', error);
    res.status(500).json({ error: 'Error al crear tarea' });
  }
});

// PUT update task completion status
router.put('/tareas/:tareaId', async (req, res) => {
  try {
    const tareaId = req.params.tareaId;
    const { completada } = req.body;
    
    const [result] = await pool.execute(
      'UPDATE tareas_proyecto SET completada = ? WHERE id = ?',
      [completada ? 1 : 0, tareaId]
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Tarea no encontrada' });
    }
    
    res.json({ message: 'Tarea actualizada exitosamente' });
  } catch (error) {
    console.error('Error updating tarea:', error);
    res.status(500).json({ error: 'Error al actualizar tarea' });
  }
});

// DELETE task
router.delete('/tareas/:tareaId', async (req, res) => {
  try {
    const tareaId = req.params.tareaId;
    const [result] = await pool.execute('DELETE FROM tareas_proyecto WHERE id = ?', [tareaId]);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Tarea no encontrada' });
    }
    
    res.json({ message: 'Tarea eliminada exitosamente' });
  } catch (error) {
    console.error('Error deleting tarea:', error);
    res.status(500).json({ error: 'Error al eliminar tarea' });
  }
});

module.exports = router;
