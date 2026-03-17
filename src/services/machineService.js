// ============================================================
// Serviço de Máquinas e Impressoras
// ============================================================

const { query, getClient } = require('../config/database');
const logService = require('./logService');

/**
 * Atualiza heartbeat da máquina e marca como online
 */
async function updateHeartbeat(machine) {
  await query(
    `UPDATE machines
     SET ultimo_heartbeat = NOW(),
         status_online = true
     WHERE id = $1`,
    [machine.id]
  );

  await logService.logHeartbeat(machine.id, machine.nome_da_maquina);

  return { ok: true, timestamp: new Date().toISOString() };
}

/**
 * Sincroniza impressoras da máquina.
 * Cria novas, atualiza existentes, desativa removidas.
 */
async function syncPrinters(machine, printers) {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    // Busca impressoras atuais da máquina
    const existing = await client.query(
      `SELECT id, nome_sistema_windows FROM printers WHERE machine_id = $1`,
      [machine.id]
    );

    const existingMap = {};
    existing.rows.forEach((p) => {
      existingMap[p.nome_sistema_windows.toLowerCase()] = p.id;
    });

    const incomingNames = printers.map((p) => p.systemName.toLowerCase());
    let created = 0;
    let updated = 0;

    for (const printer of printers) {
      const key = printer.systemName.toLowerCase();
      const existingId = existingMap[key];

      if (existingId) {
        // Atualiza impressora existente
        await client.query(
          `UPDATE printers
           SET nome_exibicao = $1,
               is_default = $2,
               ativo = true,
               updated_at = NOW()
           WHERE id = $3`,
          [printer.displayName, printer.isDefault === true, existingId]
        );
        updated++;
      } else {
        // Cria nova impressora
        await client.query(
          `INSERT INTO printers (machine_id, nome_exibicao, nome_sistema_windows, is_default, ativo)
           VALUES ($1, $2, $3, $4, true)`,
          [machine.id, printer.displayName, printer.systemName, printer.isDefault === true]
        );
        created++;
      }
    }

    // Desativa impressoras que não vieram na sincronização
    let deactivated = 0;
    for (const [name, id] of Object.entries(existingMap)) {
      if (!incomingNames.includes(name)) {
        await client.query(
          `UPDATE printers SET ativo = false, updated_at = NOW() WHERE id = $1`,
          [id]
        );
        deactivated++;
      }
    }

    await client.query('COMMIT');

    await logService.logPrinterSync(machine.id, machine.nome_da_maquina, printers.length);

    return { created, updated, deactivated, total: printers.length };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Busca máquina por token
 */
async function findByToken(machineToken) {
  const result = await query(
    `SELECT m.*, c.slug AS client_slug, c.nome AS client_nome
     FROM machines m
     JOIN clients c ON c.id = m.client_id
     WHERE m.machine_token = $1 AND m.ativo = true`,
    [machineToken]
  );
  return result.rows[0] || null;
}

/**
 * Marca máquinas como offline se não enviaram heartbeat recentemente
 */
async function markOfflineMachines(timeoutSeconds = 120) {
  const result = await query(
    `UPDATE machines
     SET status_online = false
     WHERE status_online = true
       AND (ultimo_heartbeat IS NULL
            OR ultimo_heartbeat < NOW() - INTERVAL '1 second' * $1)
     RETURNING id, nome_da_maquina`,
    [timeoutSeconds]
  );
  return result.rows;
}

module.exports = { updateHeartbeat, syncPrinters, findByToken, markOfflineMachines };
