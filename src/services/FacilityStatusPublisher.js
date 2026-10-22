const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder
} = require('discord.js');

const CRITICAL_COLOUR = 0xd9363e;
const DEGRADED_COLOUR = 0xe6a817;
const STABLE_COLOUR = 0x2fa866;
const DEFAULT_REFRESH_MS = 30 * 1000;
const DEFAULT_STALE_SECONDS = 120;
const ALERT_COOLDOWN_SECONDS = 30 * 60;

function numeric(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function getScpSummary(components) {
    const tracked = [];
    const breached = [];
    const incidents = [];
    for (const [key, state] of Object.entries(components)) {
        if (!key.startsWith('SCP:') || !state || typeof state !== 'object') continue;
        const name = key.slice(4);
        tracked.push(name);
        if (state.Status === 'breached' || state.Status === 'displaced') breached.push(name);
        if (state.Status === 'outbreak') incidents.push(`${name} outbreak`);
    }
    return { tracked, breached, incidents };
}

function summarizeSnapshot(snapshot, nowSeconds = Math.floor(Date.now() / 1000), staleSeconds = DEFAULT_STALE_SECONDS) {
    const components = snapshot.Components || {};
    const lights = components.Lights || {};
    const cafeteria = components.Cafeteria || {};
    const alarms = components.Alarms || {};
    const elevators = components.Elevators || {};
    const scps = getScpSummary(components);
    const updatedAt = numeric(snapshot.UpdatedAt);
    const age = updatedAt > 0 ? Math.max(0, nowSeconds - updatedAt) : Infinity;
    const stale = age > staleSeconds;
    const activeAlarm = typeof alarms.ActivePanelId === 'string' ? alarms.ActivePanelId : '';
    const brokenLights = numeric(lights.BrokenCount);
    const totalLights = numeric(lights.TotalLights || lights.TotalCount);
    const stock = numeric(cafeteria.TotalStock);
    const capacity = numeric(cafeteria.TotalCapacity);
    const brokenElevators = numeric(elevators.BrokenCount);
    const disabledElevators = numeric(elevators.DisabledCount);
    const totalElevators = numeric(elevators.TotalElevators);
    const lowStock = capacity > 0 && stock / capacity < 0.3;

    let level = 'stable';
    if (activeAlarm || scps.breached.length > 0 || scps.incidents.length > 0) level = 'critical';
    else if (brokenLights > 0 || brokenElevators > 0 || disabledElevators > 0 || lowStock) level = 'degraded';

    return {
        level,
        stale,
        age,
        updatedAt,
        playerCount: numeric(snapshot.PlayerCount),
        placeId: String(snapshot.PlaceId || ''),
        jobId: String(snapshot.JobId || ''),
        revision: numeric(snapshot.Revision),
        activeAlarm,
        brokenLights,
        totalLights,
        stock,
        capacity,
        brokenElevators,
        disabledElevators,
        totalElevators,
        scps
    };
}

function formatAlarmName(panelId) {
    if (!panelId) return 'No active alarm';
    return panelId
        .replace(/Panel$/, '')
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .trim();
}

function buildMessage(snapshot, nowSeconds, activity) {
    const summary = summarizeSnapshot(snapshot, nowSeconds);
    const styles = {
        stable: { colour: STABLE_COLOUR, title: 'Facility Stable', icon: '🟢' },
        degraded: { colour: DEGRADED_COLOUR, title: 'Facility Degraded', icon: '🟡' },
        critical: { colour: CRITICAL_COLOUR, title: 'Facility Emergency', icon: '🔴' }
    };
    const style = styles[summary.level];
    const activeIncidents = [
        ...summary.scps.breached.map(name => `${name} breached`),
        ...summary.scps.incidents
    ];
    const scpValue = activeIncidents.length
        ? `⚠️ ${activeIncidents.join(', ')}`
        : `${summary.scps.tracked.length} tracked • all contained`;
    const alarmValue = summary.activeAlarm ? `🚨 ${formatAlarmName(summary.activeAlarm)}` : 'No active alarm';
    const updatedText = Number.isFinite(summary.age)
        ? `<t:${summary.updatedAt}:R>`
        : 'Waiting for first live save';

    const embed = new EmbedBuilder()
        .setColor(style.colour)
        .setTitle(`${style.icon} Area 37 • ${style.title}`)
        .setDescription('Latest canonical Area 37 state. This remains in effect until a live server reports a change.')
        .addFields(
            { name: 'Personnel', value: `${summary.playerCount} online`, inline: true },
            { name: 'SCP Containment', value: scpValue, inline: true },
            { name: 'Alarm', value: alarmValue, inline: true },
            { name: 'Lighting', value: `${summary.brokenLights}${summary.totalLights ? ` / ${summary.totalLights}` : ''} broken`, inline: true },
            { name: 'Cafeteria', value: summary.capacity ? `${summary.stock} / ${summary.capacity} stocked` : 'No stock data', inline: true },
            { name: 'Elevators', value: `${summary.brokenElevators} broken • ${summary.disabledElevators} disabled • ${summary.totalElevators} tracked`, inline: true },
            { name: 'Last update', value: `${updatedText} • revision ${summary.revision}`, inline: false }
        )
        .setFooter({ text: 'Area 37 Facility Status • updates automatically' })
        .setTimestamp(new Date(summary.updatedAt > 0 ? summary.updatedAt * 1000 : Date.now()));

    if (activity && activity.active === true) {
        embed.addFields({
            name: 'Active Activity',
            value: `**${activity.statusLabel || activity.displayName || activity.type}**\n${activity.reason || 'No reason provided.'}\nStarted <t:${numeric(activity.startedAt)}:R>`,
            inline: false
        });
    }

    const components = [];
    if (summary.placeId) {
        const joinUrl = summary.stale || !summary.jobId
            ? `https://www.roblox.com/games/start?placeId=${encodeURIComponent(summary.placeId)}`
            : `https://www.roblox.com/games/start?placeId=${encodeURIComponent(summary.placeId)}&gameInstanceId=${encodeURIComponent(summary.jobId)}`;
        components.push(new ActionRowBuilder().addComponents(
            new ButtonBuilder().setLabel('Join Facility').setStyle(ButtonStyle.Link).setURL(joinUrl)
        ));
    }
    return { embeds: [embed], components, summary };
}

class FacilityStatusPublisher {
    constructor(client, stateService, configManager, options = {}) {
        this.client = client;
        this.stateService = stateService;
        this.configManager = configManager;
        this.interval = null;
        this.refreshMs = Math.max(15000, numeric(options.refreshMs || process.env.FACILITY_STATUS_REFRESH_SECONDS, 30) * (options.refreshMs ? 1 : 1000));
        this.observedLevels = new Map();
        this.refreshInProgress = false;
        this.lastSnapshot = null;
    }

    start() {
        if (this.interval) return;
        this.refreshAll().catch(error => console.error('[FacilityStatus] Initial refresh failed:', error.message));
        this.interval = setInterval(() => {
            this.refreshAll().catch(error => console.error('[FacilityStatus] Refresh failed:', error.message));
        }, this.refreshMs);
    }

    stop() {
        if (this.interval) clearInterval(this.interval);
        this.interval = null;
    }

    async refreshAll() {
        if (this.refreshInProgress) return;
        this.refreshInProgress = true;
        try {
            const configs = this.configManager.getAllServerConfigs()
                .filter(config => config.facilityStatus && config.facilityStatus.enabled);
            if (!configs.length || !this.stateService.isConfigured()) return;
            let snapshot;
            try {
                snapshot = await this.stateService.fetchSnapshot();
                this.lastSnapshot = snapshot;
            } catch (error) {
                if (!this.lastSnapshot) throw error;
                snapshot = this.lastSnapshot;
                console.warn('[FacilityStatus] Using the last verified snapshot:', error.message);
            }
            const results = await Promise.allSettled(configs.map(config => this.publish(config, snapshot)));
            for (const result of results) {
                if (result.status === 'rejected') {
                    console.error('[FacilityStatus] Could not update a configured Discord message:', result.reason.message);
                }
            }
        } finally {
            this.refreshInProgress = false;
        }
    }

    async refreshGuild(guildId) {
        const config = this.configManager.getServerConfig(guildId);
        if (!config || !config.facilityStatus || !config.facilityStatus.enabled) {
            throw new Error('Facility status is not set up in this server.');
        }
        const snapshot = await this.stateService.fetchSnapshot();
        this.lastSnapshot = snapshot;
        return this.publish(config, snapshot);
    }

    async publish(config, snapshot) {
        const settings = config.facilityStatus;
        const channel = await this.client.channels.fetch(settings.channelId);
        if (!channel || !channel.isTextBased()) throw new Error('Configured facility channel is unavailable.');
        const payload = buildMessage(snapshot, undefined, settings.activity);
        let message = null;
        if (settings.messageId) {
            try { message = await channel.messages.fetch(settings.messageId); } catch (_) { message = null; }
        }
        if (!message) {
            try {
                const recentMessages = await channel.messages.fetch({ limit: 50 });
                message = recentMessages.find(candidate =>
                    candidate.author.id === this.client.user.id
                    && candidate.embeds.some(embed =>
                        embed.footer && embed.footer.text === 'Area 37 Facility Status • updates automatically'
                    )
                ) || null;
            } catch (_) {
                message = null;
            }
        }
        if (message) await message.edit({ embeds: payload.embeds, components: payload.components });
        else {
            message = await channel.send({ embeds: payload.embeds, components: payload.components });
        }
        if (settings.messageId !== message.id) {
            settings.messageId = message.id;
            this.configManager.addOrUpdateServer(config);
        }

        const previousLevel = this.observedLevels.get(config.guildId);
        this.observedLevels.set(config.guildId, payload.summary.level);
        const now = Math.floor(Date.now() / 1000);
        const cooldownPassed = now - numeric(settings.lastAlertAt) >= ALERT_COOLDOWN_SECONDS;
        if (settings.alertEveryone === true && previousLevel && previousLevel !== 'critical'
            && payload.summary.level === 'critical' && cooldownPassed) {
            await channel.send({
                content: '@everyone Facility stability has reached **critical**. Review the live status above.',
                allowedMentions: { parse: ['everyone'] }
            });
            settings.lastAlertAt = now;
            this.configManager.addOrUpdateServer(config);
        }
        return payload.summary;
    }

    async setup(interaction, channel, alertEveryone) {
        const config = this.configManager.getServerConfig(interaction.guildId);
        if (!config) throw new Error('This Discord server has no bot configuration yet.');
        const snapshot = await this.stateService.fetchSnapshot();
        const payload = buildMessage(snapshot, undefined, config.facilityStatus && config.facilityStatus.activity);
        const sent = await channel.send({ embeds: payload.embeds, components: payload.components });
        config.facilityStatus = {
            enabled: true,
            channelId: channel.id,
            messageId: sent.id,
            alertEveryone: alertEveryone === true,
            lastAlertAt: 0
        };
        const result = this.configManager.addOrUpdateServer(config);
        if (!result.success) {
            await sent.delete().catch(() => {});
            throw new Error(`Could not save facility configuration: ${result.error}`);
        }
        this.observedLevels.set(interaction.guildId, summarizeSnapshot(snapshot).level);
        this.lastSnapshot = snapshot;
        return sent;
    }

    setAlerts(guildId, enabled) {
        const config = this.configManager.getServerConfig(guildId);
        if (!config || !config.facilityStatus) {
            throw new Error('Facility status is not set up in this server.');
        }
        config.facilityStatus.alertEveryone = enabled === true;
        const result = this.configManager.addOrUpdateServer(config);
        if (!result.success) throw new Error(`Could not save facility configuration: ${result.error}`);
    }

    async disable(guildId) {
        const config = this.configManager.getServerConfig(guildId);
        if (!config || !config.facilityStatus) {
            throw new Error('Facility status is not set up in this server.');
        }
        const settings = config.facilityStatus;
        try {
            const channel = await this.client.channels.fetch(settings.channelId);
            if (channel && channel.isTextBased() && settings.messageId) {
                const message = await channel.messages.fetch(settings.messageId);
                const embed = new EmbedBuilder()
                    .setColor(0x69707d)
                    .setTitle('⚫ Area 37 • Facility Feed Disabled')
                    .setDescription('Live facility reporting was disabled by the Discord server owner.')
                    .setTimestamp();
                await message.edit({ embeds: [embed], components: [] });
            }
        } catch (error) {
            console.warn('[FacilityStatus] Could not mark the old message as disabled:', error.message);
        }
        settings.enabled = false;
        const result = this.configManager.addOrUpdateServer(config);
        if (!result.success) throw new Error(`Could not save facility configuration: ${result.error}`);
        this.observedLevels.delete(guildId);
    }
}

module.exports = FacilityStatusPublisher;
module.exports.buildMessage = buildMessage;
module.exports.summarizeSnapshot = summarizeSnapshot;
module.exports.formatAlarmName = formatAlarmName;
