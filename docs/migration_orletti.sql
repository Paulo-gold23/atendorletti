-- ============================================================
-- Grupo Orletti — Agente de Atendimento Pós-Venda
-- Supabase Migration: Tabelas do MVP
-- Prefixo: orletti_
-- Criado: 2026-06-22
-- ============================================================

-- Habilitar extensão UUID (se não estiver ativa)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- Tabela 1: Sessões de atendimento
-- Armazena cada sessão de chat iniciada pelo cliente
-- ============================================================
CREATE TABLE IF NOT EXISTS orletti_sessions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id            TEXT UNIQUE NOT NULL,
  customer_name         TEXT,
  customer_phone        TEXT,
  customer_vehicle_brand TEXT,
  customer_vehicle_model TEXT,
  customer_vehicle_year  TEXT,
  customer_vehicle_plate TEXT,
  channel               TEXT DEFAULT 'web' CHECK (channel IN ('web', 'whatsapp', 'demo')),
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
);

-- Índice para busca por session_id
CREATE INDEX IF NOT EXISTS idx_orletti_sessions_session_id ON orletti_sessions(session_id);

-- Trigger para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_orletti_sessions_updated_at ON orletti_sessions;
CREATE TRIGGER update_orletti_sessions_updated_at
  BEFORE UPDATE ON orletti_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- Tabela 2: Histórico de conversas
-- Armazena cada mensagem trocada na sessão
-- ============================================================
CREATE TABLE IF NOT EXISTS orletti_conversations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  TEXT NOT NULL REFERENCES orletti_sessions(session_id) ON DELETE CASCADE,
  role        TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content     TEXT NOT NULL,
  tokens_used INTEGER,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- Índice para carregar histórico por sessão
CREATE INDEX IF NOT EXISTS idx_orletti_conversations_session_id ON orletti_conversations(session_id);
CREATE INDEX IF NOT EXISTS idx_orletti_conversations_created_at ON orletti_conversations(created_at);

-- ============================================================
-- Tabela 3: Agendamentos de serviço
-- Registra os agendamentos capturados pelo agente Lucas
-- ============================================================
CREATE TABLE IF NOT EXISTS orletti_agendamentos (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id          TEXT REFERENCES orletti_sessions(session_id) ON DELETE SET NULL,

  -- Dados do veículo
  vehicle_brand       TEXT NOT NULL,
  vehicle_model       TEXT NOT NULL,
  vehicle_year        TEXT,
  vehicle_plate       TEXT,

  -- Dados do serviço
  service_type        TEXT NOT NULL,
  service_description TEXT,

  -- Dados de localização e horário
  preferred_unit      TEXT,       -- Ex: "Orvel VW Serra", "Orvel Fiat Colatina"
  preferred_date      DATE,
  preferred_time      TEXT,       -- Ex: "manhã", "tarde", "14:00"

  -- Dados do cliente
  customer_name       TEXT NOT NULL,
  customer_phone      TEXT NOT NULL,
  customer_email      TEXT,

  -- Status do agendamento
  status              TEXT DEFAULT 'pendente'
                      CHECK (status IN ('pendente', 'confirmado', 'cancelado', 'realizado', 'nao_compareceu')),
  notes               TEXT,

  -- Auditoria
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now(),
  confirmed_at        TIMESTAMPTZ,
  completed_at        TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_orletti_agendamentos_session_id ON orletti_agendamentos(session_id);
CREATE INDEX IF NOT EXISTS idx_orletti_agendamentos_status ON orletti_agendamentos(status);
CREATE INDEX IF NOT EXISTS idx_orletti_agendamentos_preferred_date ON orletti_agendamentos(preferred_date);
CREATE INDEX IF NOT EXISTS idx_orletti_agendamentos_vehicle_brand ON orletti_agendamentos(vehicle_brand);

DROP TRIGGER IF EXISTS update_orletti_agendamentos_updated_at ON orletti_agendamentos;
CREATE TRIGGER update_orletti_agendamentos_updated_at
  BEFORE UPDATE ON orletti_agendamentos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- Tabela 4: Pesquisa de satisfação (NPS)
-- Captura o feedback do cliente após o atendimento
-- ============================================================
CREATE TABLE IF NOT EXISTS orletti_satisfaction (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id              TEXT REFERENCES orletti_sessions(session_id) ON DELETE SET NULL,
  agendamento_id          UUID REFERENCES orletti_agendamentos(id) ON DELETE SET NULL,

  -- NPS
  nps_score               INTEGER CHECK (nps_score BETWEEN 0 AND 10),
  nps_category            TEXT GENERATED ALWAYS AS (
    CASE
      WHEN nps_score >= 9 THEN 'promotor'
      WHEN nps_score >= 7 THEN 'neutro'
      WHEN nps_score IS NOT NULL THEN 'detrator'
      ELSE NULL
    END
  ) STORED,

  -- Feedback qualitativo
  positive_feedback       TEXT,     -- "O que mais gostou?"
  improvement_feedback    TEXT,     -- "O que poderíamos melhorar?"
  delivery_time_ok        BOOLEAN,  -- "O veículo foi entregue no prazo?"

  -- Dados da unidade avaliada (capturado no momento da pesquisa)
  evaluated_unit          TEXT,
  last_service_type       TEXT,

  -- Auditoria
  created_at              TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_orletti_satisfaction_session_id ON orletti_satisfaction(session_id);
CREATE INDEX IF NOT EXISTS idx_orletti_satisfaction_nps_score ON orletti_satisfaction(nps_score);
CREATE INDEX IF NOT EXISTS idx_orletti_satisfaction_nps_category ON orletti_satisfaction(nps_category);
CREATE INDEX IF NOT EXISTS idx_orletti_satisfaction_created_at ON orletti_satisfaction(created_at);

-- ============================================================
-- View: Dashboard de NPS
-- Facilita consultas de análise de satisfação
-- ============================================================
CREATE OR REPLACE VIEW orletti_nps_dashboard AS
SELECT
  DATE_TRUNC('month', created_at) AS mes,
  COUNT(*) AS total_avaliacoes,
  ROUND(AVG(nps_score), 1) AS nps_medio,
  COUNT(*) FILTER (WHERE nps_category = 'promotor') AS promotores,
  COUNT(*) FILTER (WHERE nps_category = 'neutro') AS neutros,
  COUNT(*) FILTER (WHERE nps_category = 'detrator') AS detratores,
  ROUND(
    (COUNT(*) FILTER (WHERE nps_category = 'promotor')::DECIMAL
     - COUNT(*) FILTER (WHERE nps_category = 'detrator')::DECIMAL)
    / NULLIF(COUNT(*), 0) * 100, 1
  ) AS nps_calculado
FROM orletti_satisfaction
WHERE nps_score IS NOT NULL
GROUP BY DATE_TRUNC('month', created_at)
ORDER BY mes DESC;

-- ============================================================
-- View: Dashboard de agendamentos
-- Resumo de agendamentos por marca/unidade/status
-- ============================================================
CREATE OR REPLACE VIEW orletti_agendamentos_dashboard AS
SELECT
  vehicle_brand,
  preferred_unit,
  status,
  service_type,
  COUNT(*) AS total,
  DATE_TRUNC('week', created_at) AS semana
FROM orletti_agendamentos
GROUP BY vehicle_brand, preferred_unit, status, service_type, DATE_TRUNC('week', created_at)
ORDER BY semana DESC, total DESC;

-- ============================================================
-- RLS (Row Level Security) — Preparação para produção
-- Garante que chaves públicas anônimas não consigam ler/escrever dados
-- ============================================================
ALTER TABLE orletti_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE orletti_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE orletti_agendamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE orletti_satisfaction ENABLE ROW LEVEL SECURITY;

-- Políticas de segurança: Apenas a role service_role (usada no backend/n8n)
-- tem acesso total. Clientes anônimos ou sem autenticação adequada são bloqueados.
DROP POLICY IF EXISTS backend_all_sessions ON orletti_sessions;
CREATE POLICY backend_all_sessions ON orletti_sessions TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS backend_all_conversations ON orletti_conversations;
CREATE POLICY backend_all_conversations ON orletti_conversations TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS backend_all_agendamentos ON orletti_agendamentos;
CREATE POLICY backend_all_agendamentos ON orletti_agendamentos TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS backend_all_satisfaction ON orletti_satisfaction;
CREATE POLICY backend_all_satisfaction ON orletti_satisfaction TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- LGPD Compliance: Anonimização de Dados Pessoais (PII)
-- Função para anonimizar dados de uma sessão de atendimento
-- e expurgar logs detalhados de conversas, mantendo estatísticas
-- ============================================================
CREATE OR REPLACE FUNCTION orletti_anonimizar_sessao(p_session_id TEXT)
RETURNS VOID AS $$
BEGIN
  -- 1. Ofuscar dados pessoais na tabela de sessões
  UPDATE orletti_sessions
  SET 
    customer_name = 'Cliente Anonimizado (LGPD)',
    customer_phone = CASE 
      WHEN customer_phone IS NOT NULL AND LENGTH(customer_phone) >= 5 
      THEN SUBSTRING(customer_phone FROM 1 FOR 5) || '****-****'
      ELSE '****-****'
    END,
    customer_vehicle_plate = '***-****',
    updated_at = now()
  WHERE session_id = p_session_id;

  -- 2. Ofuscar dados pessoais na tabela de agendamentos
  UPDATE orletti_agendamentos
  SET 
    customer_name = 'Cliente Anonimizado (LGPD)',
    customer_phone = CASE 
      WHEN customer_phone IS NOT NULL AND LENGTH(customer_phone) >= 5 
      THEN SUBSTRING(customer_phone FROM 1 FOR 5) || '****-****'
      ELSE '****-****'
    END,
    vehicle_plate = '***-****',
    customer_email = NULL,
    notes = '[Notas removidas para conformidade LGPD]',
    updated_at = now()
  WHERE session_id = p_session_id;

  -- 3. Deletar o histórico detalhado de mensagens da conversa (que pode conter outros dados pessoais)
  DELETE FROM orletti_conversations
  WHERE session_id = p_session_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- Dados de exemplo para demonstração
-- ============================================================
INSERT INTO orletti_sessions (session_id, customer_name, customer_phone, customer_vehicle_brand, customer_vehicle_model, customer_vehicle_year, channel)
VALUES
  ('demo_001', 'João Silva', '(27) 99999-1234', 'Fiat', 'Pulse', '2023', 'demo'),
  ('demo_002', 'Maria Oliveira', '(27) 98888-5678', 'Volkswagen', 'T-Cross', '2022', 'demo'),
  ('demo_003', 'Carlos Santos', '(27) 97777-9012', 'Renault', 'Kwid', '2024', 'demo')
ON CONFLICT (session_id) DO NOTHING;

INSERT INTO orletti_agendamentos (session_id, vehicle_brand, vehicle_model, vehicle_year, service_type, preferred_unit, preferred_date, preferred_time, customer_name, customer_phone, status)
VALUES
  ('demo_001', 'Fiat', 'Pulse', '2023', 'Revisão 20.000km', 'Orvel Fiat — Serra', '2026-06-25', 'manhã', 'João Silva', '(27) 99999-1234', 'pendente'),
  ('demo_002', 'Volkswagen', 'T-Cross', '2022', 'Troca de óleo e filtros', 'Orvel VW — Vitória', '2026-06-26', 'tarde', 'Maria Oliveira', '(27) 98888-5678', 'confirmado'),
  ('demo_003', 'Renault', 'Kwid', '2024', 'Alinhamento e balanceamento', 'Orvel Renault — Linhares', '2026-06-27', 'manhã', 'Carlos Santos', '(27) 97777-9012', 'pendente')
ON CONFLICT DO NOTHING;

INSERT INTO orletti_satisfaction (session_id, nps_score, positive_feedback, improvement_feedback, delivery_time_ok, evaluated_unit, last_service_type)
VALUES
  ('demo_002', 9, 'Atendimento muito rápido e equipe atenciosa', 'Estacionamento poderia ser maior', TRUE, 'Orvel VW — Vitória', 'Revisão 10.000km')
ON CONFLICT DO NOTHING;
