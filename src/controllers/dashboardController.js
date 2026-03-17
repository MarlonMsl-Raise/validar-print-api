// ============================================================
// Controller: Painel Web (Dashboard)
// ============================================================

const { query } = require('../config/database');
const { config } = require('../config/env');

/**
 * Busca os dados de summary para o dashboard
 */
async function getSummary() {
  const heartbeatTimeout = config.heartbeatTimeoutSeconds;

  const [machines, jobs, logs] = await Promise.all([
    query(`
      SELECT
        COUNT(*) FILTER (WHERE ativo = true)                          AS total_machines,
        COUNT(*) FILTER (WHERE ativo = true AND ultimo_heartbeat IS NOT NULL
          AND ultimo_heartbeat > NOW() - INTERVAL '1 second' * $1)   AS machines_online,
        COUNT(*) FILTER (WHERE ativo = true AND (ultimo_heartbeat IS NULL
          OR ultimo_heartbeat <= NOW() - INTERVAL '1 second' * $1))  AS machines_offline
      FROM machines
    `, [heartbeatTimeout]),

    query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'pending')   AS jobs_pending,
        COUNT(*) FILTER (WHERE status = 'printing')  AS jobs_printing,
        COUNT(*) FILTER (WHERE status = 'printed')   AS jobs_printed,
        COUNT(*) FILTER (WHERE status = 'error')     AS jobs_error,
        COUNT(*) FILTER (WHERE status = 'picked')    AS jobs_picked,
        COUNT(*)                                      AS jobs_total
      FROM print_jobs
    `),

    query(`SELECT COUNT(*) AS total_logs FROM event_logs`),
  ]);

  return {
    machines: machines.rows[0],
    jobs: jobs.rows[0],
    totalLogs: logs.rows[0].total_logs,
  };
}

/**
 * GET /dashboard
 */
async function dashboardPage(req, res, next) {
  try {
    const summary = await getSummary();
    res.render('dashboard', { title: 'Dashboard', summary, active: 'dashboard' });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /dashboard/machines
 */
async function machinesPage(req, res, next) {
  try {
    const heartbeatTimeout = config.heartbeatTimeoutSeconds;
    const result = await query(`
      SELECT
        m.id, m.nome_da_maquina, m.machine_token,
        m.ultimo_heartbeat, m.status_online, m.ativo, m.created_at,
        c.nome AS client_nome, c.slug AS client_slug,
        (m.ultimo_heartbeat IS NOT NULL
         AND m.ultimo_heartbeat > NOW() - INTERVAL '1 second' * $1
        ) AS online_real,
        (SELECT COUNT(*) FROM printers p WHERE p.machine_id = m.id AND p.ativo = true) AS total_impressoras
      FROM machines m
      JOIN clients c ON c.id = m.client_id
      ORDER BY online_real DESC, m.nome_da_maquina
    `, [heartbeatTimeout]);

    res.render('machines', { title: 'Máquinas', machines: result.rows, active: 'machines' });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /dashboard/printers
 */
async function printersPage(req, res, next) {
  try {
    const result = await query(`
      SELECT
        p.id, p.nome_exibicao, p.nome_sistema_windows,
        p.tipo_impressora, p.is_default, p.ativo, p.created_at,
        m.nome_da_maquina, m.id AS machine_id,
        c.nome AS client_nome
      FROM printers p
      JOIN machines m ON m.id = p.machine_id
      JOIN clients  c ON c.id = m.client_id
      ORDER BY c.nome, m.nome_da_maquina, p.is_default DESC, p.nome_exibicao
    `);

    res.render('printers', { title: 'Impressoras', printers: result.rows, active: 'printers' });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /dashboard/jobs
 */
async function jobsPage(req, res, next) {
  try {
    const { status, client, limit = 100 } = req.query;
    const conditions = [];
    const params = [];
    let idx = 1;

    if (status) {
      conditions.push(`j.status = $${idx++}`);
      params.push(status);
    }
    if (client) {
      conditions.push(`c.slug = $${idx++}`);
      params.push(client);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(Math.min(parseInt(limit) || 100, 500));

    const result = await query(`
      SELECT
        j.id, j.job_name, j.status, j.copies, j.pdf_url,
        j.created_at, j.picked_at, j.printing_at, j.printed_at,
        j.error_at, j.error_message,
        c.nome AS client_nome,
        m.nome_da_maquina,
        p.nome_exibicao AS printer_nome
      FROM print_jobs j
      JOIN clients  c ON c.id = j.client_id
      JOIN machines m ON m.id = j.machine_id
      LEFT JOIN printers p ON p.id = j.printer_id
      ${where}
      ORDER BY j.created_at DESC
      LIMIT $${idx}
    `, params);

    // Busca clientes para o filtro
    const clientsResult = await query(`SELECT slug, nome FROM clients WHERE ativo = true ORDER BY nome`);

    res.render('jobs', {
      title: 'Jobs de Impressão',
      jobs: result.rows,
      clients: clientsResult.rows,
      filterStatus: status || '',
      filterClient: client || '',
      active: 'jobs',
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /dashboard/logs
 */
async function logsPage(req, res, next) {
  try {
    const { level, event_name, entity_type, limit = 200 } = req.query;
    const conditions = [];
    const params = [];
    let idx = 1;

    if (level) {
      conditions.push(`level = $${idx++}`);
      params.push(level);
    }
    if (event_name) {
      conditions.push(`event_name ILIKE $${idx++}`);
      params.push(`%${event_name}%`);
    }
    if (entity_type) {
      conditions.push(`entity_type = $${idx++}`);
      params.push(entity_type);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(Math.min(parseInt(limit) || 200, 1000));

    const result = await query(`
      SELECT * FROM event_logs
      ${where}
      ORDER BY created_at DESC
      LIMIT $${idx}
    `, params);

    res.render('logs', {
      title: 'Logs',
      logs: result.rows,
      filterLevel: level || '',
      filterEvent: event_name || '',
      filterEntity: entity_type || '',
      active: 'logs',
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/dashboard/summary  (endpoint JSON para refresh)
 */
async function dashboardSummaryApi(req, res, next) {
  try {
    const summary = await getSummary();
    res.json(summary);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  dashboardPage,
  machinesPage,
  printersPage,
  jobsPage,
  logsPage,
  dashboardSummaryApi,
};
