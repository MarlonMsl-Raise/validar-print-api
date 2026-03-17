// ============================================================
// Roteador principal - agrega todas as rotas
// ============================================================

const express = require('express');
const router = express.Router();

router.use('/', require('./health'));
router.use('/', require('./machines'));
router.use('/', require('./jobs'));
router.use('/', require('./logs'));
router.use('/', require('./dashboard'));

module.exports = router;
