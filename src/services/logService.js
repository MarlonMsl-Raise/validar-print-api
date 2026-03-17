// ============================================================
// Serviço de Logs de Eventos
// Registra todos os eventos importantes do sistema
// ============================================================

const { query } = require('../config/database');

/**
 * Registra um evento no banco de dados
 * @param {Object} opts
 * @param {string} [opts.entityType] - Tipo da entidade ('job', 'machine', 'printer', 'client', 'system')
 * @param {string} [opts.entityId]   - UUID da entidade
 * @param {string} [opts.level]      - 'debug' | 'info' | 'warn' | 'error'
 * @param {string} opts.eventName    - Identificador do evento, ex: 'job.created'
 * @param {string} opts.message      - Mensagem legível
 * @param {Object} [opts.payload]    - Dados extras (será salvo como JSONB)
 */
async function log(opts) {
  const {
    entityType = null,
    entityId   = null,
    level      = 'info',
    eventName,
    message,
    payload    = null,
  } = opts;

  try {
    await query(
      `INSERT INTO event_logs
         (entity_type, entity_id, level, event_name, message, payload_json)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        entityType,
        entityId || null,
        level,
        eventName,
        message,
        payload ? JSON.stringify(payload) : null,
      ]
    );
  } catch (err) {
    // Nunca deixar falha no log quebrar o fluxo principal
    console.error('[LOG SERVICE] Falha ao registrar log:', err.message);
  }
}

/**
 * Registra log específico de heartbeat (debug, para não poluir)
 */
async function logHeartbeat(machineId, machineName) {
  await log({
    entityType: 'machine',
    entityId: machineId,
    level: 'debug',
    eventName: 'machine.heartbeat',
    message: `Heartbeat recebido da máquina ${machineName}`,
    payload: { timestamp: new Date().toISOString() },
  });
}

/**
 * Registra log de criação de job
 */
async function logJobCreated(job) {
  await log({
    entityType: 'job',
    entityId: job.id,
    level: 'info',
    eventName: 'job.created',
    message: `Job criado: ${job.job_name}`,
    payload: {
      jobId: job.id,
      jobName: job.job_name,
      copies: job.copies,
      printerName: job.printer_nome,
    },
  });
}

/**
 * Registra log quando job é pego pela máquina
 */
async function logJobPicked(jobId, machineToken) {
  await log({
    entityType: 'job',
    entityId: jobId,
    level: 'info',
    eventName: 'job.picked',
    message: `Job ${jobId} pego pela máquina`,
    payload: { machineToken },
  });
}

/**
 * Registra log de início de impressão
 */
async function logJobPrinting(jobId) {
  await log({
    entityType: 'job',
    entityId: jobId,
    level: 'info',
    eventName: 'job.printing',
    message: `Job ${jobId} em impressão`,
  });
}

/**
 * Registra log de impressão concluída
 */
async function logJobPrinted(jobId) {
  await log({
    entityType: 'job',
    entityId: jobId,
    level: 'info',
    eventName: 'job.printed',
    message: `Job ${jobId} impresso com sucesso`,
  });
}

/**
 * Registra log de falha na impressão
 */
async function logJobError(jobId, errorMessage) {
  await log({
    entityType: 'job',
    entityId: jobId,
    level: 'error',
    eventName: 'job.error',
    message: `Job ${jobId} falhou: ${errorMessage}`,
    payload: { errorMessage },
  });
}

/**
 * Registra log de sincronização de impressoras
 */
async function logPrinterSync(machineId, machineName, count) {
  await log({
    entityType: 'machine',
    entityId: machineId,
    level: 'info',
    eventName: 'printer.sync',
    message: `Impressoras sincronizadas para ${machineName}: ${count} impressora(s)`,
    payload: { count },
  });
}

module.exports = {
  log,
  logHeartbeat,
  logJobCreated,
  logJobPicked,
  logJobPrinting,
  logJobPrinted,
  logJobError,
  logPrinterSync,
};
