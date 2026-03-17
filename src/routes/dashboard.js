// ============================================================
// Rotas do Painel Web e endpoints JSON do dashboard
// ============================================================

const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/dashboardController');
const jobsCtrl = require('../controllers/jobsController');
const { authenticateMachine } = require('../middleware/auth');

// ── Rotas do client Windows que precisam de authenticateMachine ──────────
// (definidas aqui para evitar conflito com /machines/:id na rota de admin)

// GET /machines/:machineToken/jobs/next
// Busca e reserva atomicamente o próximo job (FOR UPDATE SKIP LOCKED)
router.get('/machines/:machineToken/jobs/next', authenticateMachine, jobsCtrl.getNextJob);

// PATCH /machines/:machineToken/jobs/:id/status
// Atualiza status de um job — requer machineToken para validar ownership
router.patch('/machines/:machineToken/jobs/:id/status', authenticateMachine, jobsCtrl.updateJobStatus);

// ── Painel Web ────────────────────────────────────────────────────────────

// Redireciona raiz para dashboard
router.get('/', (req, res) => res.redirect('/dashboard'));

// Dashboard principal
router.get('/dashboard', ctrl.dashboardPage);

// Sub-páginas
router.get('/dashboard/machines', ctrl.machinesPage);
router.get('/dashboard/printers', ctrl.printersPage);
router.get('/dashboard/jobs',     ctrl.jobsPage);
router.get('/dashboard/logs',     ctrl.logsPage);

// API JSON para refresh do dashboard (usada pelo frontend via fetch)
router.get('/api/dashboard/summary', ctrl.dashboardSummaryApi);

module.exports = router;
