const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('reverify')
        .setDescription('Change your linked Roblox account')
        .addStringOption(option =>
            option.setName('username')
                .setDescription('Your new Roblox username')
                .setRequired(true)
        ),

    async execute(interaction, { database, robloxService, rankSyncService, configManager }) {
        await interaction.deferReply({ flags: 64 }); // 64 = ephemeral flag

        const username = interaction.options.getString('username');

        try {
            // Check if server is configured
            if (!configManager.hasServerConfig(interaction.guildId)) {
                return interaction.editReply({
                    content: '❌ This server is not configured for rank syncing. Please contact an administrator.'
                });
            }

            // Get old verification
            const oldVerification = database.getVerification(interaction.user.id);

            // Get Roblox user ID from username
            const userResult = await robloxService.getUserIdFromUsername(username);

            if (!userResult.success) {
                return interaction.editReply({
                    content: `❌ Could not find Roblox user "${username}". Please check the spelling and try again.`
                });
            }

            const robloxId = userResult.userId;
            const robloxUsername = userResult.username;

            // Check if this Roblox account is already linked to another Discord account
            const existingVerification = database.getVerificationByRobloxId(robloxId);
            if (existingVerification && existingVerification.discord_id !== interaction.user.id) {
                return interaction.editReply({
                    content: `❌ This Roblox account is already linked to another Discord account.`
                });
            }

            // Update verification
            database.setVerification(interaction.user.id, robloxId, robloxUsername);

            // Sync in current server
            const serverConfig = configManager.getServerConfig(interaction.guildId);
            
            let syncResult = null;
            if (serverConfig && serverConfig.syncSettings.syncOnVerify) {
                syncResult = await rankSyncService.syncUserInGuild(
                    interaction.client,
                    interaction.guildId,
                    interaction.user.id
                );
            }

            // Create success embed
            const embed = new EmbedBuilder()
                .setColor(0x00ff00)
                .setTitle('✅ Re-verification Successful')
                .setDescription(`Your Discord account has been linked to **${robloxUsername}**`)
                .setTimestamp();

            if (oldVerification) {
                embed.addFields({
                    name: 'Previous Account',
                    value: oldVerification.roblox_username,
                    inline: true
                });
            }

            embed.addFields({
                name: 'New Account',
                value: robloxUsername,
                inline: true
            });

            if (syncResult && syncResult.success) {
                embed.addFields(
                    {
                        name: 'Current Rank',
                        value: `${syncResult.rank} - ${syncResult.roleName}`,
                        inline: true
                    }
                );
            }

            embed.setFooter({ text: 'Your verification has been updated across all servers!' });

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('[Reverify Command] Error:', error);
            await interaction.editReply({
                content: '❌ An error occurred during re-verification. Please try again later.'
            });
        }
    }
};