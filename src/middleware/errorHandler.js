// ============================================================
// Middleware de tratamento de erros global
// ============================================================

const logService = require('../services/logService');

async function errorHandler(err, req, res, next) {
  const status = err.status || err.statusCode || 500;
  const message = err.message || 'Erro interno no servidor';

  // Log do erro
  try {
    await logService.log({
      level: 'error',
      eventName: 'api.unhandled_error',
      message: `${req.method} ${req.path} → ${status}: ${message}`,
      payload: {
        method: req.method,
        path: req.path,
        status,
        error: message,
        stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined,
      },
    });
  } catch (_) {
    // Não deixar o logger quebrar o handler
  }

  if (process.env.NODE_ENV !== 'production') {
    console.error('[ERROR]', status, req.method, req.path, '-', message);
    if (err.stack) console.error(err.stack);
  }

  res.status(status).json({
    error: message,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
  });
}

module.exports = errorHandler;
