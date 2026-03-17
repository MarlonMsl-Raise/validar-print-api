// ============================================================
// Configuração do pool de conexão PostgreSQL
// ============================================================

const { Pool } = require('pg');

const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME     || 'validar_print',
  user:     process.env.DB_USER     || 'postgres',
  password: process.env.DB_PASSWORD || '',
  // Configurações de pool para produção
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('[DB] Erro inesperado no pool de conexão:', err.message);
});

/**
 * Executa uma query no banco
 * @param {string} text - SQL
 * @param {Array} params - Parâmetros
 */
async function query(text, params) {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    if (process.env.NODE_ENV === 'development' && duration > 200) {
      console.warn(`[DB] Query lenta (${duration}ms):`, text.substring(0, 100));
    }
    return result;
  } catch (err) {
    console.error('[DB] Erro na query:', err.message);
    console.error('[DB] SQL:', text);
    throw err;
  }
}

/**
 * Retorna um client do pool (para transações)
 */
async function getClient() {
  return pool.connect();
}

/**
 * Testa a conexão com o banco
 */
async function testConnection() {
  try {
    const result = await pool.query('SELECT NOW() as now, version() as version');
    console.log('[DB] Conectado ao PostgreSQL em', process.env.DB_HOST || 'localhost');
    console.log('[DB] Versão:', result.rows[0].version.split(' ').slice(0, 2).join(' '));
    return true;
  } catch (err) {
    console.error('[DB] Falha ao conectar:', err.message);
    return false;
  }
}

module.exports = { query, getClient, pool, testConnection };
