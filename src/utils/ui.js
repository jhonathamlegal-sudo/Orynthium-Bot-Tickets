const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} = require('discord.js');
const { CATEGORIES } = require('../config/constants');

function panelSelectMenu() {
  const menu = new StringSelectMenuBuilder()
    .setCustomId('ticket_category_select')
    .setPlaceholder('📂 Selecione a categoria do seu ticket...')
    .addOptions(
      Object.entries(CATEGORIES).map(([key, cat]) =>
        new StringSelectMenuOptionBuilder()
          .setValue(key)
          .setLabel(cat.label)
          .setDescription(cat.description)
          .setEmoji(cat.emoji)
      )
    );
  return new ActionRowBuilder().addComponents(menu);
}

function confirmButtons(categoryKey) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`ticket_confirm:${categoryKey}`)
      .setLabel('✅ Confirmar')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`ticket_cancel:${categoryKey}`)
      .setLabel('❌ Cancelar')
      .setStyle(ButtonStyle.Secondary),
  );
}

function ticketButtons(channelId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`ticket_claim:${channelId}`)
      .setLabel('🫡 Assumir Ticket')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`ticket_close:${channelId}`)
      .setLabel('🔒 Fechar Ticket')
      .setStyle(ButtonStyle.Danger),
  );
}

function closeButtons(channelId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`ticket_close_confirm:${channelId}`)
      .setLabel('✅ Confirmar')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`ticket_close_cancel:${channelId}`)
      .setLabel('❌ Cancelar')
      .setStyle(ButtonStyle.Secondary),
  );
}

function ratingButtons(ticketId) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`ticket_rate:${ticketId}:1`).setLabel('1 ⭐').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`ticket_rate:${ticketId}:2`).setLabel('2 ⭐').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`ticket_rate:${ticketId}:3`).setLabel('3 ⭐').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`ticket_rate:${ticketId}:4`).setLabel('4 ⭐').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`ticket_rate:${ticketId}:5`).setLabel('5 ⭐').setStyle(ButtonStyle.Success),
    ),
  ];
}

function configButtons() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('config:set_panel_channel').setLabel('📢 Canal do Painel').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('config:set_ticket_category').setLabel('📁 Categoria').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('config:set_staff_role').setLabel('🛡️ Cargo Staff').setStyle(ButtonStyle.Secondary),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('config:set_log_channel').setLabel('📋 Canal de Logs').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('config:set_auto_close').setLabel('⏱️ Auto Close').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('config:toggle_transcripts').setLabel('📄 Transcripts').setStyle(ButtonStyle.Danger),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('config:refresh_panel').setLabel('🔄 Recriar Painel').setStyle(ButtonStyle.Success),
    ),
  ];
}

function modalValue(customId, title, label, placeholder) {
  const modal = new ModalBuilder().setCustomId(customId).setTitle(title);
  const input = new TextInputBuilder()
    .setCustomId('value')
    .setLabel(label)
    .setPlaceholder(placeholder)
    .setRequired(true)
    .setStyle(TextInputStyle.Short)
    .setMaxLength(128);
  modal.addComponents(new ActionRowBuilder().addComponents(input));
  return modal;
}

function closeModal(channelId) {
  const modal = new ModalBuilder()
    .setCustomId(`close_modal:${channelId}`)
    .setTitle('Fechar Ticket');
  const input = new TextInputBuilder()
    .setCustomId('reason')
    .setLabel('Motivo do fechamento (opcional)')
    .setPlaceholder('Ex: Problema resolvido, atendimento concluído...')
    .setRequired(false)
    .setStyle(TextInputStyle.Paragraph)
    .setMaxLength(512);
  modal.addComponents(new ActionRowBuilder().addComponents(input));
  return modal;
}

module.exports = {
  panelSelectMenu,
  confirmButtons,
  ticketButtons,
  closeButtons,
  ratingButtons,
  configButtons,
  modalValue,
  closeModal,
};
