// ============================================================
// Serviço de Jobs de Impressão
// ============================================================

const { query } = require('../config/database');
const logService = require('./logService');

const JOB_LOCK_SECONDS = 120;

/**
 * Cria um novo job de impressão.
 * Valida cliente, máquina, impressora e ownership.
 */
async function createJob({ clientSlug, machineToken, printerName, jobName, pdfUrl, copies, rawPayload }) {
  const clientResult = await query(
    `SELECT * FROM clients WHERE slug = $1 AND ativo = true`,
    [clientSlug]
  );
  if (clientResult.rows.length === 0) {
    throw Object.assign(new Error(`Cliente não encontrado: ${clientSlug}`), { status: 404 });
  }
  const client = clientResult.rows[0];

  const machineResult = await query(
    `SELECT m.*, p.id AS printer_id, p.nome_exibicao AS printer_nome
     FROM machines m
     LEFT JOIN printers p ON p.machine_id = m.id
       AND LOWER(p.nome_exibicao) = LOWER($1)
       AND p.ativo = true
     WHERE m.machine_token = $2
       AND m.ativo = true`,
    [printerName, machineToken]
  );

  if (machineResult.rows.length === 0) {
    throw Object.assign(new Error(`Máquina não encontrada com token: ${machineToken}`), { status: 404 });
  }

  const machineRow = machineResult.rows[0];

  if (machineRow.client_id !== client.id) {
    await logService.log({
      level: 'warn',
      eventName: 'job.create.ownership_violation',
      message: `Cliente ${clientSlug} tentou criar job em máquina de outro cliente`,
      payload: { clientSlug, machineToken },
    });
    throw Object.assign(new Error('Acesso negado: máquina não pertence ao cliente.'), { status: 403 });
  }

  let printerId = machineRow.printer_id;

  if (!printerId) {
    const printerResult = await query(
      `SELECT id
       FROM printers
       WHERE machine_id = $1
         AND LOWER(nome_sistema_windows) = LOWER($2)
         AND ativo = true
       LIMIT 1`,
      [machineRow.id, printerName]
    );

    if (printerResult.rows.length === 0) {
      throw Object.assign(
        new Error(`Impressora não encontrada: "${printerName}" na máquina ${machineRow.nome_da_maquina}`),
        { status: 404 }
      );
    }

    printerId = printerResult.rows[0].id;
  }

  const insertResult = await query(
    `INSERT INTO print_jobs
       (client_id, machine_id, printer_id, job_name, source_type, pdf_url, status, copies, raw_payload_json)
     VALUES ($1, $2, $3, $4, 'pdf_url', $5, 'pending', $6, $7)
     RETURNING *`,
    [
      client.id,
      machineRow.id,
      printerId,
      jobName,
      pdfUrl,
      copies || 1,
      rawPayload ? JSON.stringify(rawPayload) : null,
    ]
  );

  const job = insertResult.rows[0];
  job.printer_nome = printerName;

  await logService.logJobCreated(job);

  return job;
}

/**
 * Busca e RESERVA atomicamente o próximo job da máquina.
 * Usa FOR UPDATE SKIP LOCKED para impedir duplicidade.
 */
async function claimNextJob(machineId) {
  const result = await query(
    `
    WITH candidate AS (
      SELECT j.id
      FROM print_jobs j
      WHERE j.machine_id = $1
        AND (
          j.status = 'pending'
          OR (
            j.status IN ('picked', 'printing')
            AND j.lock_expires_at IS NOT NULL
            AND j.lock_expires_at < NOW()
          )
        )
      ORDER BY
        CASE WHEN j.status = 'pending' THEN 0 ELSE 1 END,
        j.created_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    UPDATE print_jobs j
       SET status = 'picked',
           picked_at = NOW(),
           lock_expires_at = NOW() + ($2 * interval '1 second'),
           error_at = NULL,
           error_message = NULL
      FROM candidate c
     WHERE j.id = c.id
     RETURNING j.*;
    `,
    [machineId, JOB_LOCK_SECONDS]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const claimed = result.rows[0];

  const fullResult = await query(
    `SELECT j.*,
            p.nome_exibicao AS printer_nome_exibicao,
            p.nome_sistema_windows AS printer_nome_sistema,
            p.is_default AS printer_is_default
     FROM print_jobs j
     JOIN printers p ON p.id = j.printer_id
     WHERE j.id = $1`,
    [claimed.id]
  );

  const job = fullResult.rows[0];

  await logService.logJobPicked(job.id, machineId);

  return job;
}

/**
 * Atualiza status do job garantindo que:
 * - o job pertence à máquina autenticada
 * - a transição é válida (via validTransitions)
 * - o lock é respeitado
 *
 * IMPORTANTE — por que SQL dinâmico aqui:
 * Reutilizar o mesmo parâmetro posicional ($1) em dois contextos diferentes
 * no mesmo statement causa o erro do PostgreSQL:
 *   "inconsistent types deduced for parameter $1"
 * porque o planner infere tipos distintos:
 *   SET status = $1  →  character varying(20)  (tipo da coluna)
 *   CASE WHEN $1 = 'printing'  →  text          (comparação com literal)
 * varchar(20) e text têm OIDs diferentes; o sistema de inferência não reconcilia.
 * Solução: cada parâmetro aparece uma única vez, com tipo não ambíguo.
 */
async function updateStatus({ jobId, machineId, newStatus, errorMessage }) {
  const validTransitions = {
    printing:  ['picked'],
    printed:   ['picked', 'printing'],
    error:     ['picked', 'printing'],
    cancelled: ['pending', 'picked'],
  };

  const allowedFrom = validTransitions[newStatus];
  if (!allowedFrom) {
    throw Object.assign(new Error(`Transição inválida para status: ${newStatus}`), { status: 400 });
  }

  // Constrói SET dinamicamente: cada $n usado uma única vez, sem CASE sobre $1
  const setClauses = [];
  const params     = [];
  let   idx        = 1;

  // $1 = newStatus — aparece somente aqui, tipo não ambíguo
  setClauses.push(`status = $${idx++}`);
  params.push(newStatus);

  // Campos por branch — sem CASE que reutilize $1
  if (newStatus === 'printing') {
    setClauses.push(`printing_at     = NOW()`);
    // Intervalo como literal SQL: evita passar integer com || (string concat)
    setClauses.push(`lock_expires_at = NOW() + interval '${JOB_LOCK_SECONDS} seconds'`);
  } else if (newStatus === 'printed') {
    setClauses.push(`printed_at      = NOW()`);
    setClauses.push(`lock_expires_at = NULL`);
  } else if (newStatus === 'error') {
    setClauses.push(`error_at        = NOW()`);
    setClauses.push(`error_message   = $${idx++}`);  // único lugar onde errorMessage entra
    setClauses.push(`lock_expires_at = NULL`);
    params.push(errorMessage || 'Erro desconhecido');
  } else if (newStatus === 'cancelled') {
    setClauses.push(`lock_expires_at = NULL`);
  }

  // WHERE: cast explícito de uuid evita ambiguidade em DBs estritos
  const idIdx      = idx++;
  const machineIdx = idx++;
  const fromIdx    = idx++;

  params.push(jobId);
  params.push(machineId);
  params.push(allowedFrom);

  const sql = `
    UPDATE print_jobs
       SET ${setClauses.join(',\n           ')}
     WHERE id         = $${idIdx}::uuid
       AND machine_id = $${machineIdx}::uuid
       AND status     = ANY($${fromIdx}::text[])
     RETURNING *
  `;

  const result = await query(sql, params);

  if (result.rows.length === 0) {
    // Distingue 404 / 403 / 409 para o client saber o que aconteceu
    const current = await query(
      `SELECT id, status, machine_id FROM print_jobs WHERE id = $1::uuid`,
      [jobId]
    );

    if (current.rows.length === 0) {
      throw Object.assign(new Error(`Job não encontrado: ${jobId}`), { status: 404 });
    }

    const row = current.rows[0];

    if (String(row.machine_id) !== String(machineId)) {
      throw Object.assign(new Error('Acesso negado: este job não pertence a esta máquina.'), { status: 403 });
    }

    throw Object.assign(
      new Error(`Transição inválida. Status atual do job: ${row.status}`),
      { status: 409 }
    );
  }

  const job = result.rows[0];

  if (newStatus === 'printing') await logService.logJobPrinting(jobId);
  if (newStatus === 'printed')  await logService.logJobPrinted(jobId);
  if (newStatus === 'error')    await logService.logJobError(jobId, errorMessage || 'Erro desconhecido');

  return job;
}

/**
 * Lista jobs com filtros opcionais
 */
async function listJobs({ status, clientSlug, machineToken, printerName, dateFrom, dateTo, limit = 100, offset = 0 }) {
  const conditions = [];
  const params = [];
  let idx = 1;

  if (status) {
    conditions.push(`j.status = $${idx++}`);
    params.push(status);
  }
  if (clientSlug) {
    conditions.push(`c.slug = $${idx++}`);
    params.push(clientSlug);
  }
  if (machineToken) {
    conditions.push(`m.machine_token = $${idx++}`);
    params.push(machineToken);
  }
  if (printerName) {
    conditions.push(`LOWER(p.nome_exibicao) LIKE LOWER($${idx++})`);
    params.push(`%${printerName}%`);
  }
  if (dateFrom) {
    conditions.push(`j.created_at >= $${idx++}`);
    params.push(dateFrom);
  }
  if (dateTo) {
    conditions.push(`j.created_at <= $${idx++}`);
    params.push(dateTo);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  params.push(limit);
  params.push(offset);

  const sql = `
    SELECT
      j.*,
      c.nome AS client_nome,
      c.slug AS client_slug,
      m.nome_da_maquina,
      p.nome_exibicao AS printer_nome,
      p.nome_sistema_windows AS printer_sistema
    FROM print_jobs j
    JOIN clients  c ON c.id = j.client_id
    JOIN machines m ON m.id = j.machine_id
    LEFT JOIN printers p ON p.id = j.printer_id
    ${where}
    ORDER BY j.created_at DESC
    LIMIT $${idx++} OFFSET $${idx}
  `;

  const result = await query(sql, params);
  return result.rows;
}

/**
 * Busca um job por ID
 */
async function findById(jobId) {
  const result = await query(
    `SELECT j.*,
            c.nome AS client_nome, c.slug AS client_slug,
            m.nome_da_maquina,
            p.nome_exibicao AS printer_nome
     FROM print_jobs j
     JOIN clients  c ON c.id = j.client_id
     JOIN machines m ON m.id = j.machine_id
     LEFT JOIN printers p ON p.id = j.printer_id
     WHERE j.id = $1`,
    [jobId]
  );
  return result.rows[0] || null;
}

module.exports = { createJob, claimNextJob, updateStatus, listJobs, findById };