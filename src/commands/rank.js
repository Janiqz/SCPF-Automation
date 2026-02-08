const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('rank')
        .setDescription('Check your current Roblox rank in this server'),

    async execute(interaction, { database, robloxService, configManager }) {
        await interaction.deferReply({ flags: 64 }); // 64 = ephemeral flag

        try {
            // Check if server is configured
            const serverConfig = configManager.getServerConfig(interaction.guildId);
            if (!serverConfig) {
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

            // Get current rank from Roblox
            const rankResult = await robloxService.getUserRankInGroup(
                verification.roblox_id,
                serverConfig.robloxGroupId
            );

            if (!rankResult.success) {
                return interaction.editReply({
                    content: `❌ Failed to fetch rank: ${rankResult.error}`
                });
            }

            // Get stored rank
            const storedRank = database.getGuildRank(interaction.user.id, interaction.guildId);

            // Get group info
            const groupInfo = await robloxService.getGroupInfo(serverConfig.robloxGroupId);

            // Create embed
            const embed = new EmbedBuilder()
                .setColor(0x0099ff)
                .setTitle('📊 Roblox Rank Information')
                .addFields(
                    {
                        name: 'Roblox Username',
                        value: verification.roblox_username,
                        inline: true
                    },
                    {
                        name: 'Roblox User ID',
                        value: verification.roblox_id,
                        inline: true
                    }
                )
                .setTimestamp();

            if (groupInfo.success) {
                embed.addFields({
                    name: 'Group',
                    value: groupInfo.name,
                    inline: false
                });
            }

            embed.addFields(
                {
                    name: 'Current Rank',
                    value: `${rankResult.rank} - ${rankResult.roleName}`,
                    inline: true
                }
            );

            if (storedRank) {
                const lastSynced = new Date(storedRank.last_synced_at);
                embed.addFields({
                    name: 'Last Synced',
                    value: `<t:${Math.floor(lastSynced.getTime() / 1000)}:R>`,
                    inline: true
                });
            }

            // Get expected Discord role
            const rankMapping = configManager.getRankMapping(interaction.guildId, rankResult.rank);
            if (rankMapping) {
                embed.addFields({
                    name: 'Expected Discord Role',
                    value: rankMapping.roleName,
                    inline: true
                });
            }

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('[Rank Command] Error:', error);
            await interaction.editReply({
                content: '❌ An error occurred while fetching rank. Please try again later.'
            });
        }
    }
};