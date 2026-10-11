const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    PermissionFlagsBits
} = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setup-applications')
        .setDescription('Setup or update the application buttons in the application channel')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction, { database, applicationManager, configManager }) {
        await interaction.deferReply({ flags: 64 });

        try {
            // ========================================================
            // CHECK APPLICATION CONFIGURATION
            // ========================================================

            if (!applicationManager.hasServerConfig(interaction.guildId)) {
                return interaction.editReply({
                    content: '❌ This server does not have applications configured. Please set up `config/applications.json` first.'
                });
            }

            const serverConfig =
                applicationManager.getServerConfig(
                    interaction.guildId
                );

            const applications =
                applicationManager.getAllApplications(
                    interaction.guildId
                );

            if (!serverConfig.applicationChannelId) {
                return interaction.editReply({
                    content: '❌ No application channel configured in applications.json'
                });
            }

            if (applications.length === 0) {
                return interaction.editReply({
                    content: '❌ No applications configured for this server'
                });
            }

            // ========================================================
            // GET APPLICATION CHANNEL
            // ========================================================

            const channel =
                interaction.guild.channels.cache.get(
                    serverConfig.applicationChannelId
                );

            if (!channel) {
                return interaction.editReply({
                    content: '❌ Application channel not found. Please check the channel ID in your config.'
                });
            }

            // ========================================================
            // DELETE EXISTING APPLICATION PANEL
            // ========================================================

            const existingMessage =
                database.getApplicationMessage(
                    interaction.guildId
                );

            if (existingMessage) {
                try {
                    const oldChannel =
                        interaction.guild.channels.cache.get(
                            existingMessage.channel_id
                        );

                    if (oldChannel) {
                        const oldMsg =
                            await oldChannel.messages
                                .fetch(
                                    existingMessage.message_id
                                )
                                .catch(() => null);

                        if (oldMsg) {
                            await oldMsg.delete();
                        }
                    }
                } catch (error) {
                    console.log(
                        '[SetupApplications] Could not delete old message:',
                        error.message
                    );
                }
            }

            // ========================================================
            // CREATE APPLICATION EMBED
            // ========================================================

            const embed =
                new EmbedBuilder()
                    .setColor(0x2b2c30)
                    .setTitle('📋 Foundation Applications')
                    .setDescription(
                        'Click a button below to submit an application for the corresponding rank.\n\n' +
                        '**Requirements:**\n' +
                        '• Must be verified with `/verify`\n' +
                        '• Must meet rank requirements\n' +
                        '• Must wait for cooldown period between applications'
                    )
                    .setFooter({
                        text: 'Applications are reviewed by staff'
                    })
                    .setTimestamp();

            // ========================================================
            // ADD APPLICATION FIELDS
            // ========================================================

            for (const app of applications) {
                const requiredRankDisplay =
                    app.requiredRankDisplay ||
                    configManager.getRankName(
                        interaction.guildId,
                        app.requiredRank
                    );

                embed.addFields({
                    name: `${app.emoji} ${app.name}`,
                    value:
                        `${app.description}\n` +
                        `**Required Rank:** ${requiredRankDisplay}\n` +
                        `**Cooldown:** ${app.cooldownDays} day(s)`,
                    inline: false
                });
            }

            // ========================================================
            // CREATE APPLICATION BUTTONS
            // ========================================================

            // Discord allows a maximum of:
            // - 5 buttons per row
            // - 5 action rows
            // - 25 buttons total

            const rows = [];
            let currentRow =
                new ActionRowBuilder();

            let buttonCount = 0;

            for (const app of applications) {
                const button =
                    new ButtonBuilder()
                        .setCustomId(
                            `apply_${app.id}`
                        )
                        .setLabel(app.name)
                        .setEmoji(app.emoji)
                        .setStyle(
                            ButtonStyle.Secondary
                        );

                currentRow.addComponents(button);
                buttonCount++;

                if (
                    buttonCount % 5 === 0 ||
                    buttonCount === applications.length
                ) {
                    rows.push(currentRow);
                    currentRow =
                        new ActionRowBuilder();
                }
            }

            // ========================================================
            // SEND APPLICATION PANEL
            // ========================================================
            //
            // @everyone is placed on the SAME message as the
            // application embed.
            //
            // allowedMentions ensures Discord actually processes
            // the @everyone mention.
            //

            const message =
                await channel.send({
                    content: '@everyone',
                    embeds: [embed],
                    components: rows,
                    allowedMentions: {
                        parse: ['everyone']
                    }
                });

            // ========================================================
            // SAVE MESSAGE ID
            // ========================================================

            database.setApplicationMessage(
                interaction.guildId,
                channel.id,
                message.id
            );

            // ========================================================
            // CONFIRM SETUP
            // ========================================================

            await interaction.editReply({
                content:
                    `✅ Application panel created in <#${channel.id}>!`
            });

        } catch (error) {
            console.error(
                '[SetupApplications Command] Error:',
                error
            );

            await interaction.editReply({
                content:
                    '❌ An error occurred while setting up applications. Check console logs.'
            });
        }
    }
};