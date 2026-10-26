const axios = require('axios');

class NotificationPreferenceService {
    constructor(options = {}) {
        this.apiUrl = String(options.apiUrl || process.env.QUOTA_API_URL || '').replace(/\/+$/, '');
        this.secret = String(options.secret || process.env.QUOTA_BOT_SECRET || '');
        this.http = options.httpClient || axios;
        this.cache = new Map();
        this.cacheMs = 60 * 1000;
    }

    isConfigured() {
        return /^https?:\/\//.test(this.apiUrl) && this.secret.length >= 16;
    }

    async canSend(discordId) {
        if (!this.isConfigured() || !/^\d{16,20}$/.test(String(discordId))) return true;
        const cached = this.cache.get(String(discordId));
        if (cached && cached.expiresAt > Date.now()) return cached.enabled;
        try {
            const response = await this.http.get(`${this.apiUrl}/api/internal/notifications/preferences`, {
                params: { discordId: String(discordId) },
                headers: { Authorization: `Bearer ${this.secret}` },
                timeout: 10000
            });
            const enabled = response.data?.botDmsEnabled !== false;
            this.cache.set(String(discordId), { enabled, expiresAt: Date.now() + this.cacheMs });
            return enabled;
        } catch (error) {
            console.warn(`[Notifications] Preference check failed for ${discordId}; retaining delivery: ${error.message}`);
            return true;
        }
    }
}

module.exports = NotificationPreferenceService;
