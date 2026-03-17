const express = require('express');
const router = express.Router();
const { listLogs } = require('../controllers/logsController');

// GET /logs - Lista logs com filtros
router.get('/logs', listLogs);

module.exports = router;
