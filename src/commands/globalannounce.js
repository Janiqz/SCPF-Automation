const {
    EmbedBuilder,
    PermissionFlagsBits,
    SlashCommandBuilder
} = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('globalannounce')
        .setDescription('Send one announcement to every configured Foundation department server')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(option => option
            .setName('title')
            .setDescription('Announcement heading')
            .setMaxLength(256)
            .setRequired(true))
        .addStringOption(option => option
            .setName('message')
            .setDescription('Announcement text')
            .setMaxLength(4000)
            .setRequired(true))
        .addBooleanOption(option => option
            .setName('ping-everyone')
            .setDescription('Ping everyone in each configured announcement channel (default: no)'))
        .addStringOption(option => option
            .setName('image')
            .setDescription('Optional HTTPS image URL shown below the announcement')),

    async execute(interaction, { configManager }) {
        if (!interaction.guild || interaction.user.id !== interaction.guild.ownerId) {
            return interaction.reply({
                content: '❌ Only the Discord server owner can send a global Foundation announcement.',
                ephemeral: true
            });
        }

        await interaction.deferReply({ ephemeral: true });

        const title = interaction.options.getString('title', true);
        const message = interaction.options.getString('message', true);
        const pingEveryone = interaction.options.getBoolean('ping-everyone') === true;
        const image = interaction.options.getString('image');

        if (image) {
            try {
                const url = new URL(image);
                if (url.protocol !== 'https:') throw new Error('HTTPS is required');
            } catch (_) {
                return interaction.editReply('❌ The image must be a valid HTTPS URL.');
            }
        }

        const targets = configManager.getAllServerConfigs()
            .filter(config => typeof config.announcementChannelId === 'string'
                && /^\d{17,20}$/.test(config.announcementChannelId));

        if (!targets.length) {
            return interaction.editReply('❌ No `announcementChannelId` values are configured in `config/servers.json`.');
        }

        const embed = new EmbedBuilder()
            .setColor(0xffffff)
            .setTitle(title)
            .setDescription(message)
            .setAuthor({ name: 'SCP FOUNDATION · GLOBAL ANNOUNCEMENT' })
            .setFooter({ text: `Issued by ${interaction.user.tag}` })
            .setTimestamp();
        if (image) embed.setImage(image);

        const results = await Promise.all(targets.map(async config => {
            try {
                const channel = await interaction.client.channels.fetch(config.announcementChannelId);
                if (!channel || !channel.isTextBased()) throw new Error('channel is unavailable or is not text-based');

                const permissions = channel.permissionsFor(channel.guild.members.me);
                if (!permissions?.has(PermissionFlagsBits.SendMessages)) throw new Error('missing Send Messages permission');
                if (!permissions.has(PermissionFlagsBits.EmbedLinks)) throw new Error('missing Embed Links permission');
                if (pingEveryone && !permissions.has(PermissionFlagsBits.MentionEveryone)) {
                    throw new Error('missing Mention Everyone permission');
                }

                await channel.send({
                    content: pingEveryone ? '@everyone' : undefined,
                    embeds: [embed],
                    allowedMentions: pingEveryone ? { parse: ['everyone'] } : { parse: [] }
                });
                return { ok: true, name: config.guildName || config.guildId };
            } catch (error) {
                return { ok: false, name: config.guildName || config.guildId, error: error.message };
            }
        }));

        const sent = results.filter(result => result.ok);
        const failed = results.filter(result => !result.ok);
        const lines = [`✅ Global announcement sent to **${sent.length}/${results.length}** configured servers.`];
        if (failed.length) {
            lines.push('', '**Could not send to:**');
            lines.push(...failed.slice(0, 10).map(result => `• ${result.name}: ${result.error}`));
        }
        return interaction.editReply(lines.join('\n'));
    }
};
