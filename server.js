// ============================================================
// Validar Print - API Server
// Entry point principal da aplicação
// ============================================================

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const expressLayouts = require('express-ejs-layouts');

const { testConnection } = require('./src/config/database');
const routes = require('./src/routes/index');
const errorHandler = require('./src/middleware/errorHandler');
const requestLogger = require('./src/middleware/requestLogger');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Middlewares globais ───────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Log HTTP no desenvolvimento
if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
}

// Log de requisições customizado
app.use(requestLogger);

// ── Template engine (painel web) ─────────────────────────────
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'src/views'));
app.use(expressLayouts);
app.set('layout', 'layout');

// Arquivos estáticos
app.use(express.static(path.join(__dirname, 'src/public')));

// ── Rotas ─────────────────────────────────────────────────────
app.use('/', routes);

// ── Tratamento de erros ───────────────────────────────────────
app.use(errorHandler);

// ── Start ─────────────────────────────────────────────────────
async function start() {
  console.log('');
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║         VALIDAR PRINT - API SERVER           ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log('');

  // Verifica conexão com banco antes de subir
  const dbOk = await testConnection();
  if (!dbOk) {
    console.error('[FATAL] Não foi possível conectar ao banco de dados. Encerrando.');
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log(`[SERVER] API rodando na porta ${PORT}`);
    console.log(`[SERVER] Painel web em http://localhost:${PORT}/dashboard`);
    console.log(`[SERVER] Ambiente: ${process.env.NODE_ENV || 'development'}`);
    console.log('');
  });
}

start();

module.exports = app;
