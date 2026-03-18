// ============================================================
// Testes de integração: Transições de status de jobs
// Usa node:test (built-in Node 18+) — sem dependências externas
//
// Pré-requisitos:
//   - DB rodando com schema.sql + seeds.sql aplicados
//   - Migration 001_add_lock_expires_at.sql aplicada
//   - Arquivo .env configurado (ou variáveis de ambiente definidas)
//
// Rodar: npm test
// ============================================================

'use strict';

require('dotenv').config();

const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const { query, pool }  = require('../src/config/database');
const jobService       = require('../src/services/jobService');

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Busca os IDs de seed necessários para criar um job de teste */
async function getSeedIds() {
  const clientRes = await query(
    `SELECT id FROM clients WHERE slug = $1 AND ativo = true LIMIT 1`,
    ['orly_burguer']
  );
  if (clientRes.rows.length === 0) {
    throw new Error('Seed "orly_burguer" não encontrado. Execute seeds.sql antes dos testes.');
  }

  const machineRes = await query(
    `SELECT id FROM machines WHERE machine_token = $1 AND ativo = true LIMIT 1`,
    ['machine-token-orly-caixa-2024']
  );
  if (machineRes.rows.length === 0) {
    throw new Error('Seed machine-token-orly-caixa-2024 não encontrado. Execute seeds.sql.');
  }

  const printerRes = await query(
    `SELECT id FROM printers WHERE machine_id = $1 AND is_default = true AND ativo = true LIMIT 1`,
    [machineRes.rows[0].id]
  );
  if (printerRes.rows.length === 0) {
    throw new Error('Impressora padrão não encontrada para a máquina seed.');
  }

  return {
    clientId:  clientRes.rows[0].id,
    machineId: machineRes.rows[0].id,
    printerId: printerRes.rows[0].id,
  };
}

/**
 * Insere um job de teste diretamente no banco com status especificado.
 * Retorna o job inserido.
 */
async function insertTestJob(clientId, machineId, printerId, status = 'pending') {
  const res = await query(
    `INSERT INTO print_jobs
       (client_id, machine_id, printer_id, job_name, source_type, pdf_url, status, copies)
     VALUES ($1, $2, $3, 'TEST JOB', 'pdf_url', 'http://test.local/test.pdf', $4, 1)
     RETURNING *`,
    [clientId, machineId, printerId, status]
  );
  return res.rows[0];
}

/** Remove jobs de teste criados pelo suite (cleanup) */
async function deleteTestJob(jobId) {
  await query(`DELETE FROM print_jobs WHERE id = $1`, [jobId]);
}

// ── Suite ────────────────────────────────────────────────────────────────────

describe('jobService.updateStatus — transições de status', async () => {
  let clientId, machineId, printerId;

  before(async () => {
    const ids = await getSeedIds();
    clientId  = ids.clientId;
    machineId = ids.machineId;
    printerId = ids.printerId;
  });

  after(async () => {
    // Encerra o pool para o processo poder sair limpo
    await pool.end();
  });

  // ── Transição principal: picked → printing ────────────────────────────────

  test('picked → printing: deve setar status, printing_at e lock_expires_at', async () => {
    const job = await insertTestJob(clientId, machineId, printerId, 'picked');
    try {
      const updated = await jobService.updateStatus({
        jobId:     job.id,
        machineId: machineId,
        newStatus: 'printing',
      });

      assert.equal(updated.status, 'printing', 'status deve ser "printing"');
      assert.ok(updated.printing_at,    'printing_at deve estar preenchido');
      assert.ok(updated.lock_expires_at, 'lock_expires_at deve estar preenchido');

      // lock_expires_at deve estar no futuro
      assert.ok(
        new Date(updated.lock_expires_at) > new Date(),
        'lock_expires_at deve ser uma data futura'
      );
    } finally {
      await deleteTestJob(job.id);
    }
  });

  // ── Transição: picked → printed ───────────────────────────────────────────

  test('picked → printed: deve setar status, printed_at e limpar lock_expires_at', async () => {
    const job = await insertTestJob(clientId, machineId, printerId, 'picked');
    try {
      const updated = await jobService.updateStatus({
        jobId:     job.id,
        machineId: machineId,
        newStatus: 'printed',
      });

      assert.equal(updated.status, 'printed', 'status deve ser "printed"');
      assert.ok(updated.printed_at,         'printed_at deve estar preenchido');
      assert.equal(updated.lock_expires_at, null, 'lock_expires_at deve ser NULL');
    } finally {
      await deleteTestJob(job.id);
    }
  });

  // ── Transição: printing → printed ─────────────────────────────────────────

  test('printing → printed: deve setar status, printed_at e limpar lock', async () => {
    const job = await insertTestJob(clientId, machineId, printerId, 'printing');
    try {
      const updated = await jobService.updateStatus({
        jobId:     job.id,
        machineId: machineId,
        newStatus: 'printed',
      });

      assert.equal(updated.status, 'printed');
      assert.ok(updated.printed_at);
      assert.equal(updated.lock_expires_at, null);
    } finally {
      await deleteTestJob(job.id);
    }
  });

  // ── Transição: picked → error ─────────────────────────────────────────────

  test('picked → error: deve setar status, error_at, error_message e limpar lock', async () => {
    const job = await insertTestJob(clientId, machineId, printerId, 'picked');
    try {
      const updated = await jobService.updateStatus({
        jobId:        job.id,
        machineId:    machineId,
        newStatus:    'error',
        errorMessage: 'SumatraPDF exited with code 1',
      });

      assert.equal(updated.status, 'error');
      assert.ok(updated.error_at,                  'error_at deve estar preenchido');
      assert.equal(updated.error_message, 'SumatraPDF exited with code 1');
      assert.equal(updated.lock_expires_at, null,  'lock_expires_at deve ser NULL');
    } finally {
      await deleteTestJob(job.id);
    }
  });

  // ── Transição: pending → cancelled ───────────────────────────────────────

  test('pending → cancelled: deve setar status e limpar lock', async () => {
    const job = await insertTestJob(clientId, machineId, printerId, 'pending');
    try {
      const updated = await jobService.updateStatus({
        jobId:     job.id,
        machineId: machineId,
        newStatus: 'cancelled',
      });

      assert.equal(updated.status, 'cancelled');
      assert.equal(updated.lock_expires_at, null);
    } finally {
      await deleteTestJob(job.id);
    }
  });

  // ── Transição inválida: pending → printing ────────────────────────────────

  test('pending → printing: deve lançar erro 409 (transição inválida)', async () => {
    const job = await insertTestJob(clientId, machineId, printerId, 'pending');
    try {
      await assert.rejects(
        () => jobService.updateStatus({
          jobId:     job.id,
          machineId: machineId,
          newStatus: 'printing',
        }),
        (err) => {
          assert.ok(err.status === 409, `Esperava status 409, recebeu ${err.status}`);
          return true;
        },
        'Deve rejeitar com erro quando a transição é inválida'
      );
    } finally {
      await deleteTestJob(job.id);
    }
  });

  // ── Transição inválida: printed → printing ────────────────────────────────

  test('printed → printing: deve lançar erro 409 (job já finalizado)', async () => {
    const job = await insertTestJob(clientId, machineId, printerId, 'printed');
    try {
      await assert.rejects(
        () => jobService.updateStatus({
          jobId:     job.id,
          machineId: machineId,
          newStatus: 'printing',
        }),
        (err) => {
          assert.ok(err.status === 409);
          return true;
        }
      );
    } finally {
      await deleteTestJob(job.id);
    }
  });

  // ── Status desconhecido ───────────────────────────────────────────────────

  test('status desconhecido: deve lançar erro 400', async () => {
    const job = await insertTestJob(clientId, machineId, printerId, 'picked');
    try {
      await assert.rejects(
        () => jobService.updateStatus({
          jobId:     job.id,
          machineId: machineId,
          newStatus: 'flying',
        }),
        (err) => {
          assert.ok(err.status === 400, `Esperava 400, recebeu ${err.status}`);
          return true;
        }
      );
    } finally {
      await deleteTestJob(job.id);
    }
  });

  // ── Ownership: máquina errada deve lançar 403 ─────────────────────────────

  test('machine_id errado: deve lançar erro 403 (acesso negado)', async () => {
    const job = await insertTestJob(clientId, machineId, printerId, 'picked');
    const fakeMachineId = '00000000-0000-0000-0000-000000000000';
    try {
      await assert.rejects(
        () => jobService.updateStatus({
          jobId:     job.id,
          machineId: fakeMachineId,
          newStatus: 'printing',
        }),
        (err) => {
          // Pode ser 403 (máquina errada) ou 409 (job existe mas machine_id não bate)
          assert.ok([403, 409].includes(err.status), `Esperava 403 ou 409, recebeu ${err.status}`);
          return true;
        }
      );
    } finally {
      await deleteTestJob(job.id);
    }
  });

  // ── claimNextJob: atomicidade de lock ─────────────────────────────────────

  test('claimNextJob: deve retornar null quando não há jobs pending', async () => {
    // Usa um machineId que não existe para garantir que não há jobs
    const nonExistentMachineId = '00000000-0000-0000-0000-000000000001';
    const result = await jobService.claimNextJob(nonExistentMachineId);
    assert.equal(result, null, 'Deve retornar null quando não há jobs');
  });

  test('claimNextJob: deve reservar job pending e setar status picked', async () => {
    const job = await insertTestJob(clientId, machineId, printerId, 'pending');
    try {
      const claimed = await jobService.claimNextJob(machineId);

      assert.ok(claimed !== null, 'Deve retornar um job');
      assert.equal(claimed.id, job.id, 'Deve retornar o job inserido');
      assert.equal(claimed.status, 'picked', 'Status deve ser "picked"');
      assert.ok(claimed.picked_at,     'picked_at deve estar preenchido');
      assert.ok(claimed.lock_expires_at, 'lock_expires_at deve estar preenchido');
    } finally {
      await deleteTestJob(job.id);
    }
  });
});
