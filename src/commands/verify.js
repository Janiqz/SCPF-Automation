const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('verify')
        .setDescription('Verify using the Roblox account linked to your Foundation portal'),

    async execute(interaction, { database, rankSyncService, configManager, portalIdentities }) {
        await interaction.deferReply({ flags: 64 }); // 64 = ephemeral flag

        try {
            // Check if server is configured
            if (!configManager.hasServerConfig(interaction.guildId)) {
                return interaction.editReply({
                    content: '❌ This server is not configured for rank syncing. Please contact an administrator.'
                });
            }

            const identity = await portalIdentities.find(interaction.user.id);
            if (!identity) return interaction.editReply({ content: '❌ Link and verify your Roblox account first at https://janiqzscpf.info/account, then run `/verify` again.' });
            database.setVerification(interaction.user.id, identity.roblox_user_id, identity.roblox_username);
            const sync = await rankSyncService.syncUserInGuild(interaction.client, interaction.guildId, interaction.user.id);
            if (!sync.success) return interaction.editReply({ content: `❌ Your portal link was imported, but role sync failed: ${sync.error}` });
            return interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x00ff00).setTitle('✅ Portal Verification Complete').setDescription(`Verified as **${identity.roblox_username}**. Your existing nickname and role sync has been applied.`).setTimestamp()] });

        } catch (error) {
            console.error('[Verify Command] Error:', error);
            await interaction.editReply({
                content: '❌ An error occurred during verification. Please try again later.'
            });
        }
    }
};
