const { REST, Routes, SlashCommandBuilder } = require('discord.js');
const { createDashboardServer } = require('../services/dashboard');
const { scheduleDailyPanelRefresh } = require('../services/panel');
const { restoreTimers } = require('../services/tickets');

const slashCommands = [
  new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Configurar o sistema de tickets'),

  new SlashCommandBuilder()
    .setName('stats')
    .setDescription('Ver estatísticas de tickets do servidor'),

  new SlashCommandBuilder()
    .setName('painel')
    .setDescription('Recriar o painel de tickets no canal configurado'),

  new SlashCommandBuilder()
    .setName('add')
    .setDescription('Adicionar um membro ao ticket atual')
    .addUserOption((opt) =>
      opt.setName('membro').setDescription('Membro a adicionar').setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('remove')
    .setDescription('Remover um membro do ticket atual')
    .addUserOption((opt) =>
      opt.setName('membro').setDescription('Membro a remover').setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('rename')
    .setDescription('Renomear o ticket atual')
    .addStringOption((opt) =>
      opt.setName('nome').setDescription('Novo nome do ticket').setRequired(true).setMaxLength(90)
    ),

  new SlashCommandBuilder()
    .setName('fechar')
    .setDescription('Fechar o ticket atual')
    .addStringOption((opt) =>
      opt.setName('motivo').setDescription('Motivo do fechamento (opcional)').setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName('assumir')
    .setDescription('Assumir o ticket atual (staff)'),
].map((cmd) => cmd.toJSON());

let dashboardStarted = false;

async function onReady(client, db) {
  for (const guild of client.guilds.cache.values()) {
    db.ensureGuild(guild.id);
    await restoreTimers(client, db, guild).catch(() => null);
  }

  scheduleDailyPanelRefresh(client, db);

  if (!dashboardStarted) {
    createDashboardServer(db, client);
    dashboardStarted = true;
  }

  const appId = client.application?.id;
  if (appId) {
    const rest = new REST().setToken(process.env.DISCORD_TOKEN);
    try {
      await rest.put(Routes.applicationCommands(appId), { body: slashCommands });
      console.log('[SLASH] Comandos slash registrados com sucesso.');
    } catch (err) {
      console.error('[SLASH] Erro ao registrar comandos:', err.message);
    }
  } else {
    console.warn('[SLASH] application.id indisponível — slash commands não registrados.');
  }

  console.log(`[READY] ${client.user.tag} online em ${client.guilds.cache.size} servidor(es).`);
}

module.exports = { onReady };
