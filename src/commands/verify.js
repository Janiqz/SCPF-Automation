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

            // Check if user is already verified
            const existingVerification = database.getVerification(interaction.user.id);
            if (existingVerification) {
                return interaction.editReply({
                    content: `❌ You are already verified as **${existingVerification.roblox_username}**. Use \`/unlink\` first if you want to verify a different account.`
                });
            }

            // Get Roblox user ID from username
            const userResult = await robloxService.getUserIdFromUsername(username);

            if (!userResult.success) {
                return interaction.editReply({
                    content: `❌ ${userResult.error}`
                });
            }

            const robloxId = userResult.userId;
            const robloxUsername = userResult.username;

            // Check if this Roblox account is already linked to another Discord account
            const robloxVerification = database.getVerificationByRobloxId(robloxId);
            if (robloxVerification && robloxVerification.discord_id !== interaction.user.id) {
                return interaction.editReply({
                    content: `❌ This Roblox account is already linked to another Discord account.`
                });
            }

            // Generate verification code
            const verificationCode = crypto.randomBytes(4).toString('hex').toUpperCase();
            
            // Store pending verification
            database.setPendingVerification(interaction.user.id, robloxId, robloxUsername, verificationCode);

            // Create instructions embed
            const embed = new EmbedBuilder()
                .setColor(0xffa500)
                .setTitle('🔐 Verification Required')
                .setDescription('To verify your Roblox account, please follow these steps:')
                .addFields(
                    {
                        name: '📝 Step 1: Copy Your Verification Code',
                        value: `\`\`\`${verificationCode}\`\`\``,
                        inline: false
                    },
                    {
                        name: '🌐 Step 2: Add Code to Your Roblox Profile',
                        value: `1. Go to [roblox.com/users/${robloxId}/profile](https://www.roblox.com/users/${robloxId}/profile)\n2. Click "Edit Profile"\n3. Add the verification code **anywhere** in your "About" section\n4. Save your profile`,
                        inline: false
                    },
                    {
                        name: '✅ Step 3: Confirm Verification',
                        value: 'Once you\'ve added the code to your profile, use the command:\n`/verify_confirm`',
                        inline: false
                    }
                )
                .setFooter({ text: 'This verification code will expire in 15 minutes' })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('[Verify Command] Error:', error);
            await interaction.editReply({
                content: '❌ An error occurred during verification. Please try again later.'
            });
        }
    }
};
