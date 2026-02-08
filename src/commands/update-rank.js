const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('updaterank')
        .setDescription('Update another user\'s rank (Staff only)')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The Discord user to update')
                .setRequired(true)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles), // Require Manage Roles permission by default

    async execute(interaction, { database, robloxService, rankSyncService, configManager }) {
        await interaction.deferReply({ flags: 64 }); // 64 = ephemeral flag

        try {
            // Check if server is configured
            const serverConfig = configManager.getServerConfig(interaction.guildId);
            if (!serverConfig) {
                return interaction.editReply({
                    content: '❌ This server is not configured for rank syncing. Please contact an administrator.'
                });
            }

            // Additional role-based permission check
            // Get staff roles from config (you can customize this)
            const allowedRoles = serverConfig.staffRoles || []; // Add staffRoles array to server config
            
            // Check if user has Manage Roles permission OR is in allowed staff roles
            const member = interaction.member;
            const hasPermission = member.permissions.has(PermissionFlagsBits.ManageRoles) ||
                                allowedRoles.some(roleId => member.roles.cache.has(roleId));

            if (!hasPermission) {
                return interaction.editReply({
                    content: '❌ You do not have permission to use this command.'
                });
            }

            const targetUser = interaction.options.getUser('user');

            // Check if target user is verified
            const verification = database.getVerification(targetUser.id);
            if (!verification) {
                return interaction.editReply({
                    content: `❌ ${targetUser.tag} is not verified. They need to use \`/verify <username>\` first.`
                });
            }

            // Perform rank sync
            const syncResult = await rankSyncService.syncUserInGuild(
                interaction.client,
                interaction.guildId,
                targetUser.id
            );

            if (!syncResult.success) {
                return interaction.editReply({
                    content: `❌ Failed to update rank: ${syncResult.error}`
                });
            }

            // Get group info for display
            const groupInfo = await robloxService.getGroupInfo(serverConfig.robloxGroupId);

            // Create success embed
            const embed = new EmbedBuilder()
                .setColor(0x00ff00)
                .setTitle('✅ Rank Updated Successfully')
                .setDescription(`Updated rank for ${targetUser.tag}`)
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
                );

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
                    value: `${syncResult.rank} - ${syncResult.roleName}`,
                    inline: true
                }
            );

            if (syncResult.rolesUpdated) {
                embed.addFields({
                    name: 'Roles Updated',
                    value: '✓ Discord roles have been synced',
                    inline: true
                });
            }

            if (syncResult.nicknameUpdated) {
                embed.addFields({
                    name: 'Nickname Updated',
                    value: '✓ Nickname has been updated',
                    inline: true
                });
            }

            embed.addFields({
                name: 'Updated By',
                value: interaction.user.tag,
                inline: true
            });

            embed.setTimestamp();

            await interaction.editReply({ embeds: [embed] });

            // Log to logging channel if configured
            if (serverConfig.loggingChannelId) {
                try {
                    const logChannel = interaction.guild.channels.cache.get(serverConfig.loggingChannelId);
                    if (logChannel) {
                        const logEmbed = new EmbedBuilder()
                            .setColor(0x0099ff)
                            .setTitle('📝 Manual Rank Update')
                            .addFields(
                                {
                                    name: 'Staff Member',
                                    value: `${interaction.user.tag} (${interaction.user.id})`,
                                    inline: true
                                },
                                {
                                    name: 'Target User',
                                    value: `${targetUser.tag} (${targetUser.id})`,
                                    inline: true
                                },
                                {
                                    name: 'Roblox Account',
                                    value: `${verification.roblox_username} (${verification.roblox_id})`,
                                    inline: false
                                },
                                {
                                    name: 'New Rank',
                                    value: `${syncResult.rank} - ${syncResult.roleName}`,
                                    inline: true
                                }
                            )
                            .setTimestamp();

                        await logChannel.send({ embeds: [logEmbed] });
                    }
                } catch (logError) {
                    console.error('[UpdateRank Command] Failed to log to channel:', logError);
                }
            }

        } catch (error) {
            console.error('[UpdateRank Command] Error:', error);
            await interaction.editReply({
                content: '❌ An error occurred while updating the rank. Please try again later.'
            });
        }
    }
};