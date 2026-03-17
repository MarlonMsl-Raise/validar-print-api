-- ============================================================
-- Validar Print - Schema do Banco de Dados
-- Banco: PostgreSQL
-- Execute: psql -U postgres -d validar_print -f schema.sql
-- ============================================================

-- Extensões necessárias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- Tabela: clients
-- Representa cada empresa/cliente do sistema
-- ============================================================
CREATE TABLE IF NOT EXISTS clients (
  id            UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome          VARCHAR(255)  NOT NULL,
  slug          VARCHAR(100)  NOT NULL UNIQUE,
  api_token     VARCHAR(255)  NOT NULL UNIQUE,
  ativo         BOOLEAN       NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clients_slug      ON clients(slug);
CREATE INDEX IF NOT EXISTS idx_clients_api_token ON clients(api_token);
CREATE INDEX IF NOT EXISTS idx_clients_ativo     ON clients(ativo);

-- ============================================================
-- Tabela: machines
-- Representa cada computador/instalação física do cliente
-- ============================================================
CREATE TABLE IF NOT EXISTS machines (
  id                  UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id           UUID          NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  nome_da_maquina     VARCHAR(255)  NOT NULL,
  machine_token       VARCHAR(255)  NOT NULL UNIQUE,
  ultimo_heartbeat    TIMESTAMPTZ   NULL,
  status_online       BOOLEAN       NOT NULL DEFAULT false,
  ativo               BOOLEAN       NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_machines_client_id     ON machines(client_id);
CREATE INDEX IF NOT EXISTS idx_machines_machine_token ON machines(machine_token);
CREATE INDEX IF NOT EXISTS idx_machines_ativo         ON machines(ativo);

-- ============================================================
-- Tabela: printers
-- Representa as impressoras instaladas em cada máquina
-- ============================================================
CREATE TABLE IF NOT EXISTS printers (
  id                    UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  machine_id            UUID          NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
  nome_exibicao         VARCHAR(255)  NOT NULL,
  nome_sistema_windows  VARCHAR(500)  NOT NULL,
  tipo_impressora       VARCHAR(50)   NOT NULL DEFAULT 'generic',
  is_default            BOOLEAN       NOT NULL DEFAULT false,
  ativo                 BOOLEAN       NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_printers_machine_id ON printers(machine_id);
CREATE INDEX IF NOT EXISTS idx_printers_ativo      ON printers(ativo);

-- ============================================================
-- Tabela: print_jobs
-- Cada pedido de impressão com rastreabilidade completa
-- ============================================================
CREATE TABLE IF NOT EXISTS print_jobs (
  id               UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id        UUID          NOT NULL REFERENCES clients(id),
  machine_id       UUID          NOT NULL REFERENCES machines(id),
  printer_id       UUID          NULL REFERENCES printers(id),
  job_name         VARCHAR(500)  NOT NULL,
  source_type      VARCHAR(50)   NOT NULL DEFAULT 'pdf_url',
  pdf_url          TEXT          NOT NULL,
  status           VARCHAR(20)   NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','picked','printing','printed','error','cancelled')),
  copies           INTEGER       NOT NULL DEFAULT 1 CHECK (copies >= 1 AND copies <= 999),
  pages            INTEGER       NULL,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  picked_at        TIMESTAMPTZ   NULL,
  printing_at      TIMESTAMPTZ   NULL,
  printed_at       TIMESTAMPTZ   NULL,
  error_at         TIMESTAMPTZ   NULL,
  error_message    TEXT          NULL,
  raw_payload_json JSONB         NULL
);

CREATE INDEX IF NOT EXISTS idx_jobs_client_id  ON print_jobs(client_id);
CREATE INDEX IF NOT EXISTS idx_jobs_machine_id ON print_jobs(machine_id);
CREATE INDEX IF NOT EXISTS idx_jobs_printer_id ON print_jobs(printer_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status     ON print_jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON print_jobs(created_at DESC);

-- Index composto para polling eficiente (GET /next)
CREATE INDEX IF NOT EXISTS idx_jobs_pending_machine
  ON print_jobs(machine_id, created_at ASC)
  WHERE status = 'pending';

-- ============================================================
-- Tabela: event_logs
-- Log de todos os eventos do sistema
-- ============================================================
CREATE TABLE IF NOT EXISTS event_logs (
  id            UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_type   VARCHAR(50)   NULL,
  entity_id     UUID          NULL,
  level         VARCHAR(20)   NOT NULL DEFAULT 'info'
                CHECK (level IN ('debug','info','warn','error')),
  event_name    VARCHAR(100)  NOT NULL,
  message       TEXT          NOT NULL,
  payload_json  JSONB         NULL,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_logs_entity_type ON event_logs(entity_type);
CREATE INDEX IF NOT EXISTS idx_logs_entity_id   ON event_logs(entity_id);
CREATE INDEX IF NOT EXISTS idx_logs_level       ON event_logs(level);
CREATE INDEX IF NOT EXISTS idx_logs_event_name  ON event_logs(event_name);
CREATE INDEX IF NOT EXISTS idx_logs_created_at  ON event_logs(created_at DESC);

-- ============================================================
-- Função para atualizar updated_at automaticamente
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_printers_updated_at
  BEFORE UPDATE ON printers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- View: machines_with_status
-- Facilita queries com status online calculado
-- ============================================================
CREATE OR REPLACE VIEW machines_with_status AS
SELECT
  m.*,
  c.nome    AS client_nome,
  c.slug    AS client_slug,
  (m.ultimo_heartbeat IS NOT NULL
   AND m.ultimo_heartbeat > NOW() - INTERVAL '1 second' * COALESCE(
     NULLIF(current_setting('app.heartbeat_timeout_seconds', true), ''), '120'
   )::integer
  ) AS online_calculado,
  (SELECT COUNT(*) FROM printers p WHERE p.machine_id = m.id AND p.ativo = true) AS total_impressoras
FROM machines m
JOIN clients c ON c.id = m.client_id;
