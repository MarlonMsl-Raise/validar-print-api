// ============================================================
// Controller: Máquinas e Impressoras
// ============================================================

const machineService = require('../services/machineService');
const { query } = require('../config/database');

/**
 * POST /machines/:machineToken/heartbeat
 */
async function heartbeat(req, res, next) {
  try {
    const machine = req.machine;
    const result = await machineService.updateHeartbeat(machine);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /machines/:machineToken/printers/sync
 */
async function syncPrinters(req, res, next) {
  try {
    const machine = req.machine;
    const { printers } = req.body;

    if (!Array.isArray(printers) || printers.length === 0) {
      return res.status(400).json({ error: 'printers deve ser um array não vazio.' });
    }

    // Valida estrutura de cada impressora
    for (let i = 0; i < printers.length; i++) {
      const p = printers[i];
      if (!p.displayName || !p.systemName) {
        return res.status(400).json({
          error: `Impressora no índice ${i} está incompleta. Campos obrigatórios: displayName, systemName.`,
        });
      }
    }

    const result = await machineService.syncPrinters(machine, printers);

    res.json({
      success: true,
      machine: machine.nome_da_maquina,
      synced: result,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /machines
 * Lista todas as máquinas (admin)
 */
async function listMachines(req, res, next) {
  try {
    const result = await query(`
      SELECT
        m.id, m.nome_da_maquina, m.machine_token, m.ultimo_heartbeat,
        m.status_online, m.ativo, m.created_at,
        c.nome AS client_nome, c.slug AS client_slug,
        (SELECT COUNT(*) FROM printers p WHERE p.machine_id = m.id AND p.ativo = true) AS total_impressoras
      FROM machines m
      JOIN clients c ON c.id = m.client_id
      ORDER BY c.slug, m.nome_da_maquina
    `);
    res.json({ machines: result.rows });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /machines/:id/printers
 * Lista impressoras de uma máquina específica (por ID)
 */
async function getMachinePrinters(req, res, next) {
  try {
    const result = await query(
      `SELECT p.*, m.nome_da_maquina
       FROM printers p
       JOIN machines m ON m.id = p.machine_id
       WHERE p.machine_id = $1
       ORDER BY p.is_default DESC, p.nome_exibicao`,
      [req.params.id]
    );
    res.json({ printers: result.rows });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /printers
 * Lista todas as impressoras (admin)
 */
async function listPrinters(req, res, next) {
  try {
    const result = await query(`
      SELECT
        p.*,
        m.nome_da_maquina,
        m.machine_token,
        c.nome AS client_nome,
        c.slug AS client_slug
      FROM printers p
      JOIN machines m ON m.id = p.machine_id
      JOIN clients  c ON c.id = m.client_id
      ORDER BY c.slug, m.nome_da_maquina, p.is_default DESC, p.nome_exibicao
    `);
    res.json({ printers: result.rows });
  } catch (err) {
    next(err);
  }
}

module.exports = { heartbeat, syncPrinters, listMachines, getMachinePrinters, listPrinters };
