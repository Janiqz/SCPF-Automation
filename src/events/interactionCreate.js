const { Events } = require('discord.js');

module.exports = {
    name: Events.InteractionCreate,
    async execute(interaction, services) {
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
