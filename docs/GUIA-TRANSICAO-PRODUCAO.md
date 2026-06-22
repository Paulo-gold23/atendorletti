# De Protótipo a Clínica Real
## Guia de Transição — AtendClinical WhatsApp Agent

> **Versão:** 1.0 · **Data:** Maio 2026
> **Contexto:** Sistema de atendimento conversacional com IA para clínica médica

---

## Visão Geral

O AtendClinical existe hoje como um protótipo funcional: uma interface web simula o WhatsApp, o usuário digita mensagens, e um agente de IA responde, consulta a agenda e registra dados. Tudo funciona. Mas nenhum paciente real usa WhatsApp para falar com essa interface — ele abriria o WhatsApp no celular, procuraria o número da clínica, e mandaria uma mensagem.

Esta é a transição que este documento descreve: sair de uma simulação de WhatsApp no navegador e passar a operar **no WhatsApp de verdade**, através da API oficial da Meta.

### O que muda fundamentalmente

```
HOJE (Protótipo)
  Paciente → Abre o site da demo no navegador → Digita → IA responde na tela

PRODUÇÃO
  Paciente → Abre o WhatsApp no celular → Manda mensagem para o número da clínica
           → Meta entrega ao sistema → IA processa → Meta envia a resposta de volta
           → Paciente recebe no próprio WhatsApp
```

O núcleo do sistema — o agente de IA, o Google Calendar, o banco de dados — **permanece o mesmo**. O que muda é o canal: em vez do frontend web, é o WhatsApp real que recebe e entrega as mensagens.

---

## Parte 1 — O que a Meta exige para funcionar

Antes de qualquer linha de código ser alterada, existe um processo burocrático obrigatório junto à Meta (empresa dona do WhatsApp). Não há atalho: sem essa etapa completa, não existe número real funcionando.

### 1.1 · Conta Meta Business Manager

A clínica precisa ter uma conta verificada no Meta Business Manager. Verificação significa submeter documentos empresariais — o CNPJ da clínica e, frequentemente, um documento adicional como contrato social ou extrato bancário em nome da empresa.

A verificação pode ser aprovada em horas ou levar uma semana. A Meta pode solicitar documentação adicional se os dados não baterem com os registros públicos.

### 1.2 · Aplicativo no Meta for Developers

Com o Business Manager verificado, cria-se um aplicativo do tipo *Business* no portal de desenvolvedores da Meta, adicionando o produto **WhatsApp Business**. Esse processo gera os identificadores técnicos necessários:

| Identificador | O que é |
|---|---|
| `PHONE_NUMBER_ID` | ID do número de telefone registrado |
| `WABA_ID` | ID da conta WhatsApp Business |
| `APP_ID` / `APP_SECRET` | Identificadores do aplicativo |

### 1.3 · O número de telefone

> [!WARNING]
> Este é o ponto que mais surpreende quem está fazendo a transição pela primeira vez.

O número que a clínica usará para o WhatsApp **não pode estar ativo no WhatsApp pessoal ou no WhatsApp Business App** (o aplicativo comum, instalado no celular). Se já estiver, é necessário desconectá-lo primeiro — e isso remove toda a história de conversas existente naquele número.

As opções práticas são:

- **Número novo** — Um chip dedicado exclusivamente para o sistema. Opção mais limpa.
- **Número fixo da clínica** — Ramais e linhas fixas são aceitos pela Meta. A verificação é feita por ligação em vez de SMS.
- **Número VoIP** — Alguns provedores de número virtual são aceitos. Verificar compatibilidade com a Meta antes de contratar.

O registro do número acontece no painel do Meta for Developers. A clínica recebe um código de verificação por SMS ou ligação e o confirma.

### 1.4 · Token de acesso permanente

O token temporário gerado durante os testes expira em 24 horas e não serve para produção. Para operar de forma contínua, é necessário criar um **System User** no Meta Business Manager, atribuir a ele permissão de `whatsapp_business_messaging`, e gerar um token permanente.

Esse token é como uma senha mestre: deve ser guardado em variável de ambiente, nunca exposto no código.

---

## Parte 2 — Infraestrutura técnica

### 2.1 · O webhook e o handshake com a Meta

Quando uma mensagem chega ao número da clínica, a Meta não entrega ela "para o sistema" de forma mágica. Ela faz uma requisição HTTP para uma URL que você registra — o **webhook**. Essa URL precisa ser HTTPS.

O n8n Hostinger já tem HTTPS. A URL de produção ficará assim:

```
https://n8n.srv1181762.hstgr.cloud/webhook/whatsapp-prod
```

Antes de a Meta confiar nessa URL, ela faz uma verificação: envia uma requisição GET com um número aleatório (*challenge*) e espera que o sistema devolva exatamente esse número. É o "handshake". O workflow no n8n precisa ter esse tratamento antes de qualquer outra lógica.

### 2.2 · Estrutura do novo workflow de produção

O workflow de produção tem uma divisão clara em duas partes:

**Recepção — quando a mensagem chega:**
1. Identificar se é uma verificação inicial da Meta (GET) ou uma mensagem real (POST)
2. Extrair o texto da mensagem, o número do remetente e o nome do contato
3. Filtrar tipos não suportados (áudio, imagem, figurinha) com uma resposta educada
4. Verificar se a mensagem já foi processada (evitar duplicatas)
5. Carregar histórico da conversa pelo número de telefone

**Processamento e resposta:**
1. Enviar para o agente de IA com o histórico carregado
2. O agente consulta o Calendar e/ou salva dados conforme necessário
3. Salvar as mensagens no banco de dados
4. Enviar a resposta de volta para o paciente via API da Meta

### 2.3 · A diferença mais importante no código

O protótipo recebe mensagens em um formato simples e direto:

```json
{ "message": "oi, preciso agendar", "session_id": "abc123" }
```

A Meta entrega as mensagens em um formato bem mais complexo e aninhado:

```json
{
  "entry": [{
    "changes": [{
      "value": {
        "contacts": [{"profile": {"name": "João"}, "wa_id": "5511999999999"}],
        "messages": [{
          "from": "5511999999999",
          "text": {"body": "oi, preciso agendar"},
          "type": "text"
        }]
      }
    }]
  }]
}
```

O workflow precisa de um passo inicial apenas para extrair o que interessa desse JSON antes de passar para o agente. Esta é uma das poucas partes de código novo que precisará ser escrita.

### 2.4 · Como a resposta é enviada

No protótipo, o n8n simplesmente "responde" à requisição HTTP do frontend. Na produção, isso não funciona assim — a Meta não fica esperando a resposta. Ela entregou a mensagem e foi embora.

Para responder ao paciente, o sistema precisa fazer uma **nova requisição ativa** para a API da Meta:

```
POST https://graph.facebook.com/v21.0/{ID_DO_NUMERO}/messages
Authorization: Bearer {TOKEN}

{
  "messaging_product": "whatsapp",
  "to": "5511999999999",
  "type": "text",
  "text": { "body": "Oi! Sou a Ana da clínica..." }
}
```

No n8n, isso é um node de HTTP Request. Simples de configurar, mas é uma mudança arquitetural importante: o sistema passa de reativo (responde quando perguntado) para ativo (faz chamadas por conta própria).

---

## Parte 3 — Regras da Meta para mensagens

Esta é a parte que mais impacta a operação real e que menos pessoas conhecem antes de começar.

### 3.1 · A janela de 24 horas

Quando um **paciente inicia** a conversa (manda a primeira mensagem), o sistema pode responder livremente, com qualquer texto, por **24 horas**. Esse é o cenário principal da clínica: paciente manda "oi, quero agendar" e o agente conduz a conversa normalmente.

Passadas 24 horas sem resposta do paciente, essa janela fecha. Para reabrir, é necessário usar um **Template Message** aprovado.

### 3.2 · Templates de mensagem

Quando o **sistema precisa iniciar** a conversa (enviar um lembrete, uma confirmação que o paciente não pediu), **é obrigatório usar um template** — um texto pré-aprovado pela Meta.

Templates são submetidos no Meta Business Manager e ficam aguardando revisão por 1 a 3 dias úteis. A Meta rejeita templates que contenham linguagem promocional, links externos desnecessários ou que não sejam claros quanto ao propósito.

Para a clínica, os templates mínimos necessários são:

**Confirmação de consulta** (enviada após agendamento):
> "Olá {nome}! Sua consulta de {especialidade} foi confirmada para {data} às {horário}. Caso precise remarcar, responda aqui."

**Lembrete 24h antes** (enviado automaticamente na véspera):
> "Oi {nome}, lembrete: sua consulta é amanhã, {data} às {horário}. Confirma presença? Responda Sim ou Não."

Os `{campos}` são variáveis preenchidas dinamicamente pelo sistema.

---

## Parte 4 — Banco de dados: o que precisa ser ajustado

O banco de dados atual (Supabase) funciona bem, mas precisa de alguns ajustes para a realidade de produção.

### 4.1 · Identificador do paciente

No protótipo, cada conversa é identificada por um `session_id` gerado no navegador — um código aleatório que some quando o usuário fecha o navegador.

Na produção, o identificador natural é o **número de WhatsApp do paciente**. Ele é único, permanente e vem automaticamente em cada mensagem. Isso simplifica bastante a lógica: o histórico é sempre buscado pelo número.

### 4.2 · Deduplicação de mensagens

A Meta pode, em casos de instabilidade de rede, reenviar a mesma mensagem mais de uma vez. Sem controle, o agente responderia duas vezes e poderia criar dois agendamentos para a mesma conversa.

A solução é registrar cada mensagem processada pelo seu ID único (`wamid` — WhatsApp Message ID) e ignorar qualquer mensagem com ID já visto.

### 4.3 · Log de mensagens enviadas

Em produção, é essencial saber o que o sistema enviou, quando, e se a mensagem foi entregue. A Meta envia notificações de status (enviado → entregue → lido → falhou) que podem ser capturadas e registradas.

Isso serve tanto para monitoramento operacional quanto para eventuais questionamentos — "o sistema me mandou mensagem errada?" — que podem surgir.

---

## Parte 5 — Segurança e conformidade

### 5.1 · Verificação de autenticidade das mensagens

Qualquer pessoa com a URL do webhook poderia, em teoria, enviar requisições falsas fingindo ser a Meta. Para prevenir isso, a Meta assina cada requisição com uma chave criptográfica.

O sistema precisa validar essa assinatura antes de processar qualquer mensagem. No n8n, isso é feito com um node de código JavaScript de poucas linhas — mas é obrigatório para evitar que agentes maliciosos injetem mensagens no sistema.

### 5.2 · LGPD e dados de saúde

> [!IMPORTANT]
> Ao operar com pacientes reais, o sistema passa a lidar com dados pessoais de saúde — categoria especialmente protegida pela LGPD.

Isso implica, no mínimo:

- **Aviso de privacidade** enviado automaticamente na primeira mensagem de um novo paciente, informando que a conversa é processada por IA e como os dados são usados
- **Consentimento registrado** — guardar data e hora em que o paciente aceitou os termos (mesmo que implicitamente, ao continuar a conversa)
- **Dados sensíveis fora do histórico** — o agente não deve armazenar diagnósticos, resultados de exames ou informações clínicas no histórico de chat. Esse campo vai para o prontuário, não para o log de mensagens
- **Política de retenção** — definir por quanto tempo conversas e dados de leads são mantidos

### 5.3 · Variáveis de ambiente

Nenhum token, senha ou chave de API deve aparecer diretamente no código ou em arquivos versionados no Git. Todos os segredos ficam em variáveis de ambiente no n8n ou em Credentials do n8n, acessados pelo workflow de forma segura.

---

## Parte 6 — Google Calendar: o que muda e o que fica igual

O Google Calendar em si não precisa de nenhuma alteração. A integração OAuth já configurada no n8n continua funcionando exatamente da mesma forma.

O que muda é o que é colocado nos eventos:

- **Antes:** eventos criados com identificadores genéricos de sessão
- **Depois:** eventos com nome real, número de WhatsApp e motivo da consulta

Além disso, a produção abre espaço para uma funcionalidade nova: **lembretes automáticos**. Um gatilho no n8n pode rodar diariamente às 8h da manhã, buscar todos os eventos do dia seguinte no Calendar e enviar automaticamente o template de lembrete para cada paciente pelo WhatsApp. Sem nenhuma ação manual da clínica.

---

## Parte 7 — Operação real: custos e limites

### Custos mensais estimados (clínica pequena)

| Serviço | Custo |
|---|---|
| Meta Cloud API (até 1.000 conversas/mês) | Gratuito |
| Meta Cloud API (além de 1.000) | ~R$ 0,30–0,50 por conversa adicional |
| Chip/número dedicado | R$ 30–50/mês |
| n8n Hostinger (já existente) | Já pago |
| Supabase (já existente) | Já pago |
| OpenAI API (uso médio) | R$ 30–100/mês |
| Google Calendar | Gratuito |
| **Total estimado** | **R$ 60–150/mês** |

### Limites da Meta por tier

A Meta opera com um sistema de tiers que aumenta os limites conforme o histórico de uso:

| Tier | Conversas únicas/dia | Como chegar lá |
|---|---|---|
| Tier 1 (inicial) | 250 | Automático ao cadastrar |
| Tier 2 | 1.000 | Após histórico positivo de uso |
| Tier 3 | 10.000 | Após histórico positivo de uso |
| Tier 4 | Ilimitado | Após histórico positivo de uso |

Para uma clínica começando, Tier 1 é mais do que suficiente. Os limites sobem automaticamente conforme o sistema é usado de forma consistente.

---

## Parte 8 — O que a clínica precisa fazer

A transição não é só técnica. Há itens que dependem diretamente da clínica:

| Responsabilidade | Detalhes |
|---|---|
| Fornecer CNPJ e documentos | Para verificação no Meta Business Manager |
| Disponibilizar número de telefone | Que não esteja em uso no WhatsApp pessoal |
| Revisar e aprovar templates | Os textos de confirmação e lembrete |
| Configurar agenda no Google Calendar | Horários disponíveis, especialidades, médicos |
| Nomear responsável pelo monitoramento | Alguém que acompanhe as primeiras semanas |
| Informar pacientes do novo canal | Divulgar o número nas redes sociais, recepção, etc. |

---

## Parte 9 — Riscos conhecidos

| Risco | Probabilidade | O que fazer |
|---|---|---|
| Verificação Meta rejeitada ou demorada | Média | Iniciar o processo com antecedência; ter documentação CNPJ organizada |
| Número já em uso no WhatsApp | Alta | Verificar antes de qualquer coisa; providenciar número novo se necessário |
| Template rejeitado pela Meta | Média | Escrever em português claro, sem links desnecessários, sem tom promocional |
| Paciente enviando áudio ou imagem | Alta | Sistema já responde pedindo que envie texto |
| IA demorando mais de 60 segundos | Média | Enviar "Verificando..." imediatamente e processar em segundo plano |
| Janela de 24h expirada | Média | Usar template de reengajamento para retomar conversa |

---

## Cronograma realista

> [!NOTE]
> A maior parte do tempo é aguardar a burocracia da Meta, não desenvolver código. O desenvolvimento técnico em si leva 2–3 dias de trabalho.

| Semana | O que acontece |
|---|---|
| **Semana 1** | Processo Meta: verificação de empresa, registro de número, criação de app |
| **Semana 1–2** | Submissão e aguardo de aprovação dos templates de mensagem |
| **Semana 2** | Desenvolvimento: novo workflow n8n, ajustes no banco, testes com sandbox Meta |
| **Semana 3** | Testes com número real (equipe da clínica), ajustes finos |
| **Semana 3–4** | Go-live gradual — primeiros pacientes reais, monitoramento próximo |

---

## Resumo comparativo: Protótipo vs. Produção

| Aspecto | Protótipo | Produção |
|---|---|---|
| Canal de entrada | Interface web no navegador | WhatsApp no celular do paciente |
| Identificação do usuário | Código gerado no navegador | Número de WhatsApp (permanente) |
| Envio de resposta | Resposta HTTP direta | Chamada ativa para API da Meta |
| Autenticação | Nenhuma | Token permanente + assinatura criptográfica |
| Templates de mensagem | Não necessário | Obrigatório para mensagens proativas |
| Deduplicação | Não necessário | Essencial |
| Frontend web | Interface de demonstração | Descartado — WhatsApp é a interface |
| LGPD | Não aplicável (demo) | Obrigatório (dados de saúde reais) |
| Custo de operação | Zero (dev/demo) | R$ 60–150/mês estimado |
| Núcleo de IA (n8n + OpenAI + Calendar) | ✅ Funcional | ✅ Mantido sem grandes alterações |
