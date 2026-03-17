// ============================================================
// Validação das variáveis de ambiente obrigatórias
// ============================================================

const required = ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'];

function validateEnv() {
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    console.error('[ENV] Variáveis obrigatórias não definidas:', missing.join(', '));
    console.error('[ENV] Copie .env.example para .env e preencha os valores.');
    process.exit(1);
  }
}

const config = {
  port: parseInt(process.env.PORT) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  adminToken: process.env.ADMIN_TOKEN || 'admin-token-dev',
  heartbeatTimeoutSeconds: parseInt(process.env.HEARTBEAT_TIMEOUT_SECONDS) || 120,
  apiBaseUrl: process.env.API_BASE_URL || 'http://localhost:3000',
};

module.exports = { validateEnv, config };
