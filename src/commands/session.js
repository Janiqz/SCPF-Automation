const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('session')
        .setDescription('Start or end an Area 37 activity session')
        .addSubcommand(subcommand => subcommand
            .setName('start')
            .setDescription('Start an activity session and send its configured notification')
            .addStringOption(option => option
                .setName('type')
                .setDescription('Activity type')
                .setRequired(true)
                .addChoices(
                    { name: 'Facility Session', value: 'standard' },
                    { name: 'Paid Riot', value: 'paid-riot' }
                ))
            .addStringOption(option => option
                .setName('reason')
                .setDescription('Optional reason shown in the notification')
                .setMaxLength(500)))
        .addSubcommand(subcommand => subcommand
            .setName('end')
            .setDescription('End the active activity session')),

    async execute(interaction, { sessionAnnouncements }) {
        if (!sessionAnnouncements.isAuthorized(interaction)) {
            return interaction.reply({
                content: '❌ You do not have an authorized session-management role.',
                ephemeral: true
            });
        }
        await interaction.deferReply({ ephemeral: true });
        try {
            if (interaction.options.getSubcommand() === 'start') {
                const type = interaction.options.getString('type', true);
                const reason = interaction.options.getString('reason');
                const activity = await sessionAnnouncements.start(interaction, type, reason);
                return interaction.editReply(`✅ **${activity.displayName}** started and the notification was sent.`);
            }
            const activity = await sessionAnnouncements.end(interaction);
            return interaction.editReply(`✅ **${activity.displayName}** ended.`);
        } catch (error) {
            console.error('[Session Command] Error:', error.message);
            return interaction.editReply(`❌ ${error.message}`);
        }
    }
};
