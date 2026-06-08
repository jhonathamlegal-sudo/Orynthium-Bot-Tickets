const { EmbedBuilder } = require('discord.js');
const { CATEGORIES } = require('../config/constants');
const { confirmEmbed, configEmbed, statsEmbed, footerize } = require('../utils/embeds');
const { confirmButtons, configButtons } = require('../utils/ui');
const { isAdminFromInteraction } = require('../utils/permissions');
const {
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
} = require('../services/tickets');
const { refreshPanelForGuild } = require('../services/panel');

async function handleInteraction(client, db, interaction) {

  // Avaliação via DM — deve ser tratada ANTES do guard de servidor
  if (interaction.isButton()) {
    const parts = interaction.customId.split(':');
    if (parts[0] === 'ticket_rate') {
      return handleRating(client, db, interaction, parts[1], Number(parts[2]));
    }
  }

  // Guard: comandos do servidor só funcionam dentro de um servidor
  if (!interaction.guildId) {
  // ✅ Defer imediato para evitar Unknown Interaction

  if (!interaction.deferred && !interaction.replied && 

      (interaction.isButton() || interaction.isStringSelectMenu() || interaction.isChatInputCommand())) {

    await interaction.deferReply({ ephemeral: true }).catch(() => {});

  }
    if (interaction.isRepliable()) {
      interaction.reply({ content: '❌ Este bot só funciona dentro de servidores.', ephemeral: true }).catch(() => null);
    }
    return;
  }

  // ── Slash Commands ──────────────────────────────────────────────────────────
  if (interaction.isChatInputCommand()) {
    const { commandName } = interaction;

    if (commandName === 'setup') {
      const settings = db.ensureGuild(interaction.guildId);
      if (!isAdminFromInteraction(interaction, settings)) {
        return interaction.reply({
          content: `❌ Apenas membros com o cargo de staff${settings.staff_role_id ? ` (<@&${settings.staff_role_id}>)` : ''} ou administradores podem usar este comando.`,
          ephemeral: true,
        });
      }
      return interaction.reply({ embeds: [configEmbed(settings)], components: configButtons(), ephemeral: true });
    }

    if (commandName === 'stats') {
      const stats = db.stats(interaction.guildId);
      return interaction.reply({ embeds: [statsEmbed(stats)], ephemeral: false });
    }

    if (commandName === 'painel') {
      const settings = db.getSettings(interaction.guildId);
      if (!isAdminFromInteraction(interaction, settings)) {
        return interaction.reply({
          content: `❌ Apenas membros com o cargo de staff${settings.staff_role_id ? ` (<@&${settings.staff_role_id}>)` : ''} ou administradores podem usar este comando.`,
          ephemeral: true,
        });
      }
      if (!settings.panel_channel_id) {
        return interaction.reply({ content: '❌ Canal do painel não configurado. Use `/setup` primeiro.', ephemeral: true });
      }
      await interaction.deferReply({ ephemeral: true });
      await refreshPanelForGuild(client, db, interaction.guildId);
      return interaction.editReply({ content: '✅ Painel recriado com sucesso.' });
    }

    if (commandName === 'add')     return handleAddUser(client, db, interaction);
    if (commandName === 'remove')  return handleRemoveUser(client, db, interaction);
    if (commandName === 'rename')  return handleRenameTicket(client, db, interaction);
    if (commandName === 'fechar')  return handleCloseSlash(client, db, interaction);
    if (commandName === 'assumir') return claimTicketInChannel(client, db, interaction);
  }

  // ── Select Menu (painel de categorias) ─────────────────────────────────────
  if (interaction.isStringSelectMenu()) {
    if (interaction.customId === 'ticket_category_select') {
      const categoryKey = interaction.values[0];
      if (!CATEGORIES[categoryKey]) {
        return interaction.reply({ content: '❌ Categoria inválida.', ephemeral: true });
      }
      return interaction.reply({
        embeds: [confirmEmbed(categoryKey)],
        components: [confirmButtons(categoryKey)],
        ephemeral: true,
      });
    }
  }

  // ── Buttons ─────────────────────────────────────────────────────────────────
  if (interaction.isButton()) {
    const parts = interaction.customId.split(':');
    const [head, a, b] = parts;

    if (head === 'ticket_cancel') {
      return interaction.reply({
        embeds: [footerize(new EmbedBuilder().setColor(0x64748b).setDescription('❌ Ação cancelada.'))],
        ephemeral: true,
      });
    }

    if (head === 'ticket_confirm') return createTicketChannel(client, db, interaction, a);
    if (head === 'ticket_claim')   return claimTicket(client, db, interaction, a);
    if (head === 'ticket_close')   return promptClose(client, db, interaction, a);

    if (head === 'ticket_close_cancel') {
      return interaction.reply({
        embeds: [footerize(new EmbedBuilder().setColor(0x64748b).setDescription('❌ Fechamento cancelado.'))],
        ephemeral: true,
      });
    }

    if (head === 'ticket_close_confirm') {
      return confirmCloseTicket(client, db, interaction, a);
    }

    if (head === 'ticket_rate') return handleRating(client, db, interaction, a, Number(b));
    if (head === 'config')      return handleConfigButton(client, db, interaction, a);
  }

  // ── Modal Submits ────────────────────────────────────────────────────────────
  if (interaction.isModalSubmit()) {
    const { customId } = interaction;

    if (customId.startsWith('config_modal:')) {
      return handleConfigModal(db, interaction, customId);
    }

    if (customId.startsWith('close_modal:')) {
      const channelId = customId.slice('close_modal:'.length);
      const reason = interaction.fields.getTextInputValue('reason')?.trim() || null;
      return confirmCloseTicket(client, db, interaction, channelId, reason);
    }
  }
}

module.exports = { handleInteraction };
