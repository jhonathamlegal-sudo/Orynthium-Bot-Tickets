require('dotenv').config();
const path = require('path');
const { Client, GatewayIntentBits, Partials } = require('discord.js');
const { CyberDB } = require('./db/db');
const { onReady } = require('./events/ready');
const { handlePrefixMessage } = require('./events/messageCreate');
const { handleInteraction } = require('./events/interactionCreate');
const { handleMessageForTicket } = require('./services/tickets');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel],
});

const db = new CyberDB(path.join(__dirname, '..', 'database', 'cyber_tickets.db'));

client.once('clientReady', async () => {
  await onReady(client, db);
});

client.on('guildCreate', (guild) => {
  db.ensureGuild(guild.id);
  console.log(`[guildCreate] Entrei em: ${guild.name} (${guild.id})`);
});

client.on('messageCreate', async (message) => {
  await handlePrefixMessage(client, db, message).catch((err) => console.error('[messageCreate]', err));
  await handleMessageForTicket(db, message).catch((err) => console.error('[ticketMessage]', err));
});

client.on('interactionCreate', async (interaction) => {
  await handleInteraction(client, db, interaction).catch((err) => {
    console.error('[interactionCreate]', err);
    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
      interaction.reply({ content: '❌ Ocorreu um erro ao processar essa ação.', ephemeral: true }).catch(() => null);
    }
  });
});

process.on('unhandledRejection', (err) => console.error('[unhandledRejection]', err));
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
});

client.login(process.env.DISCORD_TOKEN);
