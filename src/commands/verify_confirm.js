const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('verify_confirm')
        .setDescription('Confirm your Roblox account verification'),

    async execute(interaction, { database, robloxService, rankSyncService, configManager }) {
        await interaction.deferReply({ flags: 64 }); // 64 = ephemeral flag

        try {
            // Check if server is configured
            if (!configManager.hasServerConfig(interaction.guildId)) {
                return interaction.editReply({
                    content: '❌ This server is not configured for rank syncing. Please contact an administrator.'
                });
            }

            // Check if user already has a completed verification
            const existingVerification = database.getVerification(interaction.user.id);
            if (existingVerification) {
                return interaction.editReply({
                    content: `✅ You are already verified as **${existingVerification.roblox_username}**!`
                });
            }

            // Get pending verification
            const pendingVerification = database.getPendingVerification(interaction.user.id);
            if (!pendingVerification) {
                return interaction.editReply({
                    content: '❌ No pending verification found. Please use `/verify <username>` first.'
                });
            }

            // Check if verification has expired (15 minutes)
            const expirationTime = 15 * 60 * 1000; // 15 minutes in milliseconds
            if (Date.now() - pendingVerification.created_at > expirationTime) {
                database.deletePendingVerification(interaction.user.id);
                return interaction.editReply({
                    content: '❌ Verification code has expired. Please use `/verify <username>` again to get a new code.'
                });
            }

            // Fetch user's profile description
            const profileResult = await robloxService.getUserProfile(pendingVerification.roblox_id);
            
            if (!profileResult.success) {
                return interaction.editReply({
                    content: `❌ Failed to fetch your Roblox profile: ${profileResult.error}`
                });
            }

            // Check if verification code is in profile description
            const profileDescription = profileResult.description || '';
            const verificationCode = pendingVerification.verification_code;
            
            if (!profileDescription.includes(verificationCode)) {
                return interaction.editReply({
                    content: `❌ Verification code not found in your profile description.\n\nPlease add \`${verificationCode}\` to your "About" section on your Roblox profile and try again.`
                });
            }

            // Verification successful! Save to database
            database.setVerification(
                interaction.user.id,
                pendingVerification.roblox_id,
                pendingVerification.roblox_username
            );

            // Delete pending verification
            database.deletePendingVerification(interaction.user.id);

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
                .setTitle('✅ Verification Successful')
                .setDescription(`Your Discord account has been securely linked to **${pendingVerification.roblox_username}**`)
                .addFields(
                    {
                        name: 'Roblox User ID',
                        value: pendingVerification.roblox_id,
                        inline: true
                    },
                    {
                        name: '🔒 Security',
                        value: 'Your account is now verified bot-wide!',
                        inline: false
                    }
                )
                .setTimestamp();

            if (syncResult && syncResult.success) {
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
                        value: '✓ Your roles have been synced',
                        inline: true
                    });
                }

                if (syncResult.nicknameUpdated) {
                    embed.addFields({
                        name: 'Nickname Updated',
                        value: '✓ Your nickname has been updated',
                        inline: true
                    });
                }
            }

            embed.setFooter({ text: '💡 You can now remove the verification code from your Roblox profile' });

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('[Verify Confirm Command] Error:', error);
            await interaction.editReply({
                content: '❌ An error occurred during verification confirmation. Please try again later.'
            });
        }
    }
};