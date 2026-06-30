# PLAN-robustez-lucas.md

> **Projeto:** Evolução da Inteligência e Robustez do Lucas  
> **Status:** 🟡 Planejamento  
> **Data:** 30/06/2026

---

## 🎯 Objetivo

Definir o plano de evolução conversacional para tornar o **Lucas** consideravelmente mais robusto, inteligente e resiliente a desvios de conversa, datas relativas e validações estritas no canal de WhatsApp.

---

## 🚀 Trilha de Evolução da Inteligência Conversacional

### 1. Tratamento Avançado de Datas Relativas (Lógica Temporal)
*   **Problema:** Clientes frequentemente usam termos como *"terça que vem"*, *"amanhã de tarde"*, *"depois do feriado do dia 9"* ou *"no próximo dia 15"*.
*   **Evolução:** Configurar regras explícitas de processamento temporal no prompt para que, a partir da variável `<data_hora_atual>`, o Lucas calcule mentalmente o dia exato da semana e do mês e exiba a data calendarizada no formato correto (`DD/MM/AAAA`) no resumo final.

### 2. Validação Conversacional de Placas (Mercosul e Tradicional)
*   **Problema:** Registros de placas erradas ou incompletas no agendamento.
*   **Evolução:** Treinar o Lucas para identificar e validar o formato de placas durante a conversa de maneira natural:
    *   Formato Tradicional: `AAA-9999` (Três letras, hífen opcional, quatro números).
    *   Formato Mercosul: `AAA9A99` (Três letras, um número, uma letra, dois números).
    *   Se o cliente digitar um formato inválido, o Lucas pede correção de forma amigável: *"Notei que a placa está com alguns caracteres faltando. Poderia confirmar pra mim?"*.

### 3. Triagem de Duração de Serviço (Alinhamento com o Apollo DMS)
*   **Problema:** Agendar diagnósticos complexos no mesmo slot de serviços simples (troca de óleo), gerando gargalos na oficina.
*   **Evolução:** O Lucas fará perguntas simples de triagem dependendo do problema relatado para categorizar a duração necessária no DMS:
    *   *Troca de Óleo / Alinhamento:* Duração curta (~1h). Avança direto.
    *   *Barulho mecânico / Pane elétrica / Luz de injeção:* Duração longa (~3h a 4h) devido à necessidade de diagnóstico. O Lucas informará: *"Como é um barulho no motor, nossos técnicos precisam de um tempo maior para o diagnóstico. Recomendo trazer o carro na parte da manhã, tudo bem?"*.

### 4. Gestão de Portadores (Dono vs. Condutor)
*   **Problema:** O agendamento é feito no nome de quem está digitando no WhatsApp, mas o veículo está registrado no nome de outra pessoa (ex: frota, cônjuge, pais).
*   **Evolução:** Durante a coleta de dados de contato, o Lucas perguntará sutilmente se o veículo está no nome do cliente ou de terceiros para garantir a indexação correta no cadastro do Apollo DMS:
    *   *"Perfeito! O agendamento vai ficar no seu nome mesmo, ou o veículo está cadastrado no nome de outra pessoa?"*

---

## 🏗️ Tarefas e Integrações Técnicas (Próximas Fases)

- **T1 — Integração de API de Calendário Dinâmico:** Ajustar o n8n para injetar no prompt do Lucas uma lista curta de horários disponíveis em tempo real extraídos do Apollo DMS para o dia escolhido pelo cliente.
- **T2 — Normalização de Dados no Supabase:** Configurar gatilhos SQL para que as placas coletadas pelo Lucas sejam limpas (remoção de espaços e hífens) antes de serem salvas na tabela `orletti_agendamentos`.
