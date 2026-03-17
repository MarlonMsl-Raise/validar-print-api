// ============================================================
// Controller: Health Check
// ============================================================

const { query } = require('../config/database');

async function health(req, res) {
  let dbStatus = 'ok';
  let dbTimestamp = null;

  try {
    const result = await query('SELECT NOW() AS now');
    dbTimestamp = result.rows[0].now;
  } catch (err) {
    dbStatus = 'error';
  }

  const status = dbStatus === 'ok' ? 200 : 503;

  res.status(status).json({
    status: dbStatus === 'ok' ? 'ok' : 'degraded',
    api: 'online',
    database: dbStatus,
    dbTimestamp,
    serverTime: new Date().toISOString(),
    version: '1.0.0',
  });
}

module.exports = { health };
