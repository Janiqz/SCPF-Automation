const axios = require('axios');
const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder
} = require('discord.js');

class QuotaNotificationService {
    constructor(client, options = {}) {
        this.client = client;
        this.apiUrl = String(options.apiUrl || process.env.QUOTA_API_URL || '').replace(/\/+$/, '');
        this.secret = String(options.secret || process.env.QUOTA_BOT_SECRET || '');
        this.intervalMs = Math.max(5, Number(options.intervalMinutes || process.env.QUOTA_NOTIFICATION_INTERVAL_MINUTES) || 15) * 60 * 1000;
        this.http = options.httpClient || axios;
        this.notificationPreferences = options.notificationPreferences || null;
        this.timer = null;
        this.running = false;
    }

    isConfigured() {
        return /^https?:\/\//.test(this.apiUrl) && this.secret.length >= 16;
    }

    endpoint() {
        return `${this.apiUrl}/api/internal/quota/notifications`;
    }

    formatDuration(seconds) {
        const minutes = Math.floor(Math.max(0, Number(seconds) || 0) / 60);
        const hours = Math.floor(minutes / 60);
        const remainder = minutes % 60;
        return hours > 0 ? `${hours}h ${remainder}m` : `${remainder}m`;
    }

    buildMessage(job) {
        const missed = job.notification_type === 'missed';
        const earned = this.formatDuration(job.earned_seconds);
        const required = this.formatDuration(job.required_seconds);
        const embed = new EmbedBuilder()
            .setColor(missed ? 0xd9363e : 0xe6a817)
            .setTitle(missed ? 'Weekly Quota Not Met' : 'Weekly Quota Reminder')
            .setDescription(missed
                ? `Your **${job.departmentName}** activity quota was not met for the week beginning ${job.week_start}. Department leadership may review this result.`
                : `Your **${job.departmentName}** activity quota is still in progress. Only time spent on the matching Area 37 team counts.`)
            .addFields(
                { name: 'Progress', value: `${earned} / ${required}`, inline: true },
                { name: 'Department', value: job.departmentShortName || job.departmentName, inline: true },
                { name: 'Week commencing', value: String(job.week_start), inline: true }
            )
            .setFooter({ text: 'Area 37 Weekly Department Quota' })
            .setTimestamp();
        const components = [];
        if (/^https:\/\//.test(this.apiUrl)) {
            components.push(new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setLabel('View Quota Progress')
                    .setStyle(ButtonStyle.Link)
                    .setURL(`${this.apiUrl}/quota`)
            ));
        }
        return { embeds: [embed], components };
    }

    async acknowledge(job, delivered, error) {
        await this.http.post(this.endpoint(), {
            id: job.id,
            delivered,
            error: error ? String(error).slice(0, 500) : undefined
        }, {
            headers: { Authorization: `Bearer ${this.secret}` },
            timeout: 10000
        });
    }

    async deliver(job) {
        try {
            if (this.notificationPreferences && !await this.notificationPreferences.canSend(job.discord_id)) {
                await this.acknowledge(job, true);
                return true;
            }
            const user = await this.client.users.fetch(job.discord_id);
            await user.send(this.buildMessage(job));
            await this.acknowledge(job, true);
            return true;
        } catch (error) {
            const message = error && error.message ? error.message : 'Discord delivery failed';
            console.warn(`[Quota] Could not notify Discord user ${job.discord_id}: ${message}`);
            try {
                await this.acknowledge(job, false, message);
            } catch (ackError) {
                console.warn('[Quota] Could not defer failed notification:', ackError.message);
            }
            return false;
        }
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
            for (const job of jobs) await this.deliver(job);
            if (jobs.length) console.log(`[Quota] Processed ${jobs.length} notification job(s).`);
        } catch (error) {
            console.warn('[Quota] Notification poll failed:', error.message);
        } finally {
            this.running = false;
        }
    }

    start() {
        if (!this.isConfigured()) {
            console.log('[Quota] Notifications disabled; QUOTA_API_URL and QUOTA_BOT_SECRET are not configured.');
            return;
        }
        if (this.timer) return;
        this.poll();
        this.timer = setInterval(() => this.poll(), this.intervalMs);
        if (typeof this.timer.unref === 'function') this.timer.unref();
        console.log(`[Quota] Notification polling enabled every ${Math.round(this.intervalMs / 60000)} minutes.`);
    }

    stop() {
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
    }
}

module.exports = QuotaNotificationService;
