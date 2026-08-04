const express = require('express');
const router = express.Router();
const pool = require('../db');

// ── Dashboard Stats ──
router.get('/dashboard/stats', async (req, res) => {
  try {
    const [[{total: totalCot}]] = await pool.execute('SELECT COUNT(*) as total FROM cotizaciones');
    const [[{total: borradores}]] = await pool.execute("SELECT COUNT(*) as total FROM cotizaciones WHERE estado = 'borrador'");
    const [[{total: enviadas}]] = await pool.execute("SELECT COUNT(*) as total FROM cotizaciones WHERE estado = 'enviada'");
    const [[{total: firmadas}]] = await pool.execute("SELECT COUNT(*) as total FROM cotizaciones WHERE estado = 'firmada'");
    const [[{total: revenue}]] = await pool.execute("SELECT COALESCE(SUM(total_inversion), 0) as total FROM cotizaciones WHERE estado = 'firmada'");
    const [[{total: energy}]] = await pool.execute("SELECT COALESCE(SUM(produccion_mensual_kwh * 12), 0) as total FROM cotizaciones WHERE estado = 'firmada'");
    const [[{total: totalClientes}]] = await pool.execute('SELECT COUNT(*) as total FROM clientes');

    const conversion = totalCot > 0 ? Math.round(firmadas / totalCot * 1000) / 10 : 0;

    const [recent] = await pool.execute(`
      SELECT c.id, c.codigo, c.estado, c.total_inversion, c.potencia_kwp, c.fecha,
             cl.nombre as cliente_nombre, cl.tipo_tarifa
      FROM cotizaciones c
      LEFT JOIN clientes cl ON c.cliente_id = cl.id
      ORDER BY c.fecha DESC LIMIT 5
    `);

    res.json({
      total_cotizaciones: totalCot,
      borradores,
      enviadas,
      firmadas,
      total_revenue: revenue,
      total_energy_kwh: energy,
      conversion_rate: conversion,
      total_clientes: totalClientes,
      recent_cotizaciones: recent
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ detail: 'Error del servidor' });
  }
});

module.exports = router;
