const { EmbedBuilder } = require('discord.js');
const { FOOTER_TEXT, CATEGORIES } = require('../config/constants');

function footerize(embed) {
  return embed.setFooter({ text: FOOTER_TEXT }).setTimestamp();
}

function panelEmbed() {
  const lines = Object.entries(CATEGORIES).map(
    ([, cat]) => `${cat.emoji} **${cat.label}** — ${cat.description}`
  );
  return footerize(
    new EmbedBuilder()
      .setColor(0x1d4ed8)
      .setTitle('🎟️ Orynthium Atrium: Tickets')
      .setImage('attachment://banner.png')
      .setDescription(
        `➡️ **Precisa de ajuda?** Use o menu abaixo para abrir um ticket.\n\n${lines.join('\n')}`
      )
  );
}

function ticketEmbed(categoryKey, openerId, claimedById = null, ticketNumber = null) {
  const c = CATEGORIES[categoryKey];
  const numStr = ticketNumber ? ` #${String(ticketNumber).padStart(4, '0')}` : '';
  return footerize(
    new EmbedBuilder()
      .setColor(c.color)
      .setTitle(`🎫 Ticket${numStr} — ${c.label}`)
      .setDescription(
        [
          `👤 **Usuário:** <@${openerId}>`,
          `🗂️ **Categoria:** ${c.emoji} ${c.label}`,
          `🫡 **Atendente:** ${claimedById ? `<@${claimedById}>` : '*aguardando...*'}`,
          '',
          c.intro,
        ].join('\n')
      )
  );
}

function confirmEmbed(categoryKey) {
  const c = CATEGORIES[categoryKey];
  return footerize(
    new EmbedBuilder()
      .setColor(c.color)
      .setTitle(`${c.emoji} Confirmar: ${c.label}`)
      .setDescription(
        `Você está abrindo um ticket de **${c.label}**.\n\n${c.description}\n\nClique em **✅ Confirmar** para criar ou **❌ Cancelar** para abortar.`
      )
  );
}

function configEmbed(settings) {
  const val = (v, prefix = '') => (v ? `${prefix}${v}${prefix === '<#' ? '>' : prefix === '<@&' ? '>' : ''}` : '`não definido`');
  return footerize(
    new EmbedBuilder()
      .setColor(0x0f172a)
      .setTitle('⚙️ Configuração do Sistema')
      .setDescription('Use os botões abaixo para configurar o bot diretamente no Discord.')
      .addFields(
        { name: '📢 Canal do Painel', value: settings.panel_channel_id ? `<#${settings.panel_channel_id}>` : '`não definido`', inline: true },
        { name: '📁 Categoria dos Tickets', value: settings.ticket_category_id ? `<#${settings.ticket_category_id}>` : '`não definido`', inline: true },
        { name: '🛡️ Cargo Staff', value: settings.staff_role_id ? `<@&${settings.staff_role_id}>` : '`não definido`', inline: true },
        { name: '📋 Canal de Logs', value: settings.log_channel_id ? `<#${settings.log_channel_id}>` : '`não definido`', inline: true },
        { name: '⏱️ Auto Close', value: `\`${settings.auto_close_minutes} min\``, inline: true },
        { name: '📄 Transcripts', value: settings.transcripts_enabled ? '`✅ ativado`' : '`❌ desativado`', inline: true },
      )
  );
}

function statsEmbed(stats) {
  const byCategory = (stats.by_category || [])
    .map((r) => {
      const cat = CATEGORIES[r.category_key];
      return cat ? `${cat.emoji} **${cat.label}**: ${r.count}` : `**${r.category_key}**: ${r.count}`;
    })
    .join('\n') || '—';

  return footerize(
    new EmbedBuilder()
      .setColor(0x22c55e)
      .setTitle('📊 Estatísticas de Tickets')
      .addFields(
        { name: '📦 Total', value: String(stats.total || 0), inline: true },
        { name: '🟢 Abertos', value: String(stats.open || 0), inline: true },
        { name: '🔴 Fechados', value: String(stats.closed || 0), inline: true },
        { name: '⭐ Avaliação Média', value: stats.avg_rating == null ? '—' : `${stats.avg_rating} ⭐`, inline: true },
        { name: '\u200b', value: '\u200b', inline: true },
        { name: '\u200b', value: '\u200b', inline: true },
        { name: '📂 Por Categoria', value: byCategory, inline: false },
      )
  );
}

function closedLogEmbed(ticket, closedBy, reason) {
  const cat = CATEGORIES[ticket.category_key];
  const numStr = ticket.ticket_number ? ` #${String(ticket.ticket_number).padStart(4, '0')}` : '';
  return footerize(
    new EmbedBuilder()
      .setColor(0xa855f7)
      .setTitle(`🔒 Ticket${numStr} Encerrado`)
      .addFields(
        { name: '👤 Usuário', value: `<@${ticket.opener_id}>`, inline: true },
        { name: '🗂️ Categoria', value: cat ? `${cat.emoji} ${cat.label}` : ticket.category_key, inline: true },
        { name: '🫡 Atendente', value: ticket.claimed_by ? `<@${ticket.claimed_by}>` : '*não assumido*', inline: true },
        { name: '🔒 Fechado por', value: closedBy || '*auto-close*', inline: true },
        { name: '📝 Motivo', value: reason || '—', inline: false },
      )
  );
}

module.exports = { footerize, panelEmbed, ticketEmbed, confirmEmbed, configEmbed, statsEmbed, closedLogEmbed };
