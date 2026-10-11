const {
    SlashCommandBuilder,
    EmbedBuilder,
    PermissionFlagsBits,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ComponentType
} = require('discord.js');

// ============================================================
// CONFIG
// ============================================================

// Role pinged when a recruitment post goes out.
const NOTIFIER_ROLE_ID = '1544418796679204905';

// Recruitment posts always go here.
const RECRUITMENT_CHANNEL_ID = '1502347677734535280';

// Roles allowed to run this command (case-insensitive).
const ALLOWED_RANKS = ['o5 council', 'executive personnel', 'o5 head', 'the administrator'];

// Only location option available right now — add more here later.
const LOCATION_CHOICES = [
    { name: 'Area 37 Session', value: 'Area 37 Session' }
];

// Professional, muted colour palette per type.
const TYPE_STYLE = {
    tryout: { label: 'Tryout', color: 0x2E5A88 },
    application: { label: 'Application', color: 0x4A3B6B },
    training: { label: 'Training', color: 0x1E6B45 },
    interview: { label: 'Interview', color: 0x8A5A1E }
};

const STATUS = {
    SCHEDULED: { text: 'Scheduled', dot: '⚫' },
    DELAYED: { text: 'Delayed', dot: '🟡' },
    LIVE: { text: 'Live', dot: '🟢' },
    ENDED: { text: 'Ended', dot: '⚪' },
    CANCELLED: { text: 'Cancelled', dot: '🔴' }
};

const CONTROL_TIMEOUT_MS = 12 * 60 * 60 * 1000; // 12 hours

// ============================================================
// SHARED SLASH COMMAND OPTIONS
// ============================================================

function addSharedOptions(subcommand, { includeLocation = true } = {}) {
    subcommand.addStringOption(option =>
        option.setName('title')
            .setDescription('Embed title')
            .setRequired(true)
            .setMaxLength(256)
    );

    if (includeLocation) {
        subcommand.addStringOption(option =>
            option.setName('location')
                .setDescription('Where this is taking place')
                .setRequired(true)
                .addChoices(...LOCATION_CHOICES)
        );
    }

    subcommand
        .addStringOption(option =>
            option.setName('time')
                .setDescription('When this starts (e.g. "Today at 6:00 PM EST")')
                .setRequired(true)
                .setMaxLength(100)
        )
        .addStringOption(option =>
            option.setName('link')
                .setDescription('Relevant link (application form, group, etc.)')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('code')
                .setDescription('Optional 4-digit join code (digits only)')
                .setRequired(false)
                .setMaxLength(4)
        );

    return subcommand;
}

// ============================================================
// COMMAND DEFINITION
// ============================================================

module.exports = {
    data: new SlashCommandBuilder()
        .setName('recruitment')
        .setDescription('Post a recruitment embed and ping the Notifier role')
        .addSubcommand(sc => addSharedOptions(sc.setName('tryout').setDescription('Post a tryouts recruitment embed')))
        .addSubcommand(sc => addSharedOptions(sc.setName('application').setDescription('Post an applications recruitment embed'), { includeLocation: false }))
        .addSubcommand(sc => addSharedOptions(sc.setName('training').setDescription('Post a trainings recruitment embed')))
        .addSubcommand(sc => addSharedOptions(sc.setName('interview').setDescription('Post an interviews recruitment embed'))),

    async execute(interaction, { configManager }) {
        // ----------------------------------------------------
        // Permission check
        // ----------------------------------------------------
        const hasPermission = interaction.member.roles.cache.some(role =>
            ALLOWED_RANKS.includes(role.name.toLowerCase())
        );

        if (!hasPermission) {
            return interaction.reply({
                content: '❌ You must be **O5 Council**, **Executive Personnel**, or **The Administrator** to use this command.',
                ephemeral: true
            });
        }

        const type = interaction.options.getSubcommand(); // tryout | application | training | interview
        const style = TYPE_STYLE[type];

        const title = interaction.options.getString('title');
        const location = type !== 'application' ? interaction.options.getString('location') : null;
        const time = interaction.options.getString('time');
        const link = interaction.options.getString('link');
        const code = interaction.options.getString('code');

        // ----------------------------------------------------
        // Validate inputs that don't need the modal
        // ----------------------------------------------------
        try {
            new URL(link);
        } catch {
            return interaction.reply({
                content: '❌ The link you provided is not a valid URL (make sure it starts with http:// or https://).',
                ephemeral: true
            });
        }

        if (code && !/^\d{1,4}$/.test(code)) {
            return interaction.reply({
                content: '❌ The join code must be 1-4 digits only.',
                ephemeral: true
            });
        }

        if (NOTIFIER_ROLE_ID === 'PUT_ROLE_ID_HERE') {
            return interaction.reply({
                content: '❌ The Notifier role ID has not been configured yet. Set `NOTIFIER_ROLE_ID` in recruitment.js.',
                ephemeral: true
            });
        }

        // ----------------------------------------------------
        // Resolve and validate the target channel up front
        // ----------------------------------------------------
        let channel;
        try {
            channel = interaction.guild.channels.cache.get(RECRUITMENT_CHANNEL_ID)
                || await interaction.guild.channels.fetch(RECRUITMENT_CHANNEL_ID);
        } catch {
            channel = null;
        }

        if (!channel) {
            return interaction.reply({
                content: '❌ The configured recruitment channel could not be found. Check `RECRUITMENT_CHANNEL_ID`.',
                ephemeral: true
            });
        }

        const botMember = interaction.guild.members.me;
        const permissions = channel.permissionsFor(botMember);

        if (!permissions.has(PermissionFlagsBits.SendMessages)) {
            return interaction.reply({
                content: `❌ I don't have permission to send messages in ${channel}.`,
                ephemeral: true
            });
        }

        if (!permissions.has(PermissionFlagsBits.EmbedLinks)) {
            return interaction.reply({
                content: `❌ I don't have permission to send embeds in ${channel}.`,
                ephemeral: true
            });
        }

        // ----------------------------------------------------
        // Collect Requirements / Additional Info via a modal
        // (allows real multi-line paragraphs, unlike slash options)
        // ----------------------------------------------------
        const modal = new ModalBuilder()
            .setCustomId(`recruit_modal_${interaction.id}`)
            .setTitle(`${style.label} — Details`);

        const requirementsInput = new TextInputBuilder()
            .setCustomId('requirements')
            .setLabel('Requirements')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMaxLength(1024)
            .setPlaceholder('Describe what is expected of participants...');

        const additionalInfoInput = new TextInputBuilder()
            .setCustomId('additional_info')
            .setLabel('Additional Information (optional)')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(false)
            .setMaxLength(1024)
            .setPlaceholder('Anything else people should know...');

        modal.addComponents(
            new ActionRowBuilder().addComponents(requirementsInput),
            new ActionRowBuilder().addComponents(additionalInfoInput)
        );

        await interaction.showModal(modal);

        let modalSubmission;
        try {
            modalSubmission = await interaction.awaitModalSubmit({
                filter: i => i.customId === modal.data.custom_id && i.user.id === interaction.user.id,
                time: 10 * 60 * 1000 // 10 minutes to fill it out
            });
        } catch {
            // Modal timed out or was dismissed — nothing left to do.
            return;
        }

        await modalSubmission.deferReply({ ephemeral: true });

        const requirements = modalSubmission.fields.getTextInputValue('requirements');
        const additionalInfoRaw = modalSubmission.fields.getTextInputValue('additional_info');
        const additionalInfo = additionalInfoRaw && additionalInfoRaw.trim().length > 0 ? additionalInfoRaw : null;

        // ----------------------------------------------------
        // State for this recruitment session (lives in memory
        // for the process's lifetime — resets on bot restart)
        // ----------------------------------------------------
        let status = 'SCHEDULED';
        let currentTime = time;

        function buildEmbed() {
            const s = STATUS[status];
            const embed = new EmbedBuilder()
                .setColor(status === 'CANCELLED' ? 0x8B2E2E : status === 'ENDED' ? 0x5D6D7E : style.color)
                .setTitle(title)
                .setDescription(`${style.label} recruitment`)
                .addFields({ name: 'Time', value: currentTime, inline: true });

            if (type !== 'application') {
                embed.addFields({ name: 'Status', value: `${s.dot} ${s.text}`, inline: true });
            }

            if (location) {
                embed.addFields({ name: 'Location', value: location, inline: true });
            }

            if (code) {
                embed.addFields({ name: 'Join Code', value: `\`${code}\``, inline: true });
            }

            embed.addFields({ name: 'Link', value: `[Click here](${link})`, inline: false });
            embed.addFields({ name: 'Requirements', value: requirements, inline: false });

            if (additionalInfo) {
                embed.addFields({ name: 'Additional Information', value: additionalInfo, inline: false });
            }

            embed
                .setTimestamp()
                .setFooter({ text: `Hosted by ${interaction.user.tag}` });

            return embed;
        }

        // ----------------------------------------------------
        // Send the recruitment post
        // ----------------------------------------------------
        let postedMessage;
        try {
            postedMessage = await channel.send({
                content: `<@&${NOTIFIER_ROLE_ID}>`,
                embeds: [buildEmbed()],
                allowedMentions: { roles: [NOTIFIER_ROLE_ID] }
            });
        } catch (error) {
            console.error('[Recruitment Command] Failed to send embed:', error);
            return modalSubmission.editReply({
                content: '❌ Something went wrong sending the embed to the recruitment channel. Please try again.'
            });
        }

        // Applications aren't "sessions" — no start/delay/cancel/end controls needed.
        if (type === 'application') {
            await modalSubmission.editReply({
                content: `✅ ${style.label} embed posted to ${channel}!`
            });

            if (configManager) {
                const serverConfig = configManager.getServerConfig(interaction.guildId);
                if (serverConfig && serverConfig.loggingChannelId) {
                    try {
                        const logChannel = interaction.guild.channels.cache.get(serverConfig.loggingChannelId);
                        if (logChannel) {
                            const logEmbed = new EmbedBuilder()
                                .setColor(style.color)
                                .setTitle(`Recruitment Post Created — ${style.label}`)
                                .addFields(
                                    { name: 'Created By', value: `${interaction.user.tag} (${interaction.user.id})`, inline: true },
                                    { name: 'Channel', value: `${channel}`, inline: true },
                                    { name: 'Title', value: title, inline: false }
                                )
                                .setTimestamp();

                            await logChannel.send({ embeds: [logEmbed] });
                        }
                    } catch (logError) {
                        console.error('[Recruitment Command] Failed to log:', logError);
                    }
                }
            }
            return;
        }

        // ----------------------------------------------------
        // Build host control buttons
        // ----------------------------------------------------
        function schedulingRow(disabled = false) {
            return new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('start').setLabel('Start Session').setStyle(ButtonStyle.Success).setDisabled(disabled),
                new ButtonBuilder().setCustomId('delay').setLabel('Delay').setStyle(ButtonStyle.Secondary).setDisabled(disabled),
                new ButtonBuilder().setCustomId('cancel').setLabel('Cancel').setStyle(ButtonStyle.Danger).setDisabled(disabled)
            );
        }

        function liveRow(disabled = false) {
            return new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('end').setLabel('End Session').setStyle(ButtonStyle.Danger).setDisabled(disabled)
            );
        }

        function endedRow() {
            return new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('closed').setLabel('Session Closed').setStyle(ButtonStyle.Secondary).setDisabled(true)
            );
        }

        function controlEmbed() {
            const s = STATUS[status];
            return new EmbedBuilder()
                .setColor(style.color)
                .setTitle(`${style.label} Control Panel`)
                .setDescription(`**${title}**\n[Jump to post](${postedMessage.url})`)
                .addFields(
                    { name: 'Status', value: `${s.dot} ${s.text}`, inline: true },
                    { name: 'Time', value: currentTime, inline: true }
                )
                .setFooter({ text: 'Only you can see and use these controls.' });
        }

        // ----------------------------------------------------
        // DM the host with control buttons
        // ----------------------------------------------------
        let dmMessage = null;
        try {
            dmMessage = await interaction.user.send({
                embeds: [controlEmbed()],
                components: [schedulingRow()]
            });
        } catch {
            // DMs closed — the post still went out, just note it below.
        }

        await modalSubmission.editReply({
            content: dmMessage
                ? `✅ ${style.label} embed posted to ${channel}! Check your DMs for controls to start, delay, cancel, or end the session.`
                : `✅ ${style.label} embed posted to ${channel}! I couldn't DM you a control panel — please enable DMs from server members if you want to manage this session.`
        });

        if (!dmMessage) {
            return;
        }

        // ----------------------------------------------------
        // Handle host controls
        // ----------------------------------------------------
        const collector = dmMessage.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: CONTROL_TIMEOUT_MS
        });

        collector.on('collect', async buttonInteraction => {
            if (buttonInteraction.user.id !== interaction.user.id) {
                return buttonInteraction.reply({ content: 'This session is not yours to manage.', ephemeral: true });
            }

            try {
                if (buttonInteraction.customId === 'start') {
                    if (status !== 'SCHEDULED') {
                        return buttonInteraction.reply({ content: 'This session has already been started, cancelled, or ended.', ephemeral: true });
                    }

                    status = 'LIVE';
                    await buttonInteraction.deferUpdate();
                    await Promise.all([
                        postedMessage.edit({ embeds: [buildEmbed()] }),
                        dmMessage.edit({ embeds: [controlEmbed()], components: [liveRow()] })
                    ]);
                    return;
                }

                if (buttonInteraction.customId === 'delay') {
                    if (status !== 'SCHEDULED') {
                        return buttonInteraction.reply({ content: 'You can only delay a session before it has started.', ephemeral: true });
                    }

                    const delayModal = new ModalBuilder()
                        .setCustomId(`recruit_delay_${buttonInteraction.id}`)
                        .setTitle('Delay Session');

                    const newTimeInput = new TextInputBuilder()
                        .setCustomId('new_time')
                        .setLabel('New start time')
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true)
                        .setMaxLength(100)
                        .setValue(currentTime);

                    delayModal.addComponents(new ActionRowBuilder().addComponents(newTimeInput));

                    await buttonInteraction.showModal(delayModal);

                    let delaySubmission;
                    try {
                        delaySubmission = await buttonInteraction.awaitModalSubmit({
                            filter: i => i.customId === delayModal.data.custom_id && i.user.id === interaction.user.id,
                            time: 5 * 60 * 1000
                        });
                    } catch {
                        return;
                    }

                    currentTime = delaySubmission.fields.getTextInputValue('new_time');
                    status = 'DELAYED';
                    await delaySubmission.deferUpdate();
                    await Promise.all([
                        postedMessage.edit({ embeds: [buildEmbed()] }),
                        dmMessage.edit({ embeds: [controlEmbed()], components: [schedulingRow()] })
                    ]);

                    // Session is still schedulable after a delay — restore that state
                    // once the "delayed" flag has been visually communicated.
                    status = 'SCHEDULED';
                    return;
                }

                if (buttonInteraction.customId === 'cancel') {
                    if (status === 'ENDED' || status === 'CANCELLED') {
                        return buttonInteraction.reply({ content: 'This session is already closed.', ephemeral: true });
                    }

                    status = 'CANCELLED';
                    await buttonInteraction.deferUpdate();
                    await Promise.all([
                        postedMessage.edit({ embeds: [buildEmbed()] }),
                        dmMessage.edit({ embeds: [controlEmbed()], components: [endedRow()] })
                    ]);
                    collector.stop('cancelled');
                    return;
                }

                if (buttonInteraction.customId === 'end') {
                    if (status !== 'LIVE') {
                        return buttonInteraction.reply({ content: 'This session is not currently live.', ephemeral: true });
                    }

                    status = 'ENDED';
                    await buttonInteraction.deferUpdate();
                    await Promise.all([
                        postedMessage.edit({ embeds: [buildEmbed()] }),
                        dmMessage.edit({ embeds: [controlEmbed()], components: [endedRow()] })
                    ]);
                    collector.stop('ended');
                    return;
                }
            } catch (error) {
                console.error('[Recruitment Command] Error handling control button:', error);
                if (!buttonInteraction.replied && !buttonInteraction.deferred) {
                    await buttonInteraction.reply({ content: '❌ Something went wrong processing that action.', ephemeral: true }).catch(() => {});
                }
            }
        });

        collector.on('end', async (_collected, reason) => {
            if (reason === 'cancelled' || reason === 'ended') {
                return;
            }

            // Timed out without a final action — freeze the controls so they
            // can't be clicked into an inconsistent state.
            try {
                await dmMessage.edit({ embeds: [controlEmbed()], components: [endedRow()] });
            } catch {
                // DM may have been deleted — nothing more to do.
            }
        });

        // ----------------------------------------------------
        // Log the initial post
        // ----------------------------------------------------
        if (configManager) {
            const serverConfig = configManager.getServerConfig(interaction.guildId);
            if (serverConfig && serverConfig.loggingChannelId) {
                try {
                    const logChannel = interaction.guild.channels.cache.get(serverConfig.loggingChannelId);
                    if (logChannel) {
                        const logEmbed = new EmbedBuilder()
                            .setColor(style.color)
                            .setTitle(`Recruitment Post Created — ${style.label}`)
                            .addFields(
                                { name: 'Created By', value: `${interaction.user.tag} (${interaction.user.id})`, inline: true },
                                { name: 'Channel', value: `${channel}`, inline: true },
                                { name: 'Title', value: title, inline: false }
                            )
                            .setTimestamp();

                        await logChannel.send({ embeds: [logEmbed] });
                    }
                } catch (logError) {
                    console.error('[Recruitment Command] Failed to log:', logError);
                }
            }
        }
    }
};