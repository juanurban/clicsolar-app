const pool = require('./db');
async function test() {
  const [rows] = await pool.execute('SELECT id, nombre, historial_consumo FROM clientes ORDER BY updated_at DESC LIMIT 5');
  console.log(rows);
  process.exit();
}
test();
