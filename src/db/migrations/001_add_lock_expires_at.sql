-- ============================================================
-- Migration 001: Adiciona coluna lock_expires_at em print_jobs
-- Necessária para o mecanismo de locking atômico com FOR UPDATE SKIP LOCKED
-- Aplique com: psql $DATABASE_URL -f src/db/migrations/001_add_lock_expires_at.sql
-- ============================================================

-- Coluna principal: timestamp de expiração do lock do job
ALTER TABLE print_jobs
  ADD COLUMN IF NOT EXISTS lock_expires_at TIMESTAMPTZ NULL;

-- Índice parcial para acelerar a query de claimNextJob:
-- Busca por jobs locked (status IN ('picked','printing')) com lock expirado
CREATE INDEX IF NOT EXISTS idx_jobs_lock_expires
  ON print_jobs (machine_id, lock_expires_at)
  WHERE status IN ('picked', 'printing');

-- Comentário de documentação da coluna
COMMENT ON COLUMN print_jobs.lock_expires_at IS
  'Timestamp em que o lock do job expira. '
  'Jobs em status picked/printing com lock_expires_at < NOW() podem ser reivindicados novamente. '
  'NULL = sem lock ativo (jobs pending, printed, error, cancelled).';
