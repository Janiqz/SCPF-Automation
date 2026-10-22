const fs = require('fs');
const path = require('path');
const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder
} = require('discord.js');

class SessionAnnouncementService {
    constructor(client, configManager, facilityStatus, options = {}) {
        this.client = client;
        this.configManager = configManager;
        this.facilityStatus = facilityStatus;
        this.configPath = options.configPath || path.join(__dirname, '../../config/activity.json');
    }

    loadConfig() {
        return JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
    }

    isAuthorized(interaction) {
        if (!interaction.guild || !interaction.member) return false;
        if (interaction.user.id === interaction.guild.ownerId) return true;
        const config = this.loadConfig();
        const allowed = new Set(config.authorizedRoleNames || []);
        return interaction.member.roles.cache.some(role => allowed.has(role.name));
    }

    render(text, context) {
        return String(text || '')
            .replaceAll('{reason}', context.reason)
            .replaceAll('{user}', `<@${context.userId}>`)
            .replaceAll('{type}', context.displayName);
    }

    buildMention(template) {
        const content = [];
        const allowedMentions = { parse: [], roles: [] };
        if (template.notifyEveryone === true) {
            content.push('@everyone');
            allowedMentions.parse.push('everyone');
        }
        if (typeof template.notifyRoleId === 'string' && /^\d{16,20}$/.test(template.notifyRoleId)) {
            content.push(`<@&${template.notifyRoleId}>`);
            allowedMentions.roles.push(template.notifyRoleId);
        }
        return { content: content.join(' '), allowedMentions };
    }

    getStatusUrl(guildId, settings) {
        if (!settings.messageId) return null;
        return `https://discord.com/channels/${guildId}/${settings.channelId}/${settings.messageId}`;
    }

    async start(interaction, type, suppliedReason) {
        const activityConfig = this.loadConfig();
        const template = activityConfig.types && activityConfig.types[type];
        if (!template) throw new Error('That session type is not configured.');
        const serverConfig = this.configManager.getServerConfig(interaction.guildId);
        const settings = serverConfig && serverConfig.facilityStatus;
        if (!settings || !settings.enabled) throw new Error('Facility status must be enabled before starting a session.');

        const reason = suppliedReason && suppliedReason.trim()
            ? suppliedReason.trim().slice(0, 500)
            : String(template.defaultReason || 'No reason provided.');
        const now = Math.floor(Date.now() / 1000);
        settings.activity = {
            active: true,
            type,
            displayName: String(template.displayName || type),
            statusLabel: String(template.statusLabel || template.displayName || type),
            reason,
            startedAt: now,
            startedBy: interaction.user.id
        };
        const result = this.configManager.addOrUpdateServer(serverConfig);
        if (!result.success) throw new Error(`Could not save session state: ${result.error}`);

        const channel = await this.client.channels.fetch(settings.channelId);
        if (!channel || !channel.isTextBased()) throw new Error('The configured facility channel is unavailable.');
        const context = { reason, userId: interaction.user.id, displayName: settings.activity.displayName };
        const mention = this.buildMention(template);
        const embed = new EmbedBuilder()
            .setColor(Number(template.colour) || 0x3498db)
            .setTitle(this.render(template.startTitle, context))
            .setDescription(this.render(template.startDescription, context))
            .addFields(
                { name: 'Reason', value: reason },
                { name: 'Started by', value: `<@${interaction.user.id}>`, inline: true },
                { name: 'Started', value: `<t:${now}:R>`, inline: true }
            )
            .setTimestamp();
        const components = [];
        const statusUrl = this.getStatusUrl(interaction.guildId, settings);
        if (statusUrl) {
            components.push(new ActionRowBuilder().addComponents(
                new ButtonBuilder().setLabel('View Live Facility Status').setStyle(ButtonStyle.Link).setURL(statusUrl)
            ));
        }
        await channel.send({
            content: mention.content || undefined,
            allowedMentions: mention.allowedMentions,
            embeds: [embed],
            components
        });
        await this.facilityStatus.refreshGuild(interaction.guildId).catch(error => {
            console.warn('[Session] Facility embed refresh will retry automatically:', error.message);
        });
        return settings.activity;
    }

    async end(interaction) {
        const activityConfig = this.loadConfig();
        const serverConfig = this.configManager.getServerConfig(interaction.guildId);
        const settings = serverConfig && serverConfig.facilityStatus;
        const activity = settings && settings.activity;
        if (!settings || !activity || activity.active !== true) throw new Error('There is no active session to end.');
        const template = activityConfig.types && activityConfig.types[activity.type] || {};
        activity.active = false;
        activity.endedAt = Math.floor(Date.now() / 1000);
        activity.endedBy = interaction.user.id;
        const result = this.configManager.addOrUpdateServer(serverConfig);
        if (!result.success) throw new Error(`Could not save session state: ${result.error}`);

        const channel = await this.client.channels.fetch(settings.channelId);
        if (channel && channel.isTextBased()) {
            const context = {
                reason: activity.reason,
                userId: interaction.user.id,
                displayName: activity.displayName
            };
            const embed = new EmbedBuilder()
                .setColor(0x69707d)
                .setTitle(this.render(template.endTitle || 'Area 37 Session Ended', context))
                .setDescription(this.render(template.endDescription || 'The active session has concluded.', context))
                .setTimestamp();
            await channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
        }
        await this.facilityStatus.refreshGuild(interaction.guildId).catch(error => {
            console.warn('[Session] Facility embed refresh will retry automatically:', error.message);
        });
        return activity;
    }
}

module.exports = SessionAnnouncementService;
