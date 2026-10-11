const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('embed')
        .setDescription('Create and send a custom embed')
        .addSubcommand(subcommand =>
            subcommand
                .setName('create')
                .setDescription('Create a custom embed message')
                .addChannelOption(option =>
                    option.setName('channel')
                        .setDescription('Channel to send the embed in')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option.setName('title')
                        .setDescription('Embed title')
                        .setRequired(true)
                        .setMaxLength(256)
                )
                .addStringOption(option =>
                    option.setName('description')
                        .setDescription('Embed description/text')
                        .setRequired(true)
                        .setMaxLength(4000)
                )
                .addStringOption(option =>
                    option.setName('color')
                        .setDescription('Embed color (hex code like #FF0000 or color name)')
                        .setRequired(false)
                )
                .addStringOption(option =>
                    option.setName('image')
                        .setDescription('Image URL to display in the embed')
                        .setRequired(false)
                )
                .addStringOption(option =>
                    option.setName('thumbnail')
                        .setDescription('Thumbnail URL to display in the embed')
                        .setRequired(false)
                )
                .addBooleanOption(option =>
                    option.setName('ping_everyone')
                        .setDescription('Ping @everyone when sending this embed')
                        .setRequired(false)
                )
        ),

    async execute(interaction, { configManager }) {
        // Check if user has "Overseer" or "The Administrator" role (case-insensitive)
        const hasPermission = interaction.member.roles.cache.some(role => 
            role.name.toLowerCase() === 'overseer' || role.name.toLowerCase() === 'the administrator'
        );

        if (!hasPermission) {
            return interaction.reply({
                content: '❌ You must have the **Overseer** or **The Administrator** role to use this command.',
                ephemeral: true
            });
        }

        await interaction.deferReply({ ephemeral: true });

        try {
            const channel = interaction.options.getChannel('channel');
            const title = interaction.options.getString('title');
            const description = interaction.options.getString('description');
            const colorInput = interaction.options.getString('color');
            const imageUrl = interaction.options.getString('image');
            const thumbnailUrl = interaction.options.getString('thumbnail');
            const pingEveryone = interaction.options.getBoolean('ping_everyone') || false;

            // Parse color
            let color = 0x0099ff; // Default blue
            if (colorInput) {
                if (colorInput.startsWith('#')) {
                    color = parseInt(colorInput.replace('#', ''), 16);
                } else {
                    const colorMap = {
                        'red': 0xff0000,
                        'green': 0x00ff00,
                        'blue': 0x0099ff,
                        'yellow': 0xffff00,
                        'orange': 0xffa500,
                        'purple': 0x800080,
                        'pink': 0xffc0cb,
                        'black': 0x000000,
                        'white': 0xffffff,
                        'gray': 0x808080,
                        'grey': 0x808080
                    };
                    color = colorMap[colorInput.toLowerCase()] || 0x0099ff;
                }
            }

            // Create embed
            const embed = new EmbedBuilder()
                .setTitle(title)
                .setDescription(description)
                .setColor(color)
                .setTimestamp()
                .setFooter({ text: `Created by ${interaction.user.tag}` });

            if (imageUrl) {
                try {
                    new URL(imageUrl);
                    embed.setImage(imageUrl);
                } catch {
                    return interaction.editReply({
                        content: '❌ Invalid image URL provided.'
                    });
                }
            }

            if (thumbnailUrl) {
                try {
                    new URL(thumbnailUrl);
                    embed.setThumbnail(thumbnailUrl);
                } catch {
                    return interaction.editReply({
                        content: '❌ Invalid thumbnail URL provided.'
                    });
                }
            }

            // Check permissions
            const botMember = interaction.guild.members.me;
            const permissions = channel.permissionsFor(botMember);
            
            if (!permissions.has(PermissionFlagsBits.SendMessages)) {
                return interaction.editReply({
                    content: `❌ I don't have permission to send messages in ${channel}.`
                });
            }

            if (!permissions.has(PermissionFlagsBits.EmbedLinks)) {
                return interaction.editReply({
                    content: `❌ I don't have permission to send embeds in ${channel}.`
                });
            }

            const messageOptions = { embeds: [embed] };

            if (pingEveryone) {
                if (!permissions.has(PermissionFlagsBits.MentionEveryone)) {
                    return interaction.editReply({
                        content: `❌ I don't have permission to mention @everyone in ${channel}.`
                    });
                }
                messageOptions.content = '@everyone';
                messageOptions.allowedMentions = { parse: ['everyone'] };
            }

            await channel.send(messageOptions);

            await interaction.editReply({
                content: `✅ Embed successfully sent to ${channel}!`
            });

            // Log
            if (configManager) {
                const serverConfig = configManager.getServerConfig(interaction.guildId);
                if (serverConfig && serverConfig.loggingChannelId) {
                    try {
                        const logChannel = interaction.guild.channels.cache.get(serverConfig.loggingChannelId);
                        if (logChannel) {
                            const logEmbed = new EmbedBuilder()
                                .setColor(0x0099ff)
                                .setTitle('📝 Custom Embed Created')
                                .addFields(
                                    {
                                        name: 'Created By',
                                        value: `${interaction.user.tag} (${interaction.user.id})`,
                                        inline: true
                                    },
                                    {
                                        name: 'Target Channel',
                                        value: `${channel}`,
                                        inline: true
                                    },
                                    {
                                        name: 'Pinged Everyone',
                                        value: pingEveryone ? 'Yes' : 'No',
                                        inline: true
                                    },
                                    {
                                        name: 'Embed Title',
                                        value: title,
                                        inline: false
                                    }
                                )
                                .setTimestamp();

                            await logChannel.send({ embeds: [logEmbed] });
                        }
                    } catch (logError) {
                        console.error('[Embed Command] Failed to log:', logError);
                    }
                }
            }

        } catch (error) {
            console.error('[Embed Command] Error:', error);
            await interaction.editReply({
                content: '❌ An error occurred while creating the embed. Please try again.'
            });
        }
    }
};