// ============================================================
// Middleware de log de requisições HTTP
// Loga apenas endpoints relevantes da API (não assets)
// ============================================================

function requestLogger(req, res, next) {
  // Ignora arquivos estáticos e health check frequente
  if (req.path.startsWith('/public') || req.path === '/health') {
    return next();
  }

  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const level = res.statusCode >= 500 ? 'ERROR' : res.statusCode >= 400 ? 'WARN' : 'INFO';
    console.log(
      `[HTTP] [${level}] ${req.method} ${req.path} → ${res.statusCode} (${duration}ms)`
    );
  });

  next();
}

module.exports = requestLogger;
