// ============================================================
// Rotas de Jobs de Impressão
// ============================================================

const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/jobsController');

// POST /jobs - Cria job
// Validação de cliente e máquina é feita no service via clientSlug + machineToken no body
router.post('/jobs', ctrl.createJob);

// GET /jobs - Lista jobs com filtros (admin/painel)
router.get('/jobs', ctrl.listJobs);

// GET /jobs/:id - Detalhe de um job (admin/painel)
router.get('/jobs/:id', ctrl.getJob);

// NOTA: PATCH de status foi movido para routes/dashboard.js
// Endpoint: PATCH /machines/:machineToken/jobs/:id/status
// Motivo: requer authenticateMachine para validar ownership do job pela máquina

module.exports = router;
