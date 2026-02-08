const { Events } = require('discord.js');

module.exports = {
    name: Events.GuildMemberAdd,
    async execute(member, { database, rankSyncService, configManager }) {
        try {
            const serverConfig = configManager.getServerConfig(member.guild.id);
            
            // Check if server is configured and sync on join is enabled
            if (!serverConfig || !serverConfig.syncSettings.syncOnJoin) {
                return;
            }

            // Check if user is verified
            const verification = database.getVerification(member.user.id);
            if (!verification) {
                return; // User not verified, nothing to sync
            }

            console.log(`[GuildMemberAdd] Syncing verified user ${member.user.tag} in ${member.guild.name}`);

            // Sync the user
            const result = await rankSyncService.syncUserInGuild(
                member.client,
                member.guild.id,
                member.user.id
            );

            if (result.success) {
                console.log(`[GuildMemberAdd] Successfully synced ${member.user.tag} - Rank: ${result.rank}`);
            } else {
                console.error(`[GuildMemberAdd] Failed to sync ${member.user.tag}: ${result.error}`);
            }
        } catch (error) {
            console.error('[GuildMemberAdd] Error:', error);
        }
    }
};
