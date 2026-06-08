const fs = require('fs');
const path = require('path');
const { CATEGORIES } = require('../config/constants');

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatTimestamp(ts) {
  return new Date(ts).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function colorForUser(userId) {
  const colors = ['#7289da', '#43b581', '#faa61a', '#f04747', '#593695', '#0f9bd7', '#36393f'];
  let hash = 0;
  for (const ch of userId) hash = (hash * 31 + ch.charCodeAt(0)) & 0xffffffff;
  return colors[Math.abs(hash) % colors.length];
}

async function fetchAllMessages(channel) {
  const all = [];
  let before;
  while (true) {
    const batch = await channel.messages.fetch({ limit: 100, before }).catch(() => null);
    if (!batch || batch.size === 0) break;
    all.push(...batch.values());
    if (batch.size < 100) break;
    before = batch.last().id;
  }
  return all.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
}

function renderMessage(msg) {
  const username = escapeHtml(msg.author.username || msg.author.tag || 'Desconhecido');
  const isBot = msg.author.bot;
  const color = isBot ? '#5865f2' : colorForUser(msg.author.id);
  const avatarLetter = (username[0] || '?').toUpperCase();
  const ts = formatTimestamp(msg.createdTimestamp);

  const contentHtml = msg.content
    ? `<div class="msg-content">${escapeHtml(msg.content)}</div>`
    : '';

  const attachmentsHtml = [...msg.attachments.values()]
    .map((a) => {
      if (a.contentType?.startsWith('image/')) {
        return `<div class="attachment"><img src="${escapeHtml(a.url)}" alt="Imagem" loading="lazy" /></div>`;
      }
      return `<div class="attachment"><a href="${escapeHtml(a.url)}" target="_blank">📎 ${escapeHtml(a.name || 'arquivo')}</a></div>`;
    })
    .join('');

  const embedsHtml = (msg.embeds || [])
    .map((e) => {
      const borderColor = e.color ? `#${e.color.toString(16).padStart(6, '0')}` : '#7289da';
      const title = e.title ? `<div class="embed-title">${escapeHtml(e.title)}</div>` : '';
      const desc = e.description ? `<div class="embed-desc">${escapeHtml(e.description)}</div>` : '';
      const fields = (e.fields || [])
        .map((f) => `<div class="embed-field"><span class="embed-field-name">${escapeHtml(f.name)}</span><span class="embed-field-val">${escapeHtml(f.value)}</span></div>`)
        .join('');
      return `<div class="embed" style="border-left-color:${borderColor}">${title}${desc}${fields ? `<div class="embed-fields">${fields}</div>` : ''}</div>`;
    })
    .join('');

  const botBadge = isBot ? `<span class="bot-badge">BOT</span>` : '';

  return `
    <div class="msg-wrapper">
      <div class="avatar" style="background:${color}">${avatarLetter}</div>
      <div class="msg-body">
        <div class="msg-header">
          <span class="author" style="color:${color}">${username}</span>
          ${botBadge}
          <span class="timestamp">${ts}</span>
        </div>
        ${contentHtml}
        ${attachmentsHtml}
        ${embedsHtml}
      </div>
    </div>`;
}

async function buildTranscript(channel, ticket) {
  const messages = await fetchAllMessages(channel);
  const cat = CATEGORIES[ticket.category_key];
  const numStr = ticket.ticket_number ? ` #${String(ticket.ticket_number).padStart(4, '0')}` : '';
  const catLabel = cat ? `${cat.emoji} ${cat.label}` : ticket.category_key;

  const messagesHtml = messages.length
    ? messages.map(renderMessage).join('\n')
    : '<div class="empty">Nenhuma mensagem encontrada.</div>';

  const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Transcript${numStr} — ${escapeHtml(channel.name)}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#1a1d23;color:#dcddde;font-family:-apple-system,'Segoe UI',Arial,sans-serif;font-size:15px;line-height:1.6}
.page{max-width:900px;margin:0 auto;padding:24px 16px}
header{background:#202225;border-radius:12px;padding:24px 28px;margin-bottom:24px;border:1px solid #2f3136}
header h1{font-size:22px;color:#fff;margin-bottom:4px}
.meta{display:flex;flex-wrap:wrap;gap:16px;margin-top:12px}
.meta-item{background:#2f3136;border-radius:6px;padding:6px 12px;font-size:13px;color:#b9bbbe}
.meta-item strong{color:#dcddde}
.messages{display:flex;flex-direction:column;gap:2px}
.msg-wrapper{display:flex;gap:14px;padding:10px 12px;border-radius:6px;transition:background .1s}
.msg-wrapper:hover{background:#202225}
.avatar{width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:17px;flex-shrink:0;color:#fff}
.msg-body{flex:1;min-width:0}
.msg-header{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;margin-bottom:4px}
.author{font-weight:600;font-size:15px}
.bot-badge{background:#5865f2;color:#fff;font-size:10px;padding:2px 5px;border-radius:4px;font-weight:700;letter-spacing:.3px}
.timestamp{color:#72767d;font-size:12px}
.msg-content{white-space:pre-wrap;word-break:break-word;color:#dcddde}
.attachment{margin-top:8px}
.attachment img{max-width:400px;max-height:300px;border-radius:8px;display:block}
.attachment a{color:#00b0f4;text-decoration:none}
.attachment a:hover{text-decoration:underline}
.embed{margin-top:8px;border-left:4px solid #7289da;background:#2f3136;border-radius:0 6px 6px 0;padding:10px 14px;max-width:520px}
.embed-title{font-weight:700;color:#fff;margin-bottom:6px;font-size:15px}
.embed-desc{color:#b9bbbe;font-size:14px;white-space:pre-wrap}
.embed-fields{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}
.embed-field{flex:1;min-width:140px}
.embed-field-name{display:block;font-weight:700;font-size:13px;color:#b9bbbe;margin-bottom:2px}
.embed-field-val{display:block;font-size:14px;color:#dcddde}
.empty{color:#72767d;text-align:center;padding:40px}
footer{text-align:center;color:#72767d;font-size:12px;margin-top:32px;padding:16px}
</style>
</head>
<body>
<div class="page">
  <header>
    <h1>🎫 Transcript${escapeHtml(numStr)} — #${escapeHtml(channel.name)}</h1>
    <div class="meta">
      <div class="meta-item"><strong>Categoria:</strong> ${escapeHtml(catLabel)}</div>
      <div class="meta-item"><strong>Usuário:</strong> ${escapeHtml(ticket.opener_id)}</div>
      ${ticket.claimed_by ? `<div class="meta-item"><strong>Atendente:</strong> ${escapeHtml(ticket.claimed_by)}</div>` : ''}
      <div class="meta-item"><strong>Canal:</strong> ${escapeHtml(ticket.channel_id)}</div>
      <div class="meta-item"><strong>Mensagens:</strong> ${messages.length}</div>
      <div class="meta-item"><strong>Gerado em:</strong> ${formatTimestamp(Date.now())}</div>
    </div>
  </header>
  <div class="messages">
    ${messagesHtml}
  </div>
  <footer>Gerado por Orynthium Atrium: Tickets • jho-cyber scripts</footer>
</div>
</body>
</html>`;

  const dir = path.join(process.cwd(), 'database', 'transcripts');
  fs.mkdirSync(dir, { recursive: true });
  const fileName = ticket.ticket_number
    ? `ticket-${String(ticket.ticket_number).padStart(4, '0')}-${channel.id}.html`
    : `${channel.id}.html`;
  const filePath = path.join(dir, fileName);
  fs.writeFileSync(filePath, html, 'utf8');
  return filePath;
}

module.exports = { buildTranscript };
