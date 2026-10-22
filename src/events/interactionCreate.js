const { Events } = require('discord.js');

module.exports = {
    name: Events.InteractionCreate,
    async execute(interaction, services) {
        if (interaction.isButton()
            && interaction.customId === 'facility_toggle_session_notifications') {
            await interaction.deferReply({ ephemeral: true });
            try {
                const enabled = await services.sessionAnnouncements.toggleNotifications(interaction);
                return interaction.editReply(
                    enabled
                        ? '✅ Session notifications enabled.'
                        : '✅ Session notifications disabled.'
                );
            } catch (error) {
                console.error('[Session Notifications] Toggle failed:', error.message);
                return interaction.editReply(`❌ ${error.message}`);
            }
        }

        if (!interaction.isChatInputCommand()) return;

        const command = interaction.client.commands.get(interaction.commandName);

        if (!command) {
            console.error(`[InteractionCreate] No command matching ${interaction.commandName} was found.`);
            return;
        }

        try {
            await command.execute(interaction, services);
        } catch (error) {
            console.error(`[InteractionCreate] Error executing ${interaction.commandName}:`, error);
            
            const errorMessage = {
                content: '❌ There was an error while executing this command!',
                ephemeral: true
            };

            if (interaction.replied || interaction.deferred) {
                await interaction.followUp(errorMessage);
            } else {
                await interaction.reply(errorMessage);
            }
        }
    }
};
