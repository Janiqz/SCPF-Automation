const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('reloadconfig')
        .setDescription('Reload the server configuration file (Admin only)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction, { configManager }) {
        await interaction.deferReply({ flags: 64 }); // 64 = ephemeral flag

        try {
            const beforeCount = configManager.getAllServerConfigs().length;
            
            configManager.reloadConfig();
            
            const afterCount = configManager.getAllServerConfigs().length;

            const embed = new EmbedBuilder()
                .setColor(0x00ff00)
                .setTitle('✅ Configuration Reloaded')
                .addFields(
                    {
                        name: 'Servers Configured',
                        value: afterCount.toString(),
                        inline: true
                    },
                    {
                        name: 'Previous Count',
                        value: beforeCount.toString(),
                        inline: true
                    }
                )
                .setTimestamp();

            // Check if current server is configured
            const currentServerConfig = configManager.getServerConfig(interaction.guildId);
            if (currentServerConfig) {
                embed.addFields({
                    name: 'This Server',
                    value: `✅ Configured (Group ID: ${currentServerConfig.robloxGroupId})`,
                    inline: false
                });
            } else {
                embed.addFields({
                    name: 'This Server',
                    value: '❌ Not configured',
                    inline: false
                });
            }

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('[ReloadConfig Command] Error:', error);
            await interaction.editReply({
                content: `❌ Failed to reload configuration: ${error.message}`
            });
        }
    }
};