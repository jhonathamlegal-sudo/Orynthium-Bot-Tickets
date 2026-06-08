const fs = require('fs');
const path = require('path');
const { AttachmentBuilder } = require('discord.js');
const { panelEmbed } = require('../utils/embeds');
const { panelSelectMenu } = require('../utils/ui');

function bannerAttachment() {
  const p = path.join(process.cwd(), 'assets', 'banner.png');
  if (!fs.existsSync(p)) return null;
  return new AttachmentBuilder(fs.readFileSync(p), { name: 'banner.png' });
}

async function clearOldPanelMessages(channel, settings) {
  const { panel_message_id, banner_message_id } = settings || {};

  const toDelete = [];

  if (banner_message_id) {
    const old = await channel.messages.fetch(banner_message_id).catch(() => null);
    if (old) toDelete.push(old.delete().catch(() => null));
  }

  if (panel_message_id) {
    const old = await channel.messages.fetch(panel_message_id).catch(() => null);
    if (old) toDelete.push(old.delete().catch(() => null));
  }

  const messages = await channel.messages.fetch({ limit: 50 }).catch(() => null);
  if (messages) {
    for (const [, msg] of messages) {
      if (!msg.author?.bot) continue;
      const isPanel =
        (msg.embeds || []).some(
          (e) =>
            (e.title || '').includes('Orynthium Atrium: Tickets') ||
            (e.description || '').includes('Selecione a categoria') ||
            (e.description || '').includes('menu abaixo')
        );
      if (isPanel) toDelete.push(msg.delete().catch(() => null));
    }
  }

  await Promise.allSettled(toDelete);
}

async function postPanel(channel, settings, db) {
  await clearOldPanelMessages(channel, settings);

  const banner = bannerAttachment();
  const embed = panelEmbed();
  const files = banner ? [banner] : [];

  const sent = await channel.send({
    embeds: [embed],
    components: [panelSelectMenu()],
    files,
  });

  db.setPanelMessageId(settings.guild_id, sent.id);
  db.setBannerMessageId(settings.guild_id, null);

  return sent;
}

async function refreshPanelForGuild(client, db, guildId) {
  const settings = db.getSettings(guildId);
  if (!settings.panel_channel_id) return null;
  const channel = await client.channels.fetch(settings.panel_channel_id).catch(() => null);
  if (!channel?.isTextBased()) return null;
  return postPanel(channel, settings, db);
}

function scheduleDailyPanelRefresh(client, db) {
  const run = async () => {
    for (const guild of client.guilds.cache.values()) {
      await refreshPanelForGuild(client, db, guild.id).catch(() => null);
    }
  };

  const scheduleNext = () => {
    const now = new Date();
    const next = new Date(now);
    next.setHours(24, 0, 0, 0);
    const delay = next.getTime() - now.getTime();
    setTimeout(() => {
      run().catch(() => null);
      setInterval(() => run().catch(() => null), 24 * 60 * 60 * 1000);
    }, delay);
  };

  run().catch(() => null);
  scheduleNext();
}

module.exports = { refreshPanelForGuild, scheduleDailyPanelRefresh, clearOldPanelMessages };
