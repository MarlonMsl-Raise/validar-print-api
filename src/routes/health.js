const express = require('express');
const router = express.Router();
const { health } = require('../controllers/healthController');

// GET /health
router.get('/health', health);

module.exports = router;
