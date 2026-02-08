const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('unlink')
        .setDescription('Unlink your Roblox account from Discord'),

    async execute(interaction, { database, configManager }) {
        await interaction.deferReply({ flags: 64 }); // 64 = ephemeral flag

        try {
            // Check if user is verified
            const verification = database.getVerification(interaction.user.id);
            if (!verification) {
                return interaction.editReply({
                    content: '❌ You are not currently verified.'
                });
            }

            // Create confirmation buttons
            const confirmButton = new ButtonBuilder()
                .setCustomId('unlink_confirm')
                .setLabel('Yes, Unlink')
                .setStyle(ButtonStyle.Danger);

            const cancelButton = new ButtonBuilder()
                .setCustomId('unlink_cancel')
                .setLabel('Cancel')
                .setStyle(ButtonStyle.Secondary);

            const row = new ActionRowBuilder()
                .addComponents(cancelButton, confirmButton);

            // Create warning embed
            const embed = new EmbedBuilder()
                .setColor(0xff0000)
                .setTitle('⚠️ Confirm Account Unlink')
                .setDescription(`Are you sure you want to unlink your Roblox account?`)
                .addFields(
                    {
                        name: 'Current Verification',
                        value: `**${verification.roblox_username}** (ID: ${verification.roblox_id})`,
                        inline: false
                    },
                    {
                        name: 'Warning',
                        value: '• This will remove your verification **across all servers** using this bot\n• All your synced roles and nicknames will be removed\n• You will need to verify again to use rank sync features',
                        inline: false
                    }
                )
                .setTimestamp();

            const response = await interaction.editReply({ 
                embeds: [embed], 
                components: [row]
            });

            // Wait for button interaction
            try {
                const confirmation = await response.awaitMessageComponent({
                    filter: i => i.user.id === interaction.user.id,
                    time: 30000 // 30 seconds
                });

                if (confirmation.customId === 'unlink_confirm') {
                    // Delete verification
                    database.deleteVerification(interaction.user.id);

                    // Also delete any pending verifications
                    database.deletePendingVerification(interaction.user.id);

                    const successEmbed = new EmbedBuilder()
                        .setColor(0x00ff00)
                        .setTitle('✅ Account Unlinked')
                        .setDescription(`Your Discord account has been unlinked from **${verification.roblox_username}**`)
                        .addFields({
                            name: 'Next Steps',
                            value: 'You can verify a new account anytime using `/verify <username>`',
                            inline: false
                        })
                        .setTimestamp();

                    await confirmation.update({ 
                        embeds: [successEmbed], 
                        components: [] 
                    });

                } else {
                    const cancelEmbed = new EmbedBuilder()
                        .setColor(0x808080)
                        .setTitle('❌ Unlink Cancelled')
                        .setDescription('Your account remains verified.')
                        .setTimestamp();

                    await confirmation.update({ 
                        embeds: [cancelEmbed], 
                        components: [] 
                    });
                }
            } catch (error) {
                // Timeout or error
                const timeoutEmbed = new EmbedBuilder()
                    .setColor(0x808080)
                    .setTitle('⏱️ Unlink Timeout')
                    .setDescription('Unlink request timed out. Your account remains verified.')
                    .setTimestamp();

                await interaction.editReply({ 
                    embeds: [timeoutEmbed], 
                    components: [] 
                });
            }

        } catch (error) {
            console.error('[Unlink Command] Error:', error);
            await interaction.editReply({
                content: '❌ An error occurred while unlinking your account. Please try again later.'
            });
        }
    }
};