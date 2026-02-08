const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('forcesync')
        .setDescription('Force sync all verified users in this server (Admin only)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction, { database, rankSyncService, configManager }) {
        await interaction.deferReply({ flags: 64 }); // 64 = ephemeral flag

        try {
            // Check if server is configured
            if (!configManager.hasServerConfig(interaction.guildId)) {
                return interaction.editReply({
                    content: '❌ This server is not configured for rank syncing. Please contact a bot administrator.'
                });
            }

            await interaction.editReply({
                content: '⏳ Starting force sync... This may take a while depending on the number of verified users.'
            });

            // Run sync
            const result = await rankSyncService.syncAllInGuild(interaction.client, interaction.guildId);

            if (!result.success) {
                return interaction.editReply({
                    content: `❌ Sync failed: ${result.error}`
                });
            }

            // Create results embed
            const embed = new EmbedBuilder()
                .setColor(0x00ff00)
                .setTitle('✅ Force Sync Completed')
                .addFields(
                    {
                        name: 'Total Users',
                        value: result.results.total.toString(),
                        inline: true
                    },
                    {
                        name: 'Successfully Synced',
                        value: result.results.synced.toString(),
                        inline: true
                    },
                    {
                        name: 'Failed',
                        value: result.results.failed.toString(),
                        inline: true
                    }
                )
                .setTimestamp();

            if (result.results.errors.length > 0 && result.results.errors.length <= 5) {
                const errorText = result.results.errors
                    .map(e => `<@${e.userId}>: ${e.error}`)
                    .join('\n');
                
                embed.addFields({
                    name: 'Errors',
                    value: errorText,
                    inline: false
                });
            } else if (result.results.errors.length > 5) {
                embed.addFields({
                    name: 'Errors',
                    value: `${result.results.errors.length} errors occurred. Check bot logs for details.`,
                    inline: false
                });
            }

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('[ForceSync Command] Error:', error);
            await interaction.editReply({
                content: '❌ An error occurred during force sync. Please try again later.'
            });
        }
    }
};