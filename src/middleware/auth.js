// ============================================================
// Middleware de Autenticação
// ============================================================

const { query } = require('../config/database');
const logService = require('../services/logService');

/**
 * Autentica a máquina pelo machineToken na URL.
 * Injeta req.machine com os dados.
 */
async function authenticateMachine(req, res, next) {
  const machineToken = req.params.machineToken;

  if (!machineToken) {
    return res.status(401).json({ error: 'machineToken ausente.' });
  }

  try {
    const result = await query(
      `SELECT m.*, c.slug AS client_slug, c.api_token AS client_api_token
       FROM machines m
       JOIN clients c ON c.id = m.client_id
       WHERE m.machine_token = $1 AND m.ativo = true`,
      [machineToken]
    );

    if (result.rows.length === 0) {
      await logService.log({
        level: 'warn',
        eventName: 'auth.machine.invalid_token',
        message: `Tentativa de acesso com machine_token inválido: ${machineToken}`,
        payload: { machineToken, ip: req.ip, path: req.path },
      });
      return res.status(401).json({ error: 'Machine token inválido ou máquina inativa.' });
    }

    req.machine = result.rows[0];
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Autentica requisição de criação de job.
 * Aceita: Bearer <api_token> no header Authorization
 * ou api_token no body.
 */
async function authenticateClient(req, res, next) {
  let token = null;

  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else if (req.body && req.body.apiToken) {
    token = req.body.apiToken;
  }

  if (!token) {
    return res.status(401).json({ error: 'API token ausente. Use Authorization: Bearer <token>' });
  }

  try {
    const result = await query(
      `SELECT * FROM clients WHERE api_token = $1 AND ativo = true`,
      [token]
    );

    if (result.rows.length === 0) {
      await logService.log({
        level: 'warn',
        eventName: 'auth.client.invalid_token',
        message: `Tentativa com api_token inválido`,
        payload: { token: token.substring(0, 10) + '...', ip: req.ip },
      });
      return res.status(401).json({ error: 'API token inválido ou cliente inativo.' });
    }

    req.client = result.rows[0];
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Autentica acesso ao painel admin.
 * Aceita: ADMIN_TOKEN no header X-Admin-Token ou query ?adminToken=
 */
function authenticateAdmin(req, res, next) {
  const adminToken = process.env.ADMIN_TOKEN || 'admin-token-dev';
  const provided = req.headers['x-admin-token'] || req.query.adminToken;

  // Em desenvolvimento, sem token configurado, libera o acesso
  if (process.env.NODE_ENV === 'development' && adminToken === 'admin-token-dev') {
    return next();
  }

  if (!provided || provided !== adminToken) {
    return res.status(401).json({ error: 'Acesso ao painel negado. Token de admin inválido.' });
  }

  next();
}

module.exports = { authenticateMachine, authenticateClient, authenticateAdmin };
