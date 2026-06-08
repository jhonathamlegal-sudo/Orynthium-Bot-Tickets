const { EmbedBuilder } = require('discord.js');
const { footerize, configEmbed, statsEmbed } = require('../utils/embeds');
const { configButtons } = require('../utils/ui');
const { refreshPanelForGuild } = require('../services/panel');
const { getMemberRoleIds } = require('../utils/permissions');

async function handlePrefixMessage(client, db, message) {
  if (!message.guild || message.author.bot) return;
  const prefix = process.env.BOT_PREFIX || '!';
  if (!message.content.startsWith(prefix)) return;

  const [command, sub1, ...rest] = message.content.slice(prefix.length).trim().split(/\s+/);
  const cmd = command.toLowerCase();
  const sub = (sub1 || '').toLowerCase();

  const settings = db.getSettings(message.guild.id);

  async function isAuthorized() {
    const member = await message.guild.members.fetch(message.author.id).catch(() => null);
    if (!member) return false;
    if (message.author.id === message.guild.ownerId) return true;
    if (member.permissions.has('Administrator')) return true;
    if (settings.staff_role_id && getMemberRoleIds(member).includes(settings.staff_role_id)) return true;
    if (!settings.staff_role_id && member.permissions.has('ManageGuild')) return true;
    return false;
  }

  if (cmd === 'painel' && sub === 'tickets') {
    if (!(await isAuthorized())) {
      return message.reply('❌ Você não tem permissão para usar este comando.').catch(() => null);
    }
    if (!settings.panel_channel_id) {
      return message.reply('❌ Canal do painel não configurado. Use `!tickets config` para configurar.').catch(() => null);
    }
    await refreshPanelForGuild(client, db, message.guild.id);
    return message.reply({ content: '✅ Painel atualizado.' })
      .then((m) => setTimeout(() => m.delete().catch(() => null), 5000))
      .catch(() => null);
  }

  if (cmd === 'tickets') {
    if (sub === 'config') {
      if (!(await isAuthorized())) {
        return message.reply('❌ Você não tem permissão para configurar o bot.').catch(() => null);
      }
      return message.reply({ embeds: [configEmbed(settings)], components: configButtons() });
    }

    if (sub === 'stats') {
      const stats = db.stats(message.guild.id);
      return message.reply({ embeds: [statsEmbed(stats)] });
    }

    if (sub === 'dashboard') {
      const port = process.env.DASHBOARD_PORT || 3000;
      return message.reply({
        embeds: [
          footerize(
            new EmbedBuilder()
              .setColor(0x0ea5e9)
              .setTitle('🖥️ Dashboard')
              .setDescription(`O dashboard web está rodando na porta **${port}**.\nAcesse pelo navegador no mesmo servidor que o bot.`)
          ),
        ],
      });
    }

    if (sub === 'help' || sub === '') {
      return message.reply({
        embeds: [
          footerize(
            new EmbedBuilder()
              .setColor(0x334155)
              .setTitle('📋 Comandos de Texto')
              .setDescription(
                [
                  `\`${prefix}painel tickets\` — Recriar o painel de tickets`,
                  `\`${prefix}tickets config\` — Painel de configuração`,
                  `\`${prefix}tickets stats\` — Estatísticas do servidor`,
                  `\`${prefix}tickets dashboard\` — Info do dashboard`,
                  `\`${prefix}tickets help\` — Esta mensagem`,
                  '',
                  '💡 **Slash commands disponíveis:** `/setup`, `/stats`, `/painel`, `/add`, `/remove`, `/rename`, `/fechar`, `/assumir`',
                ].join('\n')
              )
          ),
        ],
      });
    }
  }
}

module.exports = { handlePrefixMessage };
