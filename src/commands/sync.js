const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('sync')
        .setDescription('Manually sync your Roblox rank and roles'),

    async execute(interaction, { database, robloxService, rankSyncService, configManager }) {
        await interaction.deferReply({ flags: 64 }); // 64 = ephemeral flag

        try {
            // Check if server is configured
            if (!configManager.hasServerConfig(interaction.guildId)) {
                return interaction.editReply({
                    content: '❌ This server is not configured for rank syncing. Please contact an administrator.'
                });
            }

            // Check if user is verified
            const verification = database.getVerification(interaction.user.id);
            if (!verification) {
                return interaction.editReply({
                    content: '❌ You are not verified. Use `/verify <username>` to link your Roblox account first.'
                });
            }

            // Sync user
            const syncResult = await rankSyncService.syncUserInGuild(
                interaction.client,
                interaction.guildId,
                interaction.user.id
            );

            if (!syncResult.success) {
                return interaction.editReply({
                    content: `❌ Failed to sync: ${syncResult.error}`
                });
            }

            // Create success embed
            const embed = new EmbedBuilder()
                .setColor(0x00ff00)
                .setTitle('✅ Sync Successful')
                .setDescription(`Synced roles and nickname for **${verification.roblox_username}**`)
                .addFields(
                    {
                        name: 'Current Rank',
                        value: `${syncResult.rank} - ${syncResult.roleName}`,
                        inline: true
                    }
                )
                .setTimestamp();

            if (syncResult.rankChanged) {
                embed.addFields({
                    name: 'Rank Changed',
                    value: `${syncResult.previousRank} → ${syncResult.rank}`,
                    inline: true
                });
            }

            if (syncResult.rolesUpdated) {
                embed.addFields({
                    name: 'Roles',
                    value: '✓ Updated',
                    inline: true
                });
            }

            if (syncResult.nicknameUpdated) {
                embed.addFields({
                    name: 'Nickname',
                    value: '✓ Updated',
                    inline: true
                });
            }

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('[Sync Command] Error:', error);
            await interaction.editReply({
                content: '❌ An error occurred during sync. Please try again later.'
            });
        }
    }
};