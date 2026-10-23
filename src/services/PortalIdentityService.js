const axios = require('axios');

class PortalIdentityService {
    constructor(database, client, rankSyncService, configManager) {
        this.database = database;
        this.client = client;
        this.rankSyncService = rankSyncService;
        this.configManager = configManager;
        this.baseUrl = String(process.env.QUOTA_API_URL || '').replace(/\/+$/, '');
        this.secret = process.env.QUOTA_BOT_SECRET || '';
        this.timer = null;
    }

    isConfigured() { return Boolean(this.baseUrl && this.secret); }

    async fetchIdentities() {
        if (!this.isConfigured()) throw new Error('Portal identity sync is not configured.');
        const response = await axios.get(`${this.baseUrl}/api/internal/roblox-identities`, {
            headers: { Authorization: `Bearer ${this.secret}` },
            timeout: 15000
        });
        return Array.isArray(response.data.identities) ? response.data.identities : [];
    }

    async find(discordId) {
        return (await this.fetchIdentities()).find(row => row.discord_id === discordId) || null;
    }

    async importIdentity(identity) {
        this.database.setVerification(identity.discord_id, identity.roblox_user_id, identity.roblox_username);
    }

    async refresh() {
        const identities = await this.fetchIdentities();
        let changed = 0;
        for (const identity of identities) {
            const existing = this.database.getVerification(identity.discord_id);
            if (!existing || String(existing.roblox_id) !== String(identity.roblox_user_id)
                || existing.roblox_username !== identity.roblox_username) {
                await this.importIdentity(identity);
                changed += 1;
            }
        }
        if (!changed) return;
        for (const config of this.configManager.getAllServerConfigs()) {
            if (config.syncSettings?.backgroundSyncEnabled) {
                await this.rankSyncService.syncAllInGuild(this.client, config.guildId);
            }
        }
        console.log(`[PortalIdentity] Imported ${changed} new or changed portal link(s).`);
    }

    start() {
        if (!this.isConfigured() || this.timer) return;
        this.refresh().catch(error => console.error('[PortalIdentity] Initial sync failed:', error.message));
        this.timer = setInterval(() => this.refresh().catch(error => console.error('[PortalIdentity] Sync failed:', error.message)), 60 * 1000);
        this.timer.unref?.();
    }

    stop() { if (this.timer) clearInterval(this.timer); this.timer = null; }
}

module.exports = PortalIdentityService;
