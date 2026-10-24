const axios = require('axios');
const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder
} = require('discord.js');

class ApplicationPublishingService {
    constructor(client, database, configManager, options = {}) {
        this.client = client;
        this.database = database;
        this.configManager = configManager;
        this.apiUrl = String(options.apiUrl || process.env.QUOTA_API_URL || '').replace(/\/+$/, '');
        this.secret = String(options.secret || process.env.QUOTA_BOT_SECRET || '');
        this.notifierRoleId = '1544418796679204905';
        this.channelId = String(options.channelId || process.env.APPLICATION_ANNOUNCEMENT_CHANNEL_ID || '1502347677734535280');
        this.intervalMs = Math.max(15, Number(options.intervalSeconds || process.env.APPLICATION_POLL_SECONDS) || 60) * 1000;
        this.http = options.httpClient || axios;
        this.timer = null;
        this.running = false;
    }

    isConfigured() {
        return /^https?:\/\//.test(this.apiUrl) && this.secret.length >= 16;
    }

    endpoint() {
        return `${this.apiUrl}/api/internal/applications/jobs`;
    }

    buildMessage(application, closed = false) {
        const rankText = Array.isArray(application.allowedRankNames) && application.allowedRankNames.length
            ? application.allowedRankNames.join(', ').slice(0, 1024)
            : 'All department ranks';
        const embed = new EmbedBuilder()
            .setColor(closed ? 0x8b0000 : parseInt(String(application.departmentColor || '#8b0000').replace('#', ''), 16))
            .setTitle(application.title)
            .setDescription(application.description || 'A new departmental application is available.')
            .addFields(
                { name: 'Department', value: `${application.departmentShortName} — ${application.departmentName}`, inline: true },
                { name: 'Status', value: closed ? '🔴 Closed' : '🟢 Open', inline: true },
                { name: 'Questions', value: String(application.questionCount || 0), inline: true },
                { name: 'Eligible ranks', value: rankText, inline: false }
            )
            .setFooter({ text: 'Janiqz SCPF Personnel Applications' })
            .setTimestamp();
        const components = closed ? [] : [new ActionRowBuilder().addComponents(
            new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Apply on the Personnel Panel').setURL(application.url)
        )];
        return { embeds: [embed], components };
    }

    async acknowledge(job, delivered, details = {}) {
        await this.http.post(this.endpoint(), {
            id: job.id,
            delivered,
            error: details.error ? String(details.error).slice(0, 500) : undefined,
            guildId: details.guildId,
            channelId: details.channelId,
            messageId: details.messageId
        }, {
            headers: { Authorization: `Bearer ${this.secret}` },
            timeout: 10000
        });
    }

    async deliver(job) {
        const application = job.application;
        const prior = this.database.getPortalApplicationDispatch(job.id);
        if (prior) {
            await this.acknowledge(job, true, job.action === 'result' ? {} : {
                guildId: prior.guild_id,
                channelId: prior.channel_id,
                messageId: prior.message_id
            });
            return;
        }

        if (job.action === 'result') {
            const result = job.notification;
            if (!result || !/^\d{16,20}$/.test(String(result.discordId))) throw new Error('The application result has no valid Discord recipient.');
            const accepted = result.outcome === 'accepted';
            const user = await this.client.users.fetch(String(result.discordId));
            const message = await user.send({ embeds: [new EmbedBuilder()
                .setColor(accepted ? 0x2ecc71 : 0xe74c3c)
                .setTitle(accepted ? 'Application accepted' : 'Application denied')
                .setDescription(`Your **${application.title}** application has been reviewed.`)
                .addFields(
                    { name: 'Department', value: `${application.departmentShortName} — ${application.departmentName}` },
                    { name: 'Result', value: accepted ? 'Accepted' : 'Denied', inline: true },
                    { name: 'Reason', value: String(result.reason || 'No additional reason was provided.').slice(0, 1024) }
                )
                .setFooter({ text: 'Janiqz SCPF Personnel Applications' })
                .setTimestamp()] });
            this.database.setPortalApplicationDispatch(job.id, application.id, 'dm', String(result.discordId), message.id);
            await this.acknowledge(job, true);
            return;
        }

        const channel = await this.client.channels.fetch(this.channelId);
        if (!channel || !channel.isTextBased()) throw new Error('The configured announcement channel is unavailable.');
        const existing = this.database.getLatestPortalApplicationDispatch(application.id);
        const messageId = application.discordMessageId || (existing && existing.message_id);
        let message;

        if (job.action === 'delete') {
            if (messageId) {
                try {
                    message = await channel.messages.fetch(String(messageId));
                    await message.delete();
                    this.database.setPortalApplicationDispatch(job.id, application.id, channel.guild.id, channel.id, messageId);
                } catch (error) {
                    if (error.code !== 10008) throw error;
                }
            }
            await this.acknowledge(job, true);
            return;
        }

        if (messageId) {
            message = await channel.messages.fetch(String(messageId));
            await message.edit({
                content: null,
                ...this.buildMessage(application, job.action === 'close'),
                allowedMentions: { parse: [], roles: [] }
            });
        } else {
            if (job.action === 'close') throw new Error('The original application announcement has not been posted yet.');
            const shouldPing = /^\d{16,20}$/.test(this.notifierRoleId);
            message = await channel.send({
                content: shouldPing ? `<@&${this.notifierRoleId}>` : undefined,
                ...this.buildMessage(application, false),
                allowedMentions: { parse: [], roles: shouldPing ? [this.notifierRoleId] : [] }
            });
        }

        this.database.setPortalApplicationDispatch(job.id, application.id, channel.guild.id, channel.id, message.id);
        await this.acknowledge(job, true, { guildId: channel.guild.id, channelId: channel.id, messageId: message.id });
    }

    async poll() {
        if (!this.isConfigured() || this.running) return;
        this.running = true;
        try {
            const response = await this.http.get(this.endpoint(), {
                headers: { Authorization: `Bearer ${this.secret}` },
                timeout: 15000
            });
            const jobs = Array.isArray(response.data && response.data.jobs) ? response.data.jobs : [];
            for (const job of jobs) {
                try {
                    await this.deliver(job);
                } catch (error) {
                    console.warn(`[Applications] Publishing job ${job.id} failed: ${error.message}`);
                    await this.acknowledge(job, false, { error: error.message }).catch(() => {});
                }
            }
            if (jobs.length) console.log(`[Applications] Processed ${jobs.length} publishing job(s).`);
        } catch (error) {
            console.warn('[Applications] Publishing poll failed:', error.message);
        } finally {
            this.running = false;
        }
    }

    start() {
        if (!this.isConfigured()) {
            console.log('[Applications] Publishing disabled; portal API settings are not configured.');
            return;
        }
        if (this.timer) return;
        this.poll();
        this.timer = setInterval(() => this.poll(), this.intervalMs);
        this.timer.unref?.();
        console.log(`[Applications] Publishing polling enabled every ${Math.round(this.intervalMs / 1000)} seconds.`);
    }

    stop() {
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
    }
}

module.exports = ApplicationPublishingService;
