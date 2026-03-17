// ============================================================
// Rotas de Máquinas e Impressoras
// ============================================================

const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/machinesController');
const { authenticateMachine } = require('../middleware/auth');

// ── Endpoints usados pelo client Windows (autenticados por machineToken) ──

// POST /machines/:machineToken/heartbeat
router.post('/machines/:machineToken/heartbeat', authenticateMachine, ctrl.heartbeat);

// POST /machines/:machineToken/printers/sync
router.post('/machines/:machineToken/printers/sync', authenticateMachine, ctrl.syncPrinters);

// GET /machines/:machineToken/jobs/next  (declarada em jobs.js para ficar junto da lógica)
// A rota está definida em routes/jobs.js com authenticateMachine

// ── Endpoints admin ───────────────────────────────────────────────────────

// GET /machines - Lista todas as máquinas
router.get('/machines', ctrl.listMachines);

// GET /machines/:id/printers - Impressoras de uma máquina específica (por UUID)
router.get('/machines/:id/printers', ctrl.getMachinePrinters);

// GET /printers - Lista todas as impressoras
router.get('/printers', ctrl.listPrinters);

module.exports = router;
