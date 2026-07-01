/**
 * OrlettiBot WhatsApp Frontend — app.js
 * Handles chat logic, webhook integration, and UI interactions.
 *
 * NOTE (protótipo): Este frontend simula o WhatsApp para demonstração.
 * A migração para a API real do WhatsApp (Evolution API) manterá a mesma
 * lógica de session_id e o formato de mensagens — apenas o canal muda.
 */

// ============ CONFIG ============
const CONFIG = {
  webhookUrl: 'https://n8n.srv1181762.hstgr.cloud/webhook/orletti/chat',
  apiToken: 'orletti_token_secure_demo_2026', // Token de validação do webhook (Bearer Auth)
  sessionKey: 'orletti_session_id',
  historyKey: 'orletti_history',
  soundKey: 'orletti_sound',
  maxRetries: 2,
  retryDelay: 2000,

  // Limites e thresholds — nomeados para facilitar ajuste futuro
  historyMaxMessages: 100,
  sidebarPreviewMaxChars: 40,
  scrollThreshold: 150,       // px do fundo para exibir o FAB
  typingSpeedMs: 30,           // ms por caractere no delay simulado de digitação
  typingMinDelayMs: 500,
  typingMaxDelayMs: 2000,
  toastDurationMs: 2500,
  resizeDebounceMs: 150,
  saveDebouncedMs: 300,
  greetingInitialDelay: 800,   // delay antes da primeira saudação no init
  greetingResetDelay: 600,     // delay após reset de conversa

  // Saudação centralizada — muda aqui, reflete em init() e startNewConversation()
  greeting: [
    { text: 'Oi! Eu sou o Lucas, assistente virtual do Grupo Orvel 🚗', delay: 0 },
    { text: 'Posso te ajudar a agendar uma revisão ou manutenção do seu veículo. Como posso te ajudar?', delay: 1200 },
  ],
};

// ============ STATE ============
const state = {
  sessionId: null,
  messages: [],
  isTyping: false,
  isSending: false,
  soundEnabled: true,
  unreadCount: 0,
  isScrolledUp: false,
  pendingAction: null,
  originalTitle: document.title,
  assistantMsgCount: 0,  // contador separado — evita filter() a cada mensagem
};

// ============ DOM REFS ============
const dom = {};

function cacheDom() {
  dom.chatMessages    = document.getElementById('chatMessages');
  dom.messageInput    = document.getElementById('messageInput');
  dom.sendBtn         = document.getElementById('sendBtn');
  dom.typingIndicator = document.getElementById('typingIndicator');
  dom.chatStatus      = document.getElementById('chatStatus');
  dom.sidebarTime     = document.getElementById('sidebarTime');
  dom.sidebarLastMsg  = document.getElementById('sidebarLastMsg');
  dom.sidebarBadge    = document.getElementById('sidebarBadge');
  dom.sidebar         = document.getElementById('sidebar');
  dom.backBtn         = document.getElementById('backBtn');
  dom.contactClinic   = document.getElementById('contactClinic');
  dom.scrollFab       = document.getElementById('scrollFab');
  dom.scrollFabBadge  = document.getElementById('scrollFabBadge');
  dom.dialogOverlay   = document.getElementById('dialogOverlay');
  dom.dialogText      = document.getElementById('dialogText');
  dom.dialogSubtext   = document.getElementById('dialogSubtext');
  dom.dialogConfirm   = document.getElementById('dialogConfirm');
  dom.dialogCancel    = document.getElementById('dialogCancel');
  dom.toastContainer  = document.getElementById('toastContainer');
  dom.btnSidebarMenu  = document.getElementById('btnSidebarMenu');
  dom.btnChatMenu     = document.getElementById('btnChatMenu');
  dom.sidebarDropdown = document.getElementById('sidebarDropdown');
  dom.chatDropdown    = document.getElementById('chatDropdown');
  dom.menuToggleSound = document.getElementById('menuToggleSound');
  dom.menuExport      = document.getElementById('menuExport');
  dom.soundLabel      = document.getElementById('soundLabel');
}

// ============ INIT ============
function init() {
  cacheDom();
  state.sessionId   = loadOrCreateSession();
  state.soundEnabled = localStorage.getItem(CONFIG.soundKey) !== 'false';
  updateSoundLabel();
  loadHistory();
  setupEventListeners();
  renderSavedMessages();
  handleResize();

  if (state.messages.length === 0) {
    sendInitialGreeting(CONFIG.greetingInitialDelay);
  }
}

// ============ RESPONSIVE HELPERS ============
function handleResize() {
  const isMobile = window.innerWidth <= 768;
  dom.sidebar.classList.toggle('sidebar-closed', isMobile);
}

// ============ SESSION ============
function loadOrCreateSession() {
  let id = localStorage.getItem(CONFIG.sessionKey);
  if (!id) {
    id = 'sess_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
    localStorage.setItem(CONFIG.sessionKey, id);
  }
  return id;
}

// ============ HISTORY ============
function loadHistory() {
  try {
    const saved = localStorage.getItem(CONFIG.historyKey);
    if (saved) {
      state.messages = JSON.parse(saved);
      // Recalcula contador ao restaurar histórico
      state.assistantMsgCount = state.messages.filter(m => m.role === 'assistant').length;
    }
  } catch { state.messages = []; }
}

// Debounce: agrupa escritas próximas em uma só — evita serializar o array
// várias vezes seguidas quando a resposta chega em múltiplos segmentos (||)
let _saveTimer = null;
function scheduleSave() {
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(saveHistory, CONFIG.saveDebouncedMs);
}

function saveHistory() {
  try {
    const toSave = state.messages.slice(-CONFIG.historyMaxMessages);
    localStorage.setItem(CONFIG.historyKey, JSON.stringify(toSave));
  } catch { /* ignora erros de quota */ }
}

// ============ EVENTS ============
function setupEventListeners() {

  // --- Enviar mensagem ---
  dom.sendBtn.addEventListener('click', handleSend);
  dom.messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  });
  dom.messageInput.addEventListener('input', () => {
    dom.messageInput.style.height = 'auto';
    dom.messageInput.style.height = Math.min(dom.messageInput.scrollHeight, 120) + 'px';
    dom.sendBtn.classList.toggle('active', dom.messageInput.value.trim().length > 0);
  });

  // --- Mobile: sidebar ---
  dom.backBtn.addEventListener('click', () => dom.sidebar.classList.remove('sidebar-closed'));
  dom.contactClinic.addEventListener('click', () => {
    if (window.innerWidth <= 768) dom.sidebar.classList.add('sidebar-closed');
    dom.sidebarBadge.style.display = 'none';
  });

  // --- Scroll FAB ---
  dom.chatMessages.addEventListener('scroll', handleScroll);
  dom.scrollFab.addEventListener('click', () => {
    scrollToBottom();
    state.unreadCount = 0;
    dom.scrollFabBadge.classList.remove('show');
    dom.scrollFabBadge.textContent = '';
  });

  // --- "Nova conversa" — todos os botões que disparam a mesma ação ---
  // (sidebar direto, header direto, menu sidebar, menu chat)
  ['btnNewChat', 'btnNewChatHeader', 'menuNewChat', 'menuNewChat2'].forEach(id => {
    document.getElementById(id)?.addEventListener('click', () => {
      closeAllDropdowns();
      showNewChatDialog();
    });
  });

  // --- "Limpar conversa" — sidebar e chat header ---
  ['menuClearChat', 'menuClearChat2'].forEach(id => {
    document.getElementById(id)?.addEventListener('click', () => {
      closeAllDropdowns();
      showClearChatDialog();
    });
  });

  // --- Dropdowns ---
  dom.btnSidebarMenu.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleDropdown(dom.sidebarDropdown, dom.btnSidebarMenu);
  });
  dom.btnChatMenu.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleDropdown(dom.chatDropdown, dom.btnChatMenu);
  });

  // --- Itens de menu únicos ---
  dom.menuToggleSound.addEventListener('click', () => {
    state.soundEnabled = !state.soundEnabled;
    localStorage.setItem(CONFIG.soundKey, state.soundEnabled);
    updateSoundLabel();
    showToast(state.soundEnabled ? 'Som de notificação ativado' : 'Som de notificação desativado');
  });
  dom.menuExport.addEventListener('click', () => {
    closeAllDropdowns();
    exportConversation();
  });

  // --- Dialog de confirmação ---
  dom.dialogCancel.addEventListener('click', closeDialog);
  dom.dialogOverlay.addEventListener('click', (e) => {
    if (e.target === dom.dialogOverlay) closeDialog();
  });
  dom.dialogConfirm.addEventListener('click', () => {
    if (state.pendingAction) state.pendingAction();
    closeDialog();
  });

  // --- Globais ---
  document.addEventListener('click', closeAllDropdowns);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) document.title = state.originalTitle;
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closeDialog(); closeAllDropdowns(); }
  });

  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(handleResize, CONFIG.resizeDebounceMs);
  });
}

// ============ SAUDAÇÃO INICIAL ============
// Função única — elimina duplicação entre init() e startNewConversation()
async function sendInitialGreeting(initialDelay = CONFIG.greetingInitialDelay) {
  await delay(initialDelay);
  for (const { text, delay: msgDelay } of CONFIG.greeting) {
    if (msgDelay > 0) await delay(msgDelay);
    addBotMessage(text);
  }
}

// ============ SEND MESSAGE ============
async function handleSend() {
  const text = dom.messageInput.value.trim();
  if (!text || state.isSending) return;

  state.isSending = true;
  dom.messageInput.value = '';
  dom.messageInput.style.height = 'auto';
  dom.sendBtn.classList.remove('active');

  addUserMessage(text);
  showTyping();

  try {
    const response = await sendToWebhook(text);
    hideTyping();

    const responseText = typeof response === 'string' ? response : JSON.stringify(response);
    const segments = responseText.split('||');

    for (let i = 0; i < segments.length; i++) {
      const msg = segments[i].trim();
      if (!msg) continue;
      if (i > 0) {
        showTyping();
        await delay(Math.min(msg.length * CONFIG.typingSpeedMs + CONFIG.typingMinDelayMs, CONFIG.typingMaxDelayMs));
        hideTyping();
      }
      addBotMessage(msg);
    }
  } catch (error) {
    hideTyping();
    addBotMessage('Desculpe, ocorreu um erro na comunicação. Tente novamente em alguns instantes.');
    console.error('[OrvelBot] Webhook error:', error);
  }

  state.isSending = false;
  dom.messageInput.focus();
}

// ============ WEBHOOK ============
async function sendToWebhook(message, attempt = 0) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    const res = await fetch(CONFIG.webhookUrl, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CONFIG.apiToken}`
      },
      body: JSON.stringify({
        message: message,
        session_id: state.sessionId,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();

    // Normaliza os diferentes formatos de resposta do n8n
    if (Array.isArray(data)) {
      return data[0]?.message || data[0]?.output || data[0]?.text || JSON.stringify(data[0]);
    }
    return data.message || data.output || data.text || data.response || JSON.stringify(data);

  } catch (err) {
    if (attempt < CONFIG.maxRetries) {
      await delay(CONFIG.retryDelay);
      return sendToWebhook(message, attempt + 1);
    }
    throw err;
  }
}

// ============ MESSAGE RENDERING ============
function addUserMessage(text) {
  const msg = { role: 'user', content: text, time: now() };
  state.messages.push(msg);
  scheduleSave();
  renderMessage(msg);
  updateSidebar(text);
  scrollToBottom();
}

function addBotMessage(text) {
  const msg = { role: 'assistant', content: text, time: now() };
  state.messages.push(msg);
  state.assistantMsgCount++;
  scheduleSave();
  renderMessage(msg);
  updateSidebar(text);

  if (state.soundEnabled) playNotificationSound();

  if (state.isScrolledUp) {
    state.unreadCount++;
    dom.scrollFabBadge.textContent = state.unreadCount;
    dom.scrollFabBadge.classList.add('show');
    // Badge da sidebar reflete não-lidas reais
    dom.sidebarBadge.textContent = state.unreadCount;
  } else {
    scrollToBottom();
  }

  dom.sidebarBadge.style.display = 'flex';

  // Usa contador direto — sem filter() a cada mensagem
  if (document.hidden) {
    document.title = `(${state.assistantMsgCount}) ${state.originalTitle}`;
  }
}

// Constrói o elemento DOM sem inseri-lo — permite uso com DocumentFragment
function buildMessageElement(msg) {
  const isUser = msg.role === 'user';
  const wrapper = document.createElement('div');
  wrapper.className = `message ${isUser ? 'outgoing' : 'incoming'}`;

  const bubble = document.createElement('div');
  bubble.className = 'message-bubble';

  const textEl = document.createElement('span');
  textEl.className = 'message-text';
  textEl.innerHTML = linkify(msg.content);

  const meta = document.createElement('span');
  meta.className = 'message-meta';

  const timeEl = document.createElement('span');
  timeEl.className = 'message-time';
  timeEl.textContent = msg.time;
  meta.appendChild(timeEl);

  if (isUser) {
    const status = document.createElement('span');
    status.className = 'message-status read';
    status.innerHTML = '<svg viewBox="0 0 16 11"><path d="M11.07.66L5.4 7.18 3.55 5.06l-.98.84 2.87 3.33 6.64-7.58z"/><path d="M7.6.66L1.93 7.18.08 5.06l-.98.84 2.87 3.33L8.58 1.5z" opacity=".4"/></svg>';
    meta.appendChild(status);
  }

  bubble.appendChild(textEl);
  bubble.appendChild(meta);
  wrapper.appendChild(bubble);

  bubble.addEventListener('click', () => copyMessage(bubble, msg.content));

  return wrapper;
}

// Insere mensagem em tempo real (durante a conversa)
function renderMessage(msg) {
  const el = buildMessageElement(msg);
  dom.chatMessages.insertBefore(el, dom.typingIndicator);
}

// Renderiza o histórico salvo em um único reflow via DocumentFragment
// Evita forçar layout do browser a cada mensagem inserida
function renderSavedMessages() {
  if (state.messages.length === 0) return;

  const fragment = document.createDocumentFragment();
  state.messages.forEach(msg => fragment.appendChild(buildMessageElement(msg)));
  dom.chatMessages.insertBefore(fragment, dom.typingIndicator);
  scrollToBottom(false);
}

// ============ TYPING INDICATOR ============
function showTyping() {
  state.isTyping = true;
  dom.typingIndicator.classList.add('active');
  dom.chatStatus.textContent = 'digitando...';
  scrollToBottom();
}

function hideTyping() {
  state.isTyping = false;
  dom.typingIndicator.classList.remove('active');
  dom.chatStatus.textContent = 'online';
}

// ============ SIDEBAR ============
function updateSidebar(text) {
  const maxChars = CONFIG.sidebarPreviewMaxChars;
  dom.sidebarLastMsg.textContent = text.length > maxChars
    ? text.slice(0, maxChars) + '...'
    : text;
  dom.sidebarTime.textContent = now();
}

// ============ SCROLL MANAGEMENT ============
function handleScroll() {
  const el = dom.chatMessages;
  const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
  state.isScrolledUp = distFromBottom > CONFIG.scrollThreshold;

  if (state.isScrolledUp) {
    dom.scrollFab.classList.add('show');
  } else {
    dom.scrollFab.classList.remove('show');
    state.unreadCount = 0;
    dom.scrollFabBadge.classList.remove('show');
    dom.scrollFabBadge.textContent = '';
  }
}

// ============ DROPDOWN MENUS ============
function toggleDropdown(menu, triggerBtn) {
  const wasOpen = menu.classList.contains('show');
  closeAllDropdowns();
  if (!wasOpen) {
    const rect = triggerBtn.getBoundingClientRect();
    menu.style.top = (rect.bottom + 4) + 'px';
    menu.style.left = 'auto';
    menu.style.right = 'auto';

    if (rect.right > window.innerWidth / 2) {
      menu.style.right = Math.max(16, window.innerWidth - rect.right) + 'px';
    } else {
      menu.style.left = Math.max(16, rect.left) + 'px';
    }

    menu.classList.add('show');
  }
}

function closeAllDropdowns() {
  document.querySelectorAll('.dropdown-menu.show').forEach(m => m.classList.remove('show'));
}

// ============ DIALOGS ============
function showDialog(text, subtext, onConfirm) {
  dom.dialogText.textContent = text;
  dom.dialogSubtext.textContent = subtext;
  state.pendingAction = onConfirm;
  dom.dialogOverlay.classList.add('show');
}

function closeDialog() {
  dom.dialogOverlay.classList.remove('show');
  state.pendingAction = null;
}

function showNewChatDialog() {
  showDialog(
    'Iniciar nova conversa?',
    'Uma nova sessão será criada. O histórico anterior será apagado do navegador.',
    startNewConversation
  );
}

function showClearChatDialog() {
  showDialog(
    'Limpar conversa?',
    'Todas as mensagens serão removidas da tela. A sessão continuará ativa.',
    clearChat
  );
}

// ============ ACTIONS ============
function startNewConversation() {
  state.messages = [];
  state.unreadCount = 0;
  state.assistantMsgCount = 0;

  localStorage.removeItem(CONFIG.sessionKey);
  localStorage.removeItem(CONFIG.historyKey);

  state.sessionId = loadOrCreateSession();
  clearChatDom();

  dom.sidebarLastMsg.textContent = 'Toque para iniciar conversa';
  dom.sidebarTime.textContent = 'agora';
  dom.sidebarBadge.style.display = 'none';
  document.title = state.originalTitle;

  sendInitialGreeting(CONFIG.greetingResetDelay);
  showToast('Nova conversa iniciada');
}

function clearChat() {
  state.messages = [];
  state.assistantMsgCount = 0;
  localStorage.removeItem(CONFIG.historyKey);
  clearChatDom();
  dom.sidebarLastMsg.textContent = 'Conversa limpa';
  dom.sidebarBadge.style.display = 'none';
  showToast('Conversa limpa');
}

function clearChatDom() {
  dom.chatMessages.querySelectorAll('.message').forEach(m => m.remove());
}

function exportConversation() {
  if (state.messages.length === 0) {
    showToast('Nenhuma mensagem para exportar');
    return;
  }

  let text = `Atendimento Pós-Venda — Grupo Orvel\n`;
  text += `Exportado em: ${new Date().toLocaleString('pt-BR')}\n`;
  text += `Sessão: ${state.sessionId}\n`;
  text += '—'.repeat(40) + '\n\n';

  state.messages.forEach(msg => {
    const sender = msg.role === 'user' ? 'Você' : 'Lucas (OrvelBot)';
    text += `[${msg.time}] ${sender}:\n${msg.content}\n\n`;
  });

  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `atendimento-orvel-${new Date().toISOString().slice(0, 10)}.txt`;
  a.click();
  URL.revokeObjectURL(url);

  showToast('Conversa exportada com sucesso');
}

function copyMessage(bubble, text) {
  navigator.clipboard.writeText(text).then(() => {
    showCopiedFeedback(bubble);
  }).catch(() => {
    // Fallback para browsers sem suporte à Clipboard API
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch { /* silencioso */ }
    document.body.removeChild(ta);
    showCopiedFeedback(bubble);
  });
}

function showCopiedFeedback(bubble) {
  bubble.classList.add('copied');
  setTimeout(() => bubble.classList.remove('copied'), 1500);
}

// ============ TOAST ============
function showToast(message) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `<svg viewBox="0 0 24 24"><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"/></svg>${message}`;
  dom.toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('leaving');
    toast.addEventListener('animationend', () => toast.remove(), { once: true });
  }, CONFIG.toastDurationMs);
}

// ============ SOUND ============
// Singleton: reutiliza o mesmo AudioContext em vez de criar um novo a cada mensagem
// Browsers limitam o número de AudioContexts simultâneos (~6)
let _audioCtx = null;

function getAudioContext() {
  if (!_audioCtx || _audioCtx.state === 'closed') {
    _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (_audioCtx.state === 'suspended') _audioCtx.resume();
  return _audioCtx;
}

function playNotificationSound() {
  try {
    const ctx = getAudioContext();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.15);
  } catch { /* Audio não suportado */ }
}

function updateSoundLabel() {
  if (dom.soundLabel) {
    dom.soundLabel.textContent = state.soundEnabled ? 'Som: Ligado' : 'Som: Desligado';
  }
}

// ============ UTILS ============
function now() {
  return new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function linkify(text) {
  // Escapa HTML antes de converter URLs — previne XSS
  let safe = escapeHtml(text);
  
  // 1. Proteger as URLs convertendo-as para placeholders temporários
  const urlPattern = /(https?:\/\/[^\s<]+)/g;
  const urls = [];
  safe = safe.replace(urlPattern, (url) => {
    const placeholder = `##URLPLACEHOLDER${urls.length}##`;
    urls.push(url);
    return placeholder;
  });

  // 2. Parse code blocks: ```texto``` -> <pre><code>texto</code></pre>
  safe = safe.replace(/```([\s\S]+?)```/g, '<pre><code>$1</code></pre>');
  
  // 3. Parse inline code: `texto` -> <code>texto</code>
  safe = safe.replace(/`([^`]+)`/g, '<code>$1</code>');

  // 4. Parse bold: **texto** ou *texto* -> <strong>texto</strong>
  // Processamos primeiro ** (Markdown) para evitar conflitos com * (WhatsApp)
  safe = safe.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  safe = safe.replace(/\*([^*]+)\*/g, '<strong>$1</strong>');

  // 5. Parse italic: _texto_ -> <em>texto</em>
  safe = safe.replace(/_([^_]+)_/g, '<em>$1</em>');

  // 6. Parse strikethrough: ~texto~ -> <del>texto</del>
  safe = safe.replace(/~([^~]+)~/g, '<del>$1</del>');

  // 7. Restaurar as URLs com tags <a>
  urls.forEach((url, idx) => {
    const placeholder = `##URLPLACEHOLDER${idx}##`;
    const display = url.length > 45 ? url.slice(0, 42) + '...' : url;
    const anchor = `<a href="${url}" target="_blank" rel="noopener noreferrer" class="message-link">${display}</a>`;
    safe = safe.replace(placeholder, anchor);
  });

  return safe;
}

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function scrollToBottom(smooth = true) {
  requestAnimationFrame(() => {
    dom.chatMessages.scrollTo({
      top: dom.chatMessages.scrollHeight,
      behavior: smooth ? 'smooth' : 'auto',
    });
  });
}

// ============ START ============
document.addEventListener('DOMContentLoaded', init);
