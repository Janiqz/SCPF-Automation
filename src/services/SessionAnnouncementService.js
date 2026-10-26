const fs = require('fs');
const path = require('path');
const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder
} = require('discord.js');
const { resolveEmbedImage } = require('../utils/embedImage');

class SessionAnnouncementService {
    constructor(client, configManager, facilityStatus, options = {}) {
        this.client = client;
        this.configManager = configManager;
        this.facilityStatus = facilityStatus;
        this.configPath = options.configPath || path.join(__dirname, '../../config/activity.json');
        this.database = options.database || null;
        this.notificationPreferences = options.notificationPreferences || null;
        this.deletionTimers = new Map();
        this.reminderTimers = new Map();
        this.cleanupInterval = null;
        this.subscriberSyncInterval = null;
        this.subscriberSyncRunning = false;
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
        const mode = String(template.notifyMode || 'none').toLowerCase();
        if (mode === 'everyone') {
            content.push('@everyone');
            allowedMentions.parse.push('everyone');
        }
        if (mode === 'role' && typeof template.notifyRoleId === 'string'
            && /^\d{16,20}$/.test(template.notifyRoleId)) {
            content.push(`<@&${template.notifyRoleId}>`);
            allowedMentions.roles.push(template.notifyRoleId);
        }
        return { content: content.join(' '), allowedMentions };
    }

    getStatusUrl(guildId, settings) {
        if (!settings.messageId) return null;
        return `https://discord.com/channels/${guildId}/${settings.channelId}/${settings.messageId}`;
    }

    async toggleNotifications(interaction) {
        const config = this.loadConfig();
        const roleId = String(config.subscriberRoleId || '');
        if (!/^\d{16,20}$/.test(roleId)) {
            throw new Error('The session notification role is not configured.');
        }
        if (!interaction.guild) {
            throw new Error('Session notifications can only be changed inside the Discord server.');
        }
        const member = await interaction.guild.members.fetch(interaction.user.id);
        const currentlyEnabled = this.database
            ? this.database.areSessionNotificationsEnabled(interaction.user.id, interaction.guild.id)
            : member.roles.cache.has(roleId);
        const enabled = !currentlyEnabled;
        if (enabled) {
            await member.roles.add(roleId, 'Member enabled Area 37 session notifications');
        } else {
            await member.roles.remove(roleId, 'Member disabled Area 37 session notifications');
        }
        this.database?.setSessionNotificationsEnabled(interaction.user.id, interaction.guild.id, enabled);
        return enabled;
    }

    async ensureMemberSubscribed(member) {
        if (!member || member.user?.bot || !this.database) return false;
        const roleId = String(this.loadConfig().subscriberRoleId || '');
        if (!/^\d{16,20}$/.test(roleId) || !member.guild.roles.cache.has(roleId)) return false;
        if (!this.database.areSessionNotificationsEnabled(member.id, member.guild.id)) return false;
        if (member.roles.cache.has(roleId)) return true;
        await member.roles.add(roleId, 'Session notifications are enabled by default');
        return true;
    }

    async syncSubscriberRoles() {
        if (this.subscriberSyncRunning) return;
        this.subscriberSyncRunning = true;
        try {
            const roleId = String(this.loadConfig().subscriberRoleId || '');
            if (!/^\d{16,20}$/.test(roleId)) return;
            for (const guild of this.client.guilds.cache.values()) {
                const role = guild.roles.cache.get(roleId);
                if (!role) continue;
                // Use the gateway cache. A separate startup audit performs
                // the one full member fetch; repeating opcode 8 requests here
                // causes Discord gateway rate limits.
                const members = guild.members.cache;
                let added = 0;
                for (const member of members.values()) {
                    if (member.user.bot || member.roles.cache.has(roleId)) continue;
                    if (!this.database.areSessionNotificationsEnabled(member.id, guild.id)) continue;
                    try {
                        await member.roles.add(role, 'Session notifications are enabled by default');
                        added += 1;
                    } catch (error) {
                        console.warn(`[Session Notifications] Could not enable notifications for ${member.id}: ${error.message}`);
                    }
                }
                if (added) console.log(`[Session Notifications] Enabled for ${added} member(s) in ${guild.name}.`);
            }
        } finally {
            this.subscriberSyncRunning = false;
        }
    }

    startSubscriberRoleSync() {
        if (!this.database || this.subscriberSyncInterval) return;
        this.syncSubscriberRoles().catch(error => console.error('[Session Notifications] Initial role sync failed:', error.message));
        this.subscriberSyncInterval = setInterval(() => {
            this.syncSubscriberRoles().catch(error => console.error('[Session Notifications] Role sync failed:', error.message));
        }, 10 * 60 * 1000);
        this.subscriberSyncInterval.unref?.();
    }

    startCleanup() {
        if (this.cleanupInterval) return;
        this.restoreDeletionTimers();
        this.cleanupInterval = setInterval(() => this.restoreDeletionTimers(), 60 * 1000);
        if (typeof this.cleanupInterval.unref === 'function') this.cleanupInterval.unref();
    }

    stopCleanup() {
        if (this.cleanupInterval) clearInterval(this.cleanupInterval);
        this.cleanupInterval = null;
        if (this.subscriberSyncInterval) clearInterval(this.subscriberSyncInterval);
        this.subscriberSyncInterval = null;
        for (const timer of this.deletionTimers.values()) clearTimeout(timer);
        this.deletionTimers.clear();
        for (const timer of this.reminderTimers.values()) clearTimeout(timer);
        this.reminderTimers.clear();
    }

    restoreDeletionTimers() {
        const reminderMinutes = Math.max(1, Number(this.loadConfig().sessionEmbed?.reminderAfterMinutes) || 120);
        for (const serverConfig of this.configManager.getAllServerConfigs()) {
            const activity = serverConfig.facilityStatus && serverConfig.facilityStatus.activity;
            if (activity && activity.active === false && activity.deleteAt
                && activity.announcementChannelId && activity.announcementMessageId) {
                this.scheduleDeletion(serverConfig.guildId, activity);
            }
            if (activity && activity.active === true && activity.startedAt
                && !activity.reminderSentAt) {
                if (!activity.reminderAt) {
                    activity.reminderAt = Number(activity.startedAt) + Math.round(reminderMinutes * 60);
                    this.configManager.addOrUpdateServer(serverConfig);
                }
                this.scheduleReminder(serverConfig.guildId, activity);
            }
        }
    }

    scheduleReminder(guildId, activity) {
        if (!activity.startedBy || !activity.reminderAt || activity.reminderSentAt) return;
        const existing = this.reminderTimers.get(guildId);
        if (existing) clearTimeout(existing);
        const delay = Math.max(0, Number(activity.reminderAt) * 1000 - Date.now());
        const timer = setTimeout(() => {
            this.reminderTimers.delete(guildId);
            this.sendSessionReminder(guildId).catch(error => {
                console.warn('[Session] Could not send the two-hour reminder:', error.message);
            });
        }, Math.min(delay, 2_147_000_000));
        timer.unref?.();
        this.reminderTimers.set(guildId, timer);
    }

    async sendSessionReminder(guildId) {
        const serverConfig = this.configManager.getServerConfig(guildId);
        const settings = serverConfig && serverConfig.facilityStatus;
        const activity = settings && settings.activity;
        if (!activity || activity.active !== true || activity.reminderSentAt
            || !activity.reminderAt || Number(activity.reminderAt) * 1000 > Date.now()) return false;

        activity.reminderSentAt = Math.floor(Date.now() / 1000);
        const result = this.configManager.addOrUpdateServer(serverConfig);
        if (!result.success) throw new Error(`Could not save reminder state: ${result.error}`);

        const config = this.loadConfig();
        const embedConfig = config.sessionEmbed || {};
        if (this.notificationPreferences && !await this.notificationPreferences.canSend(activity.startedBy)) return true;
        const user = await this.client.users.fetch(activity.startedBy);
        const embed = new EmbedBuilder()
            .setColor(Number(embedConfig.colour) || 0xffffff)
            .setTitle(String(embedConfig.reminderTitle || 'Is your Area 37 session still running?'))
            .setDescription(String(embedConfig.reminderDescription
                || 'Your session has been active for two hours. If it has finished, return to the server and run `/session end`.'))
            .addFields(
                { name: 'Session', value: String(activity.displayName || 'Facility Session'), inline: true },
                { name: 'Started', value: `<t:${activity.startedAt}:R>`, inline: true },
                { name: 'Reason', value: String(activity.reason || 'No reason provided.').slice(0, 1024) }
            )
            .setTimestamp();
        const components = [];
        const statusUrl = this.getStatusUrl(guildId, settings);
        if (statusUrl) {
            components.push(new ActionRowBuilder().addComponents(
                new ButtonBuilder().setLabel('View Live Facility Status').setStyle(ButtonStyle.Link).setURL(statusUrl)
            ));
        }
        await user.send({ embeds: [embed], components });
        return true;
    }

    scheduleDeletion(guildId, activity) {
        if (!activity.announcementChannelId || !activity.announcementMessageId || !activity.deleteAt) return;
        const existing = this.deletionTimers.get(guildId);
        if (existing) clearTimeout(existing);
        const delay = Math.max(0, Number(activity.deleteAt) * 1000 - Date.now());
        const timer = setTimeout(() => {
            this.deletionTimers.delete(guildId);
            this.deleteAnnouncement(guildId).catch(error => {
                console.warn('[Session] Could not delete ended session message:', error.message);
            });
        }, Math.min(delay, 2_147_000_000));
        if (typeof timer.unref === 'function') timer.unref();
        this.deletionTimers.set(guildId, timer);
    }

    async deleteAnnouncement(guildId) {
        const serverConfig = this.configManager.getServerConfig(guildId);
        const activity = serverConfig && serverConfig.facilityStatus && serverConfig.facilityStatus.activity;
        if (!activity || activity.active !== false || !activity.deleteAt
            || Number(activity.deleteAt) * 1000 > Date.now()) return false;
        try {
            const channel = await this.client.channels.fetch(activity.announcementChannelId);
            if (channel && channel.isTextBased()) {
                const message = await channel.messages.fetch(activity.announcementMessageId);
                await message.delete();
            }
        } catch (error) {
            if (!error || error.code !== 10008) throw error;
        }
        delete activity.announcementMessageId;
        delete activity.announcementChannelId;
        delete activity.deleteAt;
        this.configManager.addOrUpdateServer(serverConfig);
        return true;
    }

    async start(interaction, type, suppliedReason) {
        const activityConfig = this.loadConfig();
        const template = activityConfig.types && activityConfig.types[type];
        if (!template) throw new Error('That session type is not configured.');
        const serverConfig = this.configManager.getServerConfig(interaction.guildId);
        const settings = serverConfig && serverConfig.facilityStatus;
        if (!settings || !settings.enabled) throw new Error('Facility status must be enabled before starting a session.');
        if (settings.activity && settings.activity.active === true) {
            throw new Error('A facility session is already active. End it before starting another.');
        }
        const oldTimer = this.deletionTimers.get(interaction.guildId);
        if (oldTimer) clearTimeout(oldTimer);
        this.deletionTimers.delete(interaction.guildId);
        const previousActivity = settings.activity;
        if (previousActivity && previousActivity.active === false
            && previousActivity.announcementChannelId && previousActivity.announcementMessageId) {
            try {
                const previousChannel = await this.client.channels.fetch(previousActivity.announcementChannelId);
                if (previousChannel && previousChannel.isTextBased()) {
                    const previousMessage = await previousChannel.messages.fetch(previousActivity.announcementMessageId);
                    await previousMessage.delete();
                }
            } catch (error) {
                if (!error || error.code !== 10008) {
                    console.warn('[Session] Could not remove the previous ended session message:', error.message);
                }
            }
        }

        const reason = suppliedReason && suppliedReason.trim()
            ? suppliedReason.trim().slice(0, 500)
            : String(template.defaultReason || 'No reason provided.');
        const now = Math.floor(Date.now() / 1000);
        const reminderMinutes = Math.max(1, Number(activityConfig.sessionEmbed?.reminderAfterMinutes) || 120);
        settings.activity = {
            active: true,
            type,
            displayName: String(template.displayName || type),
            statusLabel: String(template.statusLabel || template.displayName || type),
            reason,
            startedAt: now,
            startedBy: interaction.user.id,
            reminderAt: now + Math.round(reminderMinutes * 60)
        };
        const result = this.configManager.addOrUpdateServer(serverConfig);
        if (!result.success) throw new Error(`Could not save session state: ${result.error}`);

        const channel = await this.client.channels.fetch(settings.channelId);
        if (!channel || !channel.isTextBased()) throw new Error('The configured facility channel is unavailable.');
        const context = { reason, userId: interaction.user.id, displayName: settings.activity.displayName };
        const mention = this.buildMention(template);
        const embedConfig = activityConfig.sessionEmbed || {};
        const banner = resolveEmbedImage(embedConfig);
        const embed = new EmbedBuilder()
            .setColor(Number(embedConfig.colour) || 0xffffff)
            .setTitle(this.render(template.startTitle, context))
            .setDescription(this.render(template.startDescription, context))
            .addFields(
                { name: 'Reason', value: reason },
                { name: 'Started by', value: `<@${interaction.user.id}>`, inline: true },
                { name: 'Started', value: `<t:${now}:R>`, inline: true }
            )
            .setTimestamp();
        if (banner.url) embed.setImage(banner.url);
        const components = [];
        const statusUrl = this.getStatusUrl(interaction.guildId, settings);
        if (statusUrl) {
            components.push(new ActionRowBuilder().addComponents(
                new ButtonBuilder().setLabel('View Live Facility Status').setStyle(ButtonStyle.Link).setURL(statusUrl)
            ));
        }
        const announcement = await channel.send({
            content: mention.content || undefined,
            allowedMentions: mention.allowedMentions,
            embeds: [embed],
            components,
            files: banner.files
        });
        settings.activity.announcementChannelId = channel.id;
        settings.activity.announcementMessageId = announcement.id;
        const saveAnnouncement = this.configManager.addOrUpdateServer(serverConfig);
        if (!saveAnnouncement.success) {
            console.warn('[Session] Could not persist the announcement message ID:', saveAnnouncement.error);
        }
        this.scheduleReminder(interaction.guildId, settings.activity);
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
        const reminderTimer = this.reminderTimers.get(interaction.guildId);
        if (reminderTimer) clearTimeout(reminderTimer);
        this.reminderTimers.delete(interaction.guildId);
        const template = activityConfig.types && activityConfig.types[activity.type] || {};
        activity.active = false;
        activity.endedAt = Math.floor(Date.now() / 1000);
        activity.endedBy = interaction.user.id;
        const embedConfig = activityConfig.sessionEmbed || {};
        const banner = resolveEmbedImage(embedConfig);
        const deleteAfterMinutes = Math.max(1, Number(embedConfig.deleteAfterMinutes) || 30);
        activity.deleteAt = activity.endedAt + Math.round(deleteAfterMinutes * 60);
        const result = this.configManager.addOrUpdateServer(serverConfig);
        if (!result.success) throw new Error(`Could not save session state: ${result.error}`);

        const channelId = activity.announcementChannelId || settings.channelId;
        const channel = await this.client.channels.fetch(channelId);
        if (channel && channel.isTextBased() && activity.announcementMessageId) {
            const context = {
                reason: activity.reason,
                userId: interaction.user.id,
                displayName: activity.displayName
            };
            const embed = new EmbedBuilder()
                .setColor(Number(embedConfig.colour) || 0xffffff)
                .setTitle(this.render(template.endTitle || 'Area 37 Session Ended', context))
                .setDescription(this.render(template.endDescription || 'The active session has concluded.', context))
                .setTimestamp();
            if (banner.url) embed.setImage(banner.url);
            const announcement = await channel.messages.fetch(activity.announcementMessageId);
            await announcement.edit({
                content: null,
                embeds: [embed],
                components: [],
                allowedMentions: { parse: [], roles: [] },
                attachments: [],
                files: banner.files
            });
        }
        this.scheduleDeletion(interaction.guildId, activity);
        await this.facilityStatus.refreshGuild(interaction.guildId).catch(error => {
            console.warn('[Session] Facility embed refresh will retry automatically:', error.message);
        });
        return activity;
    }
}

module.exports = SessionAnnouncementService;
