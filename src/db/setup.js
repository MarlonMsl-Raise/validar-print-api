// ============================================================
// Script de setup do banco de dados
// Executa schema.sql, migrations e seeds.sql automaticamente
// Uso: node src/db/setup.js
//      node src/db/setup.js --seeds-only
//      node src/db/setup.js --schema-only
// ============================================================

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { pool } = require('../config/database');

const args = process.argv.slice(2);
const seedsOnly  = args.includes('--seeds-only');
const schemaOnly = args.includes('--schema-only');

async function runFile(filePath, label) {
  const sql = fs.readFileSync(filePath, 'utf8');
  console.log(`\n[SETUP] Executando ${label}...`);
  try {
    await pool.query(sql);
    console.log(`[SETUP] ${label} executado com sucesso.`);
  } catch (err) {
    console.error(`[SETUP] Erro ao executar ${label}:`, err.message);
    throw err;
  }
}

async function runMigrations() {
  console.log('\n[SETUP] Executando migrações...');

  const migrationSql = `
    ALTER TABLE print_jobs
    ADD COLUMN IF NOT EXISTS lock_expires_at TIMESTAMPTZ NULL;

    CREATE INDEX IF NOT EXISTS idx_print_jobs_lock_expires_at
    ON print_jobs (lock_expires_at);
  `;

  try {
    await pool.query(migrationSql);
    console.log('[SETUP] Migrações executadas com sucesso.');
  } catch (err) {
    console.error('[SETUP] Erro ao executar migrações:', err.message);
    throw err;
  }
}

async function main() {
  console.log('');
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║      VALIDAR PRINT - SETUP DO BANCO          ║');
  console.log('╚══════════════════════════════════════════════╝');

  try {
    if (!seedsOnly) {
      await runFile(path.join(__dirname, 'schema.sql'), 'schema.sql');
      await runMigrations();
    }

    if (!schemaOnly) {
      await runFile(path.join(__dirname, 'seeds.sql'), 'seeds.sql');
    }

    console.log('\n[SETUP] ✓ Banco configurado com sucesso!');
    console.log('[SETUP] Você pode subir a API agora: npm start\n');
  } catch (err) {
    console.error('\n[SETUP] ✗ Falha no setup do banco:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();