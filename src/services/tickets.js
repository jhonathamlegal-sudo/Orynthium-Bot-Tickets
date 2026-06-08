const path = require('path');
const {
  ChannelType,
  PermissionsBitField,
  EmbedBuilder,
} = require('discord.js');
const { CATEGORIES } = require('../config/constants');
const { footerize, ticketEmbed, configEmbed, statsEmbed, closedLogEmbed } = require('../utils/embeds');
const { confirmButtons, ticketButtons, closeButtons, ratingButtons, configButtons, modalValue, closeModal } = require('../utils/ui');
const { isAdminFromInteraction, hasStaffRole, getMemberRoleIds } = require('../utils/permissions');
const { buildTranscript } = require('./transcript');
const { refreshPanelForGuild } = require('./panel');

const timers = new Map();

function sanitizeChannelName(input) {
  return String(input)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

function createTicketChannelName(categoryLabel, username, ticketNumber) {
  const num = String(ticketNumber).padStart(4, '0');
  const base = `ticket-${num}-${categoryLabel}-${username}`;
  const clean = sanitizeChannelName(base);
  return (clean || `ticket-${num}`).slice(0, 90);
}

function clearTimer(channelId) {
  const t = timers.get(channelId);
  if (t) clearTimeout(t);
  timers.delete(channelId);
}

function scheduleAutoClose(client, db, ticket, resetFull = false) {
  clearTimer(ticket.channel_id);
  const settings = db.getSettings(ticket.guild_id);
  const minutes = settings.auto_close_minutes || 35;
  let remaining;
  if (resetFull) {
    remaining = minutes * 60 * 1000;
  } else {
    const elapsedMs = ticket.claimed_at ? Date.now() - ticket.claimed_at : 0;
    remaining = Math.max(10_000, minutes * 60 * 1000 - elapsedMs);
  }
  const t = setTimeout(
    () => autoCloseTicket(client, db, ticket.channel_id, 'Inatividade após assumir o ticket.'),
    remaining
  );
  timers.set(ticket.channel_id, t);
}

async function createTicketChannel(client, db, interaction, categoryKey) {
  const category = CATEGORIES[categoryKey];
  if (!category) {
    return interaction.reply({ content: '❌ Categoria inválida.', ephemeral: true });
  }

  const settings = db.getSettings(interaction.guildId);

  if (!settings.ticket_category_id) {
    return interaction.reply({
      content: '❌ O sistema de tickets não está configurado ainda. Peça a um admin para usar `/setup`.',
      ephemeral: true,
    });
  }

  const existing = db.getOpenTicketByOpener(interaction.guildId, interaction.user.id);
  if (existing) {
    return interaction.reply({
      content: `❌ Você já tem um ticket aberto: <#${existing.channel_id}>`,
      ephemeral: true,
    });
  }

  await interaction.deferReply({ ephemeral: true });

  const guild = interaction.guild;
  const ticketNumber = db.getNextTicketNumber(interaction.guildId);
  const channelName = createTicketChannelName(category.label, interaction.user.username, ticketNumber);

  let channel;
  try {
    channel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: settings.ticket_category_id,
      topic: `ticket:${categoryKey} opener:${interaction.user.id} number:${ticketNumber}`,
      permissionOverwrites: [
        { id: guild.roles.everyone.id, deny: [PermissionsBitField.Flags.ViewChannel] },
        {
          id: interaction.user.id,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.ReadMessageHistory,
            PermissionsBitField.Flags.AttachFiles,
            PermissionsBitField.Flags.EmbedLinks,
            PermissionsBitField.Flags.AddReactions,
          ],
        },
        settings.staff_role_id
          ? {
              id: settings.staff_role_id,
              allow: [
                PermissionsBitField.Flags.ViewChannel,
                PermissionsBitField.Flags.SendMessages,
                PermissionsBitField.Flags.ReadMessageHistory,
                PermissionsBitField.Flags.AttachFiles,
                PermissionsBitField.Flags.EmbedLinks,
                PermissionsBitField.Flags.AddReactions,
                PermissionsBitField.Flags.ManageMessages,
              ],
            }
          : null,
        {
          id: client.user.id,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.ReadMessageHistory,
            PermissionsBitField.Flags.ManageChannels,
            PermissionsBitField.Flags.ManageMessages,
            PermissionsBitField.Flags.AttachFiles,
            PermissionsBitField.Flags.EmbedLinks,
          ],
        },
      ].filter(Boolean),
    });
  } catch (err) {
    console.error('[createTicketChannel] Erro ao criar canal:', err.message);
    return interaction.editReply({ content: '❌ Não foi possível criar o canal do ticket. Verifique as permissões do bot.' });
  }

  db.createTicket({
    guild_id: interaction.guildId,
    channel_id: channel.id,
    channel_name: channelName,
    opener_id: interaction.user.id,
    category_key: categoryKey,
    created_at: Date.now(),
  });
  db.logAction(interaction.guildId, interaction.user.id, 'ticket_created', `${categoryKey} -> #${String(ticketNumber).padStart(4, '0')} (${channel.id})`);

  const mention = settings.staff_role_id ? `<@${interaction.user.id}> <@&${settings.staff_role_id}>` : `<@${interaction.user.id}>`;
  await channel.send({
    content: mention,
    embeds: [ticketEmbed(categoryKey, interaction.user.id, null, ticketNumber)],
    components: [ticketButtons(channel.id)],
  }).catch(() => null);

  return interaction.editReply({
    embeds: [
      footerize(
        new EmbedBuilder()
          .setColor(category.color)
          .setDescription(`✅ Seu ticket foi criado: <#${channel.id}>`)
      ),
    ],
  });
}

async function claimTicket(client, db, interaction, channelId) {
  const settings = db.getSettings(interaction.guildId);

  if (!hasStaffRole(interaction, settings)) {
    const roleMsg = settings.staff_role_id ? ` (<@&${settings.staff_role_id}>)` : ' (nenhum cargo configurado — use `/setup`)';
    return interaction.reply({
      content: `❌ Somente o cargo de staff${roleMsg} pode assumir tickets.`,
      ephemeral: true,
    });
  }

  const ticket = db.getTicketByChannel(channelId);
  if (!ticket || ticket.status !== 'open') {
    return interaction.reply({ content: '❌ Esse ticket não está mais aberto.', ephemeral: true });
  }
  if (ticket.claimed_by) {
    return interaction.reply({ content: `❌ Este ticket já foi assumido por <@${ticket.claimed_by}>.`, ephemeral: true });
  }

  db.updateTicket(channelId, { claimed_by: interaction.user.id, claimed_at: Date.now() });
  db.logAction(interaction.guildId, interaction.user.id, 'ticket_claimed', channelId);

  const updated = db.getTicketByChannel(channelId);
  scheduleAutoClose(client, db, updated);

  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (channel?.isTextBased()) {
    await channel.send({
      embeds: [ticketEmbed(updated.category_key, updated.opener_id, interaction.user.id, updated.ticket_number)],
      components: [ticketButtons(channel.id)],
    }).catch(() => null);
  }

  return interaction.reply({
    embeds: [
      footerize(
        new EmbedBuilder()
          .setColor(0x38bdf8)
          .setDescription(`✅ Você assumiu o ticket. O canal será fechado por inatividade após **${settings.auto_close_minutes} min** sem resposta.`)
      ),
    ],
    ephemeral: true,
  });
}

async function claimTicketInChannel(client, db, interaction) {
  const ticket = db.getTicketByChannel(interaction.channel.id);
  if (!ticket || ticket.status !== 'open') {
    return interaction.reply({ content: '❌ Este canal não é um ticket aberto.', ephemeral: true });
  }
  return claimTicket(client, db, interaction, interaction.channel.id);
}

async function promptClose(client, db, interaction, channelId) {
  const ticket = db.getTicketByChannel(channelId);
  if (!ticket || ticket.status !== 'open') {
    return interaction.reply({ content: '❌ Esse ticket já foi fechado.', ephemeral: true });
  }
  const settings = db.getSettings(interaction.guildId);
  const isStaff = hasStaffRole(interaction, settings);
  const isOpener = interaction.user.id === ticket.opener_id;
  if (!isStaff && !isOpener) {
    return interaction.reply({ content: '❌ Somente staff ou o criador do ticket podem fechar.', ephemeral: true });
  }
  return interaction.showModal(closeModal(channelId));
}

async function autoCloseTicket(client, db, channelId, reason) {
  const ticket = db.getTicketByChannel(channelId);
  if (!ticket || ticket.status !== 'open') return;

  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (channel?.isTextBased()) {
    await channel.send({
      embeds: [
        footerize(
          new EmbedBuilder()
            .setColor(0xf59e0b)
            .setDescription('⏱️ Este ticket está sendo fechado por inatividade...')
        ),
      ],
    }).catch(() => null);
  }

  await _doClose(client, db, ticket, channel, reason, null);
}

async function confirmCloseTicket(client, db, interaction, channelId, reason) {
  const ticket = db.getTicketByChannel(channelId);
  if (!ticket || ticket.status !== 'open') {
    const reply = { content: '❌ Esse ticket já foi fechado.', ephemeral: true };
    return interaction.replied || interaction.deferred
      ? interaction.followUp(reply)
      : interaction.reply(reply);
  }

  const settings = db.getSettings(interaction.guildId);
  const isStaff = hasStaffRole(interaction, settings);
  const isOpener = interaction.user.id === ticket.opener_id;
  if (!isStaff && !isOpener) {
    return interaction.reply({ content: '❌ Sem permissão para fechar este ticket.', ephemeral: true });
  }

  const closeReason = reason?.trim() || `Fechado por <@${interaction.user.id}>.`;

  const replyPromise = interaction.reply({
    embeds: [footerize(new EmbedBuilder().setColor(0xf59e0b).setDescription('🔒 Fechando o ticket...'))],
    ephemeral: true,
  });

  const channel = await client.channels.fetch(channelId).catch(() => null);
  await _doClose(client, db, ticket, channel, closeReason, interaction.user.id);
  return replyPromise;
}

async function _doClose(client, db, ticket, channel, reason, closedById) {
  if (channel?.isTextBased()) {
    await channel.send({
      embeds: [
        footerize(
          new EmbedBuilder()
            .setColor(0xf59e0b)
            .setDescription(`🔒 **Ticket sendo fechado...**\n📝 Motivo: ${reason || '—'}`)
        ),
      ],
    }).catch(() => null);
  }

  const transcriptPath = channel ? await buildTranscript(channel, ticket).catch(() => null) : null;

  db.closeTicket(ticket.channel_id, {
    closed_at: Date.now(),
    close_reason: reason,
    transcript_path: transcriptPath,
  });
  db.logAction(ticket.guild_id, closedById || ticket.opener_id, 'ticket_closed', `${ticket.channel_id} :: ${reason}`);

  const settings = db.getSettings(ticket.guild_id);
  const logChannel = settings.log_channel_id
    ? await client.channels.fetch(settings.log_channel_id).catch(() => null)
    : null;

  if (logChannel?.isTextBased()) {
    const logMsg = {
      embeds: [closedLogEmbed(ticket, closedById ? `<@${closedById}>` : 'auto-close', reason)],
    };
    if (settings.transcripts_enabled && transcriptPath) {
      logMsg.files = [transcriptPath];
    }
    await logChannel.send(logMsg).catch(() => null);
  }

  const opener = await client.users.fetch(ticket.opener_id).catch(() => null);
  if (opener) {
    setTimeout(() => {
      opener.send({
        embeds: [
          footerize(
            new EmbedBuilder()
              .setColor(0x22c55e)
              .setTitle('⭐ Avalie o atendimento!')
              .setDescription('Seu ticket foi encerrado. Como foi o atendimento?\nSelecione de **1 a 5 estrelas**:')
          ),
        ],
        components: ratingButtons(ticket.channel_id),
      }).catch(() => null);
    }, 3000);
  }

  clearTimer(ticket.channel_id);
  setTimeout(() => {
    channel?.delete('Ticket encerrado.').catch(() => null);
  }, 5000);
}

async function handleRating(client, db, interaction, ticketId, rating) {
  const ticket = db.getTicketByChannel(ticketId);
  if (!ticket) return interaction.reply({ content: '❌ Ticket não encontrado.', ephemeral: true });
  if (interaction.user.id !== ticket.opener_id) {
    return interaction.reply({ content: '❌ Somente quem abriu o ticket pode avaliá-lo.', ephemeral: true });
  }
  if (ticket.rating != null) {
    return interaction.reply({ content: '❌ Você já avaliou este ticket.', ephemeral: true });
  }

  db.updateTicket(ticketId, { rating });
  db.logAction(ticket.guild_id, interaction.user.id, 'ticket_rated', `${ticketId} => ${rating}⭐`);

  const settings = db.getSettings(ticket.guild_id);
  const logChannel = settings.log_channel_id
    ? await client.channels.fetch(settings.log_channel_id).catch(() => null)
    : null;
  if (logChannel?.isTextBased()) {
    await logChannel.send({
      embeds: [
        footerize(
          new EmbedBuilder()
            .setColor(0x22c55e)
            .setTitle('⭐ Avaliação recebida')
            .addFields(
              { name: '👤 Usuário', value: `<@${ticket.opener_id}>`, inline: true },
              { name: '🫡 Atendente', value: ticket.claimed_by ? `<@${ticket.claimed_by}>` : '*não assumido*', inline: true },
              { name: '⭐ Nota', value: `**${rating} ⭐**`, inline: true },
            )
        ),
      ],
    }).catch(() => null);
  }

  return interaction.update({
    embeds: [
      footerize(
        new EmbedBuilder().setColor(0x22c55e).setDescription(`✅ Avaliação registrada: **${rating} ⭐** — Obrigado pelo feedback!`)
      ),
    ],
    components: [],
  });
}

async function handleAddUser(client, db, interaction) {
  const ticket = db.getTicketByChannel(interaction.channel.id);
  if (!ticket || ticket.status !== 'open') {
    return interaction.reply({ content: '❌ Use este comando dentro de um ticket aberto.', ephemeral: true });
  }
  const settings = db.getSettings(interaction.guildId);
  if (!hasStaffRole(interaction, settings)) {
    return interaction.reply({ content: '❌ Somente staff pode adicionar membros.', ephemeral: true });
  }
  const target = interaction.options.getUser('membro');
  await interaction.channel.permissionOverwrites.edit(target.id, {
    ViewChannel: true,
    SendMessages: true,
    ReadMessageHistory: true,
    AttachFiles: true,
    EmbedLinks: true,
  }).catch(() => null);
  db.logAction(interaction.guildId, interaction.user.id, 'ticket_member_added', `${target.id} -> ${interaction.channel.id}`);
  return interaction.reply({
    embeds: [footerize(new EmbedBuilder().setColor(0x22c55e).setDescription(`✅ <@${target.id}> adicionado ao ticket.`))],
  });
}

async function handleRemoveUser(client, db, interaction) {
  const ticket = db.getTicketByChannel(interaction.channel.id);
  if (!ticket || ticket.status !== 'open') {
    return interaction.reply({ content: '❌ Use este comando dentro de um ticket aberto.', ephemeral: true });
  }
  const settings = db.getSettings(interaction.guildId);
  if (!hasStaffRole(interaction, settings)) {
    return interaction.reply({ content: '❌ Somente staff pode remover membros.', ephemeral: true });
  }
  const target = interaction.options.getUser('membro');
  if (target.id === ticket.opener_id) {
    return interaction.reply({ content: '❌ Não é possível remover o criador do ticket.', ephemeral: true });
  }
  await interaction.channel.permissionOverwrites.delete(target.id).catch(() => null);
  db.logAction(interaction.guildId, interaction.user.id, 'ticket_member_removed', `${target.id} <- ${interaction.channel.id}`);
  return interaction.reply({
    embeds: [footerize(new EmbedBuilder().setColor(0xf59e0b).setDescription(`✅ <@${target.id}> removido do ticket.`))],
  });
}

async function handleRenameTicket(client, db, interaction) {
  const ticket = db.getTicketByChannel(interaction.channel.id);
  if (!ticket || ticket.status !== 'open') {
    return interaction.reply({ content: '❌ Use este comando dentro de um ticket aberto.', ephemeral: true });
  }
  const settings = db.getSettings(interaction.guildId);
  const isStaff = hasStaffRole(interaction, settings);
  const isOpener = interaction.user.id === ticket.opener_id;
  if (!isStaff && !isOpener) {
    return interaction.reply({ content: '❌ Sem permissão para renomear.', ephemeral: true });
  }
  const rawName = interaction.options.getString('nome');
  const newName = sanitizeChannelName(rawName);
  if (!newName) return interaction.reply({ content: '❌ Nome inválido.', ephemeral: true });
  await interaction.channel.setName(newName).catch(() => null);
  db.updateTicket(interaction.channel.id, { channel_name: newName });
  db.logAction(interaction.guildId, interaction.user.id, 'ticket_renamed', `${interaction.channel.id} -> ${newName}`);
  return interaction.reply({
    embeds: [footerize(new EmbedBuilder().setColor(0x38bdf8).setDescription(`✅ Ticket renomeado para \`${newName}\`.`))],
    ephemeral: true,
  });
}

async function handleCloseSlash(client, db, interaction) {
  const ticket = db.getTicketByChannel(interaction.channel.id);
  if (!ticket || ticket.status !== 'open') {
    return interaction.reply({ content: '❌ Use este comando dentro de um ticket aberto.', ephemeral: true });
  }
  const settings = db.getSettings(interaction.guildId);
  const isStaff = hasStaffRole(interaction, settings);
  const isOpener = interaction.user.id === ticket.opener_id;
  if (!isStaff && !isOpener) {
    return interaction.reply({ content: '❌ Sem permissão para fechar este ticket.', ephemeral: true });
  }
  const reason = interaction.options.getString('motivo')?.trim() || `Fechado por <@${interaction.user.id}>.`;
  return interaction.reply({
    embeds: [footerize(new EmbedBuilder().setColor(0xf59e0b).setDescription(`🔒 Fechar ticket?\n📝 **Motivo:** ${reason}`))],
    components: [closeButtons(interaction.channel.id)],
    ephemeral: true,
  });
}

async function handleConfigButton(client, db, interaction, action) {
  const settings = db.getSettings(interaction.guildId);
  if (!isAdminFromInteraction(interaction, settings)) {
    return interaction.reply({ content: '❌ Você não tem permissão para isso.', ephemeral: true });
  }

  if (action === 'toggle_transcripts') {
    const next = db.upsertSettings(interaction.guildId, { transcripts_enabled: settings.transcripts_enabled ? 0 : 1 });
    return interaction.reply({ embeds: [configEmbed(next)], components: configButtons(), ephemeral: true });
  }

  if (action === 'refresh_panel') {
    await refreshPanelForGuild(client, db, interaction.guildId);
    return interaction.reply({ content: '✅ Painel recriado com sucesso.', ephemeral: true });
  }

  const map = {
    set_panel_channel:    ['config_modal:panel_channel_id',    'Canal do Painel',         'ID do canal do painel',     'ex: 1234567890123456789'],
    set_ticket_category:  ['config_modal:ticket_category_id',  'Categoria dos Tickets',   'ID da categoria (pasta)',    'ex: 1234567890123456789'],
    set_staff_role:       ['config_modal:staff_role_id',       'Cargo Staff',             'ID do cargo de staff',      'ex: 1234567890123456789'],
    set_log_channel:      ['config_modal:log_channel_id',      'Canal de Logs',           'ID do canal de logs',       'ex: 1234567890123456789'],
    set_auto_close:       ['config_modal:auto_close_minutes',  'Auto Close (minutos)',    'Minutos de inatividade',    '35'],
  };

  const entry = map[action];
  if (!entry) return;
  const [customId, title, label, placeholder] = entry;
  return interaction.showModal(modalValue(customId, title, label, placeholder));
}

async function handleConfigModal(db, interaction, customId) {
  const settings = db.getSettings(interaction.guildId);
  if (!isAdminFromInteraction(interaction, settings)) {
    return interaction.reply({ content: '❌ Você não tem permissão para isso.', ephemeral: true });
  }

  const value = interaction.fields.getTextInputValue('value')?.trim();

  const fieldMap = {
    'config_modal:panel_channel_id':   { panel_channel_id: value },
    'config_modal:ticket_category_id': { ticket_category_id: value },
    'config_modal:staff_role_id':      { staff_role_id: value },
    'config_modal:log_channel_id':     { log_channel_id: value },
    'config_modal:auto_close_minutes': { auto_close_minutes: Math.max(1, Number(value) || 35) },
  };

  const patch = fieldMap[customId];
  if (!patch) return;
  const next = db.upsertSettings(interaction.guildId, patch);
  return interaction.reply({ embeds: [configEmbed(next)], components: configButtons(), ephemeral: true });
}

async function handleMessageForTicket(db, message) {
  if (!message.guild || message.author.bot) return;
  const ticket = db.getTicketByChannel(message.channel.id);
  if (!ticket || ticket.status !== 'open') return;
  if (!ticket.claimed_by) return;

  db.updateTicket(ticket.channel_id, { last_activity_at: Date.now() });

  if (message.author.id === ticket.opener_id) {
    clearTimer(ticket.channel_id);
    const freshTicket = db.getTicketByChannel(ticket.channel_id);
    scheduleAutoClose(message.client, db, freshTicket, true);
  }
}

async function restoreTimers(client, db, guild) {
  const tickets = db.listTickets(guild.id, 'open', 1000);
  for (const ticket of tickets) {
    if (ticket.claimed_by) {
      scheduleAutoClose(client, db, ticket, false);
    }
  }
}

module.exports = {
  createTicketChannel,
  claimTicket,
  claimTicketInChannel,
  promptClose,
  confirmCloseTicket,
  handleRating,
  handleAddUser,
  handleRemoveUser,
  handleRenameTicket,
  handleCloseSlash,
  handleConfigButton,
  handleConfigModal,
  handleMessageForTicket,
  restoreTimers,
  scheduleAutoClose,
  autoCloseTicket,
  clearTimer,
};
