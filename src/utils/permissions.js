function getMemberRoleIds(member) {
  if (!member) return [];
  if (member.roles?.cache) return [...member.roles.cache.keys()];
  if (Array.isArray(member.roles)) return member.roles;
  return [];
}

function isAdminFromInteraction(interaction, settings) {
  if (!interaction.guildId) return false;
  const perms = interaction.memberPermissions;
  if (!perms) return false;
  if (interaction.user.id === interaction.guild?.ownerId) return true;
  if (perms.has('Administrator')) return true;
  if (settings.staff_role_id) {
    if (getMemberRoleIds(interaction.member).includes(settings.staff_role_id)) return true;
  }
  if (!settings.staff_role_id && perms.has('ManageGuild')) return true;
  return false;
}

function hasStaffRole(interaction, settings) {
  if (!settings.staff_role_id) return false;
  return getMemberRoleIds(interaction.member).includes(settings.staff_role_id);
}

module.exports = { getMemberRoleIds, isAdminFromInteraction, hasStaffRole };
