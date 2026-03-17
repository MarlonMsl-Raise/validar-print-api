// ============================================================
// Controller: Logs de Eventos
// ============================================================

const { query } = require('../config/database');

/**
 * GET /logs
 * Lista logs com filtros opcionais
 */
async function listLogs(req, res, next) {
  try {
    const {
      entity_type,
      entity_id,
      level,
      event_name,
      date_from,
      date_to,
      limit = 200,
      offset = 0,
    } = req.query;

    const conditions = [];
    const params = [];
    let idx = 1;

    if (entity_type) {
      conditions.push(`entity_type = $${idx++}`);
      params.push(entity_type);
    }
    if (entity_id) {
      conditions.push(`entity_id = $${idx++}`);
      params.push(entity_id);
    }
    if (level) {
      conditions.push(`level = $${idx++}`);
      params.push(level);
    }
    if (event_name) {
      conditions.push(`event_name ILIKE $${idx++}`);
      params.push(`%${event_name}%`);
    }
    if (date_from) {
      conditions.push(`created_at >= $${idx++}`);
      params.push(date_from);
    }
    if (date_to) {
      conditions.push(`created_at <= $${idx++}`);
      params.push(date_to);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    params.push(Math.min(parseInt(limit) || 200, 1000));
    params.push(parseInt(offset) || 0);

    const sql = `
      SELECT * FROM event_logs
      ${where}
      ORDER BY created_at DESC
      LIMIT $${idx++} OFFSET $${idx}
    `;

    const result = await query(sql, params);
    res.json({ logs: result.rows, count: result.rows.length });
  } catch (err) {
    next(err);
  }
}

module.exports = { listLogs };
