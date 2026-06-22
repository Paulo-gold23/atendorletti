# 🚗 Grupo Orletti — Agente de Atendimento Pós-Venda (MVP)

Bot de atendimento via WhatsApp para agendamento de **manutenção/revisão automotiva** e **pesquisa de satisfação (NPS)** para o **Grupo Orletti** — grupo de concessionárias com 60+ anos de tradição no Espírito Santo, Minas Gerais e Bahia.

> 🎯 **Status:** MVP de demonstração — Reunião com o Grupo Orletti

---

## 👤 Persona — Lucas

**Lucas** é o assistente virtual de Pós-Venda do Grupo Orletti. Ele:
- Agenda revisões e manutenções para qualquer uma das **14 marcas** do grupo
- Direciona clientes para a **unidade mais adequada** (ES, MG, BA)
- Conduz a **pesquisa de satisfação NPS** de forma natural e conversacional
- Responde dúvidas gerais sobre serviços e horários

---

## 🏗️ Arquitetura

```
┌─────────────────────────────────────────────────────────┐
│                    FRONTEND (Demo)                       │
│          WhatsApp-style SPA — HTML/CSS/JS               │
│              Hosted: GitHub Pages / local               │
└────────────────────┬────────────────────────────────────┘
                     │ POST /webhook/orletti/chat
                     ▼
┌─────────────────────────────────────────────────────────┐
│                  BACKEND — n8n                          │
│   Webhook → Load History → AI Agent (GPT-4o-mini)      │
│              → Save Messages → Respond                  │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│              DATABASE — Supabase (PostgreSQL)           │
│   orletti_sessions | orletti_conversations              │
│   orletti_agendamentos | orletti_satisfaction           │
└─────────────────────────────────────────────────────────┘
```

---

## 📁 Estrutura do Projeto

```
atendimento_project_orletti/
├── frontend/
│   ├── index.html          # Interface WhatsApp-style (rebrandada Orletti)
│   ├── style.css           # Estilos WhatsApp + overrides Orletti
│   ├── app.js              # Lógica de chat, webhook, histórico
│   └── assets/
│       └── orletti-avatar.png  # Avatar do Lucas
│
├── docs/
│   ├── PROMPT_ORLETTI.md       # Prompt completo do Lucas (core do MVP)
│   ├── migration_orletti.sql   # Tabelas Supabase + dados de demo
│   ├── PLAN-orletti-atendimento.md  # Plano de implementação
│   └── [prompts legados]       # Referências de projetos anteriores
│
└── README.md
```

---

## 🔧 Funcionalidades do MVP

### ✅ Agendamento de Serviço
O agente coleta, em conversa natural:
1. **Marca e modelo** do veículo
2. **Tipo de serviço** (10 categorias)
3. **Unidade preferida** (roteia por marca)
4. **Data e horário** preferidos
5. **Dados do cliente** (nome + telefone)
6. Gera **resumo visual** do agendamento

**Serviços disponíveis:**
| Serviço | Categoria |
|---------|-----------|
| Revisão programada de fábrica | Manutenção preventiva |
| Troca de óleo e filtros | Manutenção básica |
| Alinhamento e balanceamento | Pneus/rodas |
| Freios (pastilhas e discos) | Segurança |
| Ar-condicionado (hig./recarga) | Conforto |
| Suspensão e direção | Chassi |
| Diagnóstico eletrônico | Diagnóstico |
| Funilaria e pintura | Carroceria |
| Troca de pneus | Pneus/rodas |
| Bateria | Elétrico |

### ✅ Pesquisa de Satisfação (NPS)
Após o agendamento, conduz naturalmente:
- **NPS** (0-10) com categorização automática (Promotor/Neutro/Detrator)
- **Ponto positivo** (pergunta aberta)
- **Sugestão de melhoria** (pergunta aberta)
- **Prazo de entrega** do veículo (sim/não)

### ✅ Conhecimento do Grupo
- 14 marcas e suas unidades Orvel
- Horários por departamento
- Roteamento por marca → unidade correta

---

## 🚘 Marcas Representadas

| Marca | Sub-marca |
|-------|-----------|
| Volkswagen | Orvel VW |
| Fiat | Orvel Fiat |
| Renault | Orvel Renault |
| Hyundai | Orvel Hyundai |
| Jeep | Orvel Jeep |
| Peugeot | Orvel Peugeot |
| Citroën | Orvel Citroën |
| RAM | Orvel RAM |
| MG Motor | Orvel MG |
| Jetour | Orvel Jetour |
| Geely | Orvel Geely |
| Omoda | Orvel Omoda |
| Jaecoo | Orvel Jaecoo |
| VW Caminhões | Orvel Caminhões |

---

## ▶️ Como Rodar o Demo

```bash
# Opção 1: Abrir diretamente
# Abra frontend/index.html no navegador

# Opção 2: Servidor local (recomendado)
cd frontend
python -m http.server 3000
# Acesse: http://localhost:3000
```

> **Webhook:** Configure a URL do n8n em `app.js → CONFIG.webhookUrl`

---

## 🗄️ Banco de Dados

Execute o arquivo `docs/migration_orletti.sql` no Supabase:

```
Supabase Dashboard → SQL Editor → Cole o conteúdo → Run
```

**Tabelas criadas:**
- `orletti_sessions` — sessões de atendimento
- `orletti_conversations` — histórico de mensagens
- `orletti_agendamentos` — agendamentos registrados
- `orletti_satisfaction` — pesquisa NPS

**Views disponíveis:**
- `orletti_nps_dashboard` — métricas NPS mensais
- `orletti_agendamentos_dashboard` — volume por marca/unidade

---

## 📋 Configurações do n8n

**Endpoint:** `POST /webhook/orletti/chat`

**Payload enviado pelo frontend:**
```json
{
  "message": "texto do usuário",
  "session_id": "orletti_sess_xxxxx"
}
```

**Resposta esperada:**
```json
{
  "message": "resposta do Lucas (suporta || para múltiplas mensagens)"
}
```

---

## 🤝 Grupo Orletti

- **Website:** [grupoorletti.com.br](https://www.grupoorletti.com.br)
- **WhatsApp:** (27) 99941-5000
- **Sede:** Rod. Gov. Mário Covas, 135 — Serra, ES
- **Fundação:** 1966
- **Atuação:** ES • MG • BA

---

*MVP desenvolvido para demonstração — Junho 2026*
