# PLAN-simulacao-prototipo.md

> **Projeto:** Aprimoramento Conversacional do Lucas (Foco em Naturalidade e Humanização)  
> **Status:** 🟡 Planejamento (Fluxo Natural e Conversacional Puro)  
> **Data:** 30/06/2026

---

## 🎯 Objetivo

Aprimorar o comportamento e a inteligência de diálogo do **Lucas** para que ele conduza a conversa de forma 100% natural, agindo como um atendente humano real do pós-venda do Grupo Orvel. O foco é aprimorar o prompt de sistema (`PROMPT_ORLETTI.md`) para lidar com a transição de fluxos (Agendamento para Satisfação/NPS) e desvios de assunto de forma imperceptível e calorosa, mantendo o visual limpo de WhatsApp.

---

## 💬 Melhorias de Naturalidade Humana Propostas

### 1. Transições Suaves e Contextuais (Agendamento ➔ Pesquisa de Satisfação)
Atualmente, o bot faz uma transição direta após o agendamento. Vamos refinar para que a IA adapte a abordagem com base no histórico:
*   **Se for cliente novo:** *"Que ótimo, agendamento confirmado! Como é a sua primeira vez com a gente, me conta: o que achou do nosso atendimento para agendar hoje? Foi tranquilo tirar suas dúvidas?"*
*   **Se for cliente antigo:** *"Prontinho, agendamento feito! Aproveitando que estamos conversando, você já fez outras revisões com a gente antes? Como foi a sua experiência com a nossa oficina na última visita?"*

### 2. Resiliência a Conversas Paralelas e Dúvidas Frequentes (FAQ)
Um humano não ignora uma pergunta sobre preço ou endereço para insistir no cadastro. O Lucas será treinado no prompt para:
*   Responder à dúvida imediatamente (ex: endereço da unidade de Vila Velha, horário de funcionamento).
*   Retomar o agendamento na mesma mensagem de forma amigável: *"A unidade de Vila Velha fica na [Endereço]. E voltando ao nosso agendamento, qual seria a placa do carro para eu registrar?"*

### 3. Absorção Multidados (Fim da Coleta Rígida)
Se o cliente enviar vários dados de uma vez (ex: *"Quero agendar a revisão de 40 mil do meu HB20 2020 para quarta de manhã em Vila Velha"*), o Lucas deve preencher mentalmente todas as variáveis correspondentes e avançar direto para a confirmação de horário e dados de contato, em vez de perguntar item por item.

---

## 🛠️ Tarefas de Implementação (Task Breakdown)

### FASE 1 — Atualização do Prompt do Lucas
- **T1.1 — Refinamento da Persona e Coloquialidade (`docs/PROMPT_ORLETTI.md`)**
  - Remover qualquer traço de robotização ou formalismo excessivo.
  - Inserir exemplos de interrupções de fluxo e a forma humana de contornar.
- **T1.2 — Novo Script de Transição para o CSI Preventivo**
  - Ajustar a lógica do gatilho rígido de pós-agendamento para se adaptar ao perfil do cliente (novo vs. antigo) de forma orgânica.

### FASE 2 — Testes de Conversação e Ajustes de Parâmetros
- **T2.1 — Dry Run de Conversa Paralela**
  - Testar perguntas sobre endereço ou preços no meio do fluxo para garantir que a IA não quebre e retome o fluxo com naturalidade.
- **T2.2 — Teste de Sobrecarga de Dados**
  - Validar se o bot preenche os dados do agendamento corretamente ao receber mensagens curtas ou longas com múltiplos dados misturados.
