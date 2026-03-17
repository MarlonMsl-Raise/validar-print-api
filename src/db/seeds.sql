-- ============================================================
-- Validar Print - Seeds (dados de exemplo para teste)
-- Execute após schema.sql
-- ============================================================

-- ── Cliente de exemplo ─────────────────────────────────────
INSERT INTO clients (id, nome, slug, api_token, ativo)
VALUES (
  'a1b2c3d4-0001-0001-0001-000000000001',
  'Orly Burguer',
  'orly_burguer',
  'client-token-orly-burguer-2024',
  true
)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO clients (id, nome, slug, api_token, ativo)
VALUES (
  'a1b2c3d4-0002-0002-0002-000000000002',
  'Pizza Fast',
  'pizza_fast',
  'client-token-pizza-fast-2024',
  true
)
ON CONFLICT (slug) DO NOTHING;

-- ── Máquina de exemplo (caixa da Orly Burguer) ────────────
INSERT INTO machines (id, client_id, nome_da_maquina, machine_token, ativo)
VALUES (
  'b1b2c3d4-0001-0001-0001-000000000001',
  'a1b2c3d4-0001-0001-0001-000000000001',
  'CAIXA-PRINCIPAL',
  'machine-token-orly-caixa-2024',
  true
)
ON CONFLICT (machine_token) DO NOTHING;

INSERT INTO machines (id, client_id, nome_da_maquina, machine_token, ativo)
VALUES (
  'b1b2c3d4-0002-0002-0002-000000000002',
  'a1b2c3d4-0001-0001-0001-000000000001',
  'COZINHA-01',
  'machine-token-orly-cozinha-2024',
  true
)
ON CONFLICT (machine_token) DO NOTHING;

-- ── Impressoras de exemplo ─────────────────────────────────
INSERT INTO printers (id, machine_id, nome_exibicao, nome_sistema_windows, tipo_impressora, is_default, ativo)
VALUES (
  'c1b2c3d4-0001-0001-0001-000000000001',
  'b1b2c3d4-0001-0001-0001-000000000001',
  'Elgin L42 Pro',
  'Elgin L42 Pro',
  'label',
  true,
  true
)
ON CONFLICT DO NOTHING;

INSERT INTO printers (id, machine_id, nome_exibicao, nome_sistema_windows, tipo_impressora, is_default, ativo)
VALUES (
  'c1b2c3d4-0002-0002-0002-000000000002',
  'b1b2c3d4-0001-0001-0001-000000000001',
  'Zebra ZT230',
  'Zebra ZT230',
  'label',
  false,
  true
)
ON CONFLICT DO NOTHING;

-- ── Job de exemplo para teste ──────────────────────────────
INSERT INTO print_jobs (
  id, client_id, machine_id, printer_id,
  job_name, source_type, pdf_url, status, copies,
  raw_payload_json
)
VALUES (
  'd1b2c3d4-0001-0001-0001-000000000001',
  'a1b2c3d4-0001-0001-0001-000000000001',
  'b1b2c3d4-0001-0001-0001-000000000001',
  'c1b2c3d4-0001-0001-0001-000000000001',
  'Etiqueta Pedido #001',
  'pdf_url',
  'https://www.w3.org/WAI/WCAG21/Techniques/pdf/img/table-word.pdf',
  'pending',
  1,
  '{"source": "seed_test"}'::jsonb
)
ON CONFLICT DO NOTHING;

-- ── Log de exemplo ─────────────────────────────────────────
INSERT INTO event_logs (entity_type, entity_id, level, event_name, message)
VALUES (
  'system', NULL, 'info', 'system.startup',
  'Banco inicializado com dados de seed'
);

SELECT 'Seeds inseridos com sucesso!' AS resultado;
SELECT 'Cliente: orly_burguer | Token: client-token-orly-burguer-2024' AS cliente_teste;
SELECT 'Machine Token: machine-token-orly-caixa-2024' AS machine_teste;
