// ============================================================
// Controller: Jobs de Impressão
// ============================================================

const jobService = require('../services/jobService');

/**
 * POST /jobs
 * Cria um novo job de impressão
 */
async function createJob(req, res, next) {
  try {
    const {
      clientSlug,
      machineToken,
      printerName,
      jobName,
      pdfUrl,
      copies,
    } = req.body;

    const missing = [];
    if (!clientSlug)   missing.push('clientSlug');
    if (!machineToken) missing.push('machineToken');
    if (!printerName)  missing.push('printerName');
    if (!jobName)      missing.push('jobName');
    if (!pdfUrl)       missing.push('pdfUrl');

    if (missing.length > 0) {
      return res.status(400).json({
        error: `Campos obrigatórios ausentes: ${missing.join(', ')}`,
      });
    }

    if (copies !== undefined && (isNaN(copies) || copies < 1 || copies > 999)) {
      return res.status(400).json({ error: 'copies deve ser um número entre 1 e 999.' });
    }

    const job = await jobService.createJob({
      clientSlug,
      machineToken,
      printerName,
      jobName,
      pdfUrl,
      copies: parseInt(copies, 10) || 1,
      rawPayload: req.body,
    });

    res.status(201).json({
      success: true,
      job: {
        id: job.id,
        jobName: job.job_name,
        status: job.status,
        copies: job.copies,
        createdAt: job.created_at,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /machines/:machineToken/jobs/next
 * Busca e RESERVA atomicamente o próximo job para a máquina
 */
async function getNextJob(req, res, next) {
  try {
    const machine = req.machine;
    const job = await jobService.claimNextJob(machine.id);

    if (!job) {
      return res.status(204).send();
    }

    res.json({
      job: {
        id: job.id,
        jobName: job.job_name,
        pdfUrl: job.pdf_url,
        copies: job.copies,
        status: job.status,
        createdAt: job.created_at,
        pickedAt: job.picked_at,
        lockExpiresAt: job.lock_expires_at,
        printer: {
          id: job.printer_id,
          displayName: job.printer_nome_exibicao,
          systemName: job.printer_nome_sistema,
          isDefault: job.printer_is_default,
        },
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /machines/:machineToken/jobs/:id/status
 * Atualiza o status de um job com validação da máquina autenticada
 */
async function updateJobStatus(req, res, next) {
  try {
    const machine = req.machine;
    const { id } = req.params;
    const { status, errorMessage } = req.body;

    const validStatuses = ['printing', 'printed', 'error', 'cancelled'];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({
        error: `Status inválido. Valores aceitos: ${validStatuses.join(', ')}`,
      });
    }

    if (status === 'error' && !errorMessage) {
      return res.status(400).json({
        error: 'errorMessage é obrigatório quando status = error.',
      });
    }

    const job = await jobService.updateStatus({
      jobId: id,
      machineId: machine.id,
      newStatus: status,
      errorMessage,
    });

    res.json({
      success: true,
      job: {
        id: job.id,
        status: job.status,
        pickedAt: job.picked_at,
        printingAt: job.printing_at,
        printedAt: job.printed_at,
        errorAt: job.error_at,
        errorMessage: job.error_message,
        lockExpiresAt: job.lock_expires_at,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /jobs
 * Lista jobs com filtros
 */
async function listJobs(req, res, next) {
  try {
    const {
      status,
      client,
      machine,
      printer,
      date_from,
      date_to,
      limit = 100,
      offset = 0,
    } = req.query;

    const jobs = await jobService.listJobs({
      status,
      clientSlug: client,
      machineToken: machine,
      printerName: printer,
      dateFrom: date_from,
      dateTo: date_to,
      limit: Math.min(parseInt(limit, 10) || 100, 500),
      offset: parseInt(offset, 10) || 0,
    });

    res.json({ jobs, count: jobs.length });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /jobs/:id
 * Detalhe de um job
 */
async function getJob(req, res, next) {
  try {
    const job = await jobService.findById(req.params.id);
    if (!job) {
      return res.status(404).json({ error: 'Job não encontrado.' });
    }
    res.json({ job });
  } catch (err) {
    next(err);
  }
}

module.exports = { createJob, getNextJob, updateJobStatus, listJobs, getJob };