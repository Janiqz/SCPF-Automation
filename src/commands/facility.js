const {
    ChannelType,
    PermissionFlagsBits,
    SlashCommandBuilder
} = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('facility')
        .setDescription('Configure or refresh the Area 37 live facility status')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(subcommand => subcommand
            .setName('setup')
            .setDescription('Create the live facility status in a channel')
            .addChannelOption(option => option
                .setName('channel')
                .setDescription('Channel for the persistent facility embed')
                .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
                .setRequired(true))
            .addBooleanOption(option => option
                .setName('emergency-pings')
                .setDescription('Ping @everyone once when the facility enters a critical state')
                .setRequired(true)))
        .addSubcommand(subcommand => subcommand
            .setName('refresh')
            .setDescription('Refresh the configured facility status immediately'))
        .addSubcommand(subcommand => subcommand
            .setName('alerts')
            .setDescription('Enable or disable transition-based emergency pings')
            .addBooleanOption(option => option
                .setName('enabled')
                .setDescription('Whether a new critical state may ping @everyone')
                .setRequired(true)))
        .addSubcommand(subcommand => subcommand
            .setName('disable')
            .setDescription('Disable the live facility status embed')),

    async execute(interaction, { facilityState, facilityStatus }) {
        if (!interaction.guild || interaction.user.id !== interaction.guild.ownerId) {
            return interaction.reply({
                content: '❌ Only the Discord server owner can control the facility status embed.',
                ephemeral: true
            });
        }
        await interaction.deferReply({ ephemeral: true });

        try {
            const subcommand = interaction.options.getSubcommand();
            if ((subcommand === 'setup' || subcommand === 'refresh') && !facilityState.isConfigured()) {
                return interaction.editReply(`❌ ${facilityState.getConfigurationError()}`);
            }
            if (subcommand === 'setup') {
                const channel = interaction.options.getChannel('channel', true);
                const alerts = interaction.options.getBoolean('emergency-pings', true);
                const message = await facilityStatus.setup(interaction, channel, alerts);
                return interaction.editReply(`✅ Live facility status created: ${message.url}`);
            }
            if (subcommand === 'alerts') {
                const enabled = interaction.options.getBoolean('enabled', true);
                facilityStatus.setAlerts(interaction.guildId, enabled);
                return interaction.editReply(`✅ Emergency pings are now **${enabled ? 'enabled' : 'disabled'}**.`);
            }
            if (subcommand === 'disable') {
                await facilityStatus.disable(interaction.guildId);
                return interaction.editReply('✅ The live facility status has been disabled.');
            }
            const summary = await facilityStatus.refreshGuild(interaction.guildId);
            return interaction.editReply(`✅ Facility status refreshed. Current state: **${summary.level}**.`);
        } catch (error) {
            console.error('[Facility Command] Error:', error.message);
            return interaction.editReply(`❌ ${error.message}`);
        }
    }
};
