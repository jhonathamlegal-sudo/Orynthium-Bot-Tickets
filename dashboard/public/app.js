'use strict';
const socket = io();
let STATE = { guildId: null, key: null, data: null };

const $ = (id) => document.getElementById(id);
const qs = (sel, root = document) => root.querySelector(sel);

// ── Auth ──────────────────────────────────────────────────────────────────────
$('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const guildId = $('guildInput').value.trim();
  const key = $('keyInput').value.trim();
  if (!guildId) return showLoginError('Informe o Guild ID.');
  STATE = { guildId, key, data: null };

  $('loadBtn').disabled = true;
  $('loadBtn').textContent = 'Carregando...';
  $('loginError').style.display = 'none';

  try {
    await loadDashboard();
    $('login-screen').style.display = 'none';
    $('app').style.display = 'flex';
    socket.emit('joinGuild', guildId);
  } catch (err) {
    showLoginError(err.message);
    $('loadBtn').disabled = false;
    $('loadBtn').textContent = 'Acessar Dashboard';
  }
});

$('logoutBtn').addEventListener('click', () => {
  STATE = { guildId: null, key: null, data: null };
  $('app').style.display = 'none';
  $('login-screen').style.display = 'flex';
  $('guildInput').value = '';
  $('keyInput').value = '';
});

function showLoginError(msg) {
  const el = $('loginError');
  el.textContent = '❌ ' + msg;
  el.style.display = 'block';
}

async function apiFetch(path, options = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (STATE.key) headers['x-dashboard-key'] = STATE.key;
  const res = await fetch(path, { ...options, headers: { ...headers, ...(options.headers || {}) } });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
  return body;
}

// ── Data loading ──────────────────────────────────────────────────────────────
async function loadDashboard() {
  const data = await apiFetch(`/bot-api/overview/${STATE.guildId}`);
  STATE.data = data;
  renderOverview(data);
  renderSettings(data.settings);
  $('guildName').textContent = data.guild?.name || STATE.guildId;
  $('guildId').textContent = STATE.guildId;
  const health = await apiFetch('/bot-api/health').catch(() => null);
  if (health?.tag) $('botTag').textContent = health.tag;
}

async function loadTickets() {
  const status = $('statusFilter').value;
  const tickets = await apiFetch(`/bot-api/tickets/${STATE.guildId}${status ? `?status=${status}` : ''}`);
  renderTickets(tickets);
}

async function loadAudit() {
  const data = await apiFetch(`/bot-api/overview/${STATE.guildId}`);
  renderAudit(data.audit || []);
}

// ── Nav ───────────────────────────────────────────────────────────────────────
document.querySelectorAll('.nav-item').forEach((btn) => {
  btn.addEventListener('click', async () => {
    document.querySelectorAll('.nav-item').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
    btn.classList.add('active');
    const tab = btn.dataset.tab;
    $(`tab-${tab}`).classList.add('active');
    if (tab === 'tickets') await loadTickets().catch(console.error);
    if (tab === 'audit') await loadAudit().catch(console.error);
  });
});

$('refreshBtn').addEventListener('click', () => loadDashboard().catch(console.error));
$('refreshAuditBtn').addEventListener('click', () => loadAudit().catch(console.error));
$('statusFilter').addEventListener('change', () => loadTickets().catch(console.error));
$('ticketSearch').addEventListener('input', filterTickets);

// ── Render: Overview ──────────────────────────────────────────────────────────
function renderOverview(data) {
  const { stats } = data;
  const avgStr = stats.avg_rating != null ? `${stats.avg_rating} ⭐` : '—';
  $('statsGrid').innerHTML = `
    <div class="stat-card"><div class="stat-num">${stats.total}</div><div class="stat-label">Total</div></div>
    <div class="stat-card green"><div class="stat-num">${stats.open}</div><div class="stat-label">Abertos</div></div>
    <div class="stat-card red"><div class="stat-num">${stats.closed}</div><div class="stat-label">Fechados</div></div>
    <div class="stat-card yellow"><div class="stat-num">${avgStr}</div><div class="stat-label">Avaliação Média</div></div>
  `;
  const catMap = {
    duvidas: '🔎 Dúvidas', denuncia: '❌ Denúncia',
    parceria: '🤝 Parceria', outros: '⚙️ Outros',
  };
  $('byCategory').innerHTML = (stats.by_category || []).map((r) =>
    `<div class="cat-row"><span>${catMap[r.category_key] || r.category_key}</span><span class="cat-badge">${r.count}</span></div>`
  ).join('') || '<div style="color:var(--muted);font-size:13px">Nenhum ticket ainda.</div>';

  $('topStaff').innerHTML = (stats.top_staff || []).map((r, i) =>
    `<div class="staff-row"><span>${['🥇','🥈','🥉','4️⃣','5️⃣'][i] || '•'} <code>${r.claimed_by}</code></span><span class="staff-badge">${r.count}</span></div>`
  ).join('') || '<div style="color:var(--muted);font-size:13px">Nenhum atendimento fechado ainda.</div>';
}

// ── Render: Tickets ───────────────────────────────────────────────────────────
let _allTickets = [];
function renderTickets(tickets) {
  _allTickets = tickets;
  filterTickets();
}
function filterTickets() {
  const q = $('ticketSearch').value.toLowerCase();
  const filtered = q
    ? _allTickets.filter((t) =>
        t.opener_id?.includes(q) ||
        t.claimed_by?.includes(q) ||
        t.category_key?.includes(q) ||
        (t.channel_name || '').toLowerCase().includes(q) ||
        (t.close_reason || '').toLowerCase().includes(q)
      )
    : _allTickets;
  const tbody = $('ticketsTbody');
  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="8" class="empty-state">Nenhum ticket encontrado.</td></tr>`;
    return;
  }
  tbody.innerHTML = filtered.map((t) => {
    const numStr = t.ticket_number ? `#${String(t.ticket_number).padStart(4, '0')}` : `—`;
    const statusBadge = t.status === 'open'
      ? `<span class="badge badge-open">Aberto</span>`
      : `<span class="badge badge-closed">Fechado</span>`;
    const catLabels = { duvidas: '🔎 Dúvidas', denuncia: '❌ Denúncia', parceria: '🤝 Parceria', outros: '⚙️ Outros' };
    const catLabel = catLabels[t.category_key] || t.category_key;
    const rating = t.rating != null ? `<span class="rating-stars">${'⭐'.repeat(t.rating)}</span>` : '—';
    const created = t.created_at ? new Date(t.created_at).toLocaleString('pt-BR') : '—';
    const reason = t.close_reason ? `<span class="close-reason" title="${escapeHtml(t.close_reason)}">${escapeHtml(t.close_reason)}</span>` : '—';
    const opener = `<span class="id-chip">${t.opener_id}</span>`;
    const claimer = t.claimed_by ? `<span class="id-chip">${t.claimed_by}</span>` : '—';
    return `<tr>
      <td>${numStr}</td>
      <td>${statusBadge}</td>
      <td>${catLabel}</td>
      <td>${opener}</td>
      <td>${claimer}</td>
      <td>${rating}</td>
      <td>${created}</td>
      <td>${reason}</td>
    </tr>`;
  }).join('');
}
function escapeHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Render: Settings ──────────────────────────────────────────────────────────
function renderSettings(settings) {
  const form = $('settingsForm');
  for (const el of form.elements) {
    if (!el.name) continue;
    if (el.type === 'checkbox') {
      el.checked = Boolean(settings[el.name]);
    } else {
      el.value = settings[el.name] != null ? settings[el.name] : '';
    }
  }
}

$('settingsForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = $('settingsForm');
  const payload = {};
  for (const el of form.elements) {
    if (!el.name) continue;
    if (el.type === 'checkbox') payload[el.name] = el.checked ? 1 : 0;
    else if (el.type === 'number') payload[el.name] = Number(el.value);
    else payload[el.name] = el.value;
  }
  const status = $('saveStatus');
  try {
    await apiFetch(`/bot-api/settings/${STATE.guildId}`, { method: 'POST', body: JSON.stringify(payload) });
    status.textContent = '✅ Salvo com sucesso!';
    setTimeout(() => (status.textContent = ''), 3000);
  } catch (err) {
    status.style.color = 'var(--red)';
    status.textContent = '❌ ' + err.message;
    setTimeout(() => { status.textContent = ''; status.style.color = 'var(--green)'; }, 4000);
  }
});

// ── Render: Audit ─────────────────────────────────────────────────────────────
const auditActionLabels = {
  ticket_created: '🆕 Ticket Criado',
  ticket_claimed: '🫡 Ticket Assumido',
  ticket_closed: '🔒 Ticket Fechado',
  ticket_closed_manual: '🔒 Fechado (manual)',
  ticket_rated: '⭐ Avaliação',
  ticket_renamed: '✏️ Renomeado',
  ticket_member_added: '➕ Membro Adicionado',
  ticket_member_removed: '➖ Membro Removido',
};

function renderAudit(logs) {
  if (!logs?.length) {
    $('auditList').innerHTML = '<div class="empty-state">Nenhum log encontrado.</div>';
    return;
  }
  $('auditList').innerHTML = logs.map((log) => {
    const label = auditActionLabels[log.action] || log.action;
    const time = new Date(log.created_at).toLocaleString('pt-BR');
    const user = log.user_id ? `<span class="audit-user">@${log.user_id}</span>` : '';
    return `<div class="audit-item">
      <span class="audit-action">${label}</span>
      ${user}
      <span class="audit-details">${log.details || ''}</span>
      <span class="audit-time">${time}</span>
    </div>`;
  }).join('');
}

// ── Socket.IO realtime ────────────────────────────────────────────────────────
socket.on('settingsUpdated', ({ guildId, settings }) => {
  if (guildId === STATE.guildId) renderSettings(settings);
});
