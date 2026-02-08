class BackgroundSyncScheduler {
    constructor(client, rankSyncService, configManager) {
        this.client = client;
        this.rankSyncService = rankSyncService;
        this.configManager = configManager;
        this.intervals = new Map();
    }

    start() {
        console.log('[BackgroundSync] Starting scheduler...');

        const configs = this.configManager.getAllServerConfigs();

        for (const config of configs) {
            if (config.syncSettings && config.syncSettings.backgroundSyncEnabled) {
                this.scheduleGuild(config);
            }
        }

        console.log(`[BackgroundSync] Scheduled ${this.intervals.size} guilds for background sync`);
    }

    scheduleGuild(config) {
        const intervalMinutes = config.syncSettings.syncIntervalMinutes || 30;
        const intervalMs = intervalMinutes * 60 * 1000;

        // Clear existing interval if any
        if (this.intervals.has(config.guildId)) {
            clearInterval(this.intervals.get(config.guildId));
        }

        // Schedule sync
        const intervalId = setInterval(async () => {
            console.log(`[BackgroundSync] Running scheduled sync for guild ${config.guildName || config.guildId}`);
            
            try {
                const result = await this.rankSyncService.syncAllInGuild(this.client, config.guildId);
                
                if (result.success) {
                    console.log(`[BackgroundSync] Completed for ${config.guildName || config.guildId}: ${result.results.synced} synced, ${result.results.failed} failed`);
                } else {
                    console.error(`[BackgroundSync] Failed for ${config.guildName || config.guildId}: ${result.error}`);
                }
            } catch (error) {
                console.error(`[BackgroundSync] Error syncing guild ${config.guildId}:`, error);
            }
        }, intervalMs);

        this.intervals.set(config.guildId, intervalId);

        console.log(`[BackgroundSync] Scheduled ${config.guildName || config.guildId} to sync every ${intervalMinutes} minutes`);
    }

    stop() {
        console.log('[BackgroundSync] Stopping scheduler...');

        for (const [guildId, intervalId] of this.intervals) {
            clearInterval(intervalId);
        }

        this.intervals.clear();
        console.log('[BackgroundSync] All intervals cleared');
    }

    reload() {
        console.log('[BackgroundSync] Reloading schedules...');
        this.stop();
        this.start();
    }

    getStatus() {
        return {
            activeSchedules: this.intervals.size,
            guilds: Array.from(this.intervals.keys())
        };
    }
}

module.exports = BackgroundSyncScheduler;
