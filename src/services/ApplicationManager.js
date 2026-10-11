const fs = require('fs');
const path = require('path');

class ApplicationManager {
    constructor() {
        this.configPath = path.join(__dirname, '../../config/applications.json');
        this.config = null;
        this.loadConfig();
    }

    loadConfig() {
        try {
            if (fs.existsSync(this.configPath)) {
                const data = fs.readFileSync(this.configPath, 'utf8');
                this.config = JSON.parse(data);
                console.log('[ApplicationManager] Loaded application config');
            } else {
                console.warn('[ApplicationManager] No applications.json found');
                this.config = { servers: [] };
            }
        } catch (error) {
            console.error('[ApplicationManager] Error loading config:', error);
            this.config = { servers: [] };
        }
    }

    reloadConfig() {
        this.loadConfig();
    }

    getServerConfig(guildId) {
        return this.config.servers.find(s => s.guildId === guildId);
    }

    hasServerConfig(guildId) {
        return !!this.getServerConfig(guildId);
    }

    getApplication(guildId, applicationId) {
        const serverConfig = this.getServerConfig(guildId);
        if (!serverConfig) return null;
        return serverConfig.applications.find(app => app.id === applicationId);
    }

    getAllApplications(guildId) {
        const serverConfig = this.getServerConfig(guildId);
        if (!serverConfig) return [];
        return serverConfig.applications;
    }

    getApplicationChannelId(guildId) {
        const serverConfig = this.getServerConfig(guildId);
        return serverConfig?.applicationChannelId || null;
    }

    canUserApply(guildId, applicationId, userRank) {
        const application = this.getApplication(guildId, applicationId);
        if (!application) return { canApply: false, reason: 'Application not found' };

        // Check if user meets rank requirement
        if (userRank < application.requiredRank) {
            return { 
                canApply: false, 
                reason: `You need to be at least Rank ${application.requiredRank} to apply` 
            };
        }

        // Check if user is already at or above target rank
        if (userRank >= application.targetRank) {
            return {
                canApply: false,
                reason: `You are already Rank ${userRank}, which is at or above the target rank for this application`
            };
        }

        return { canApply: true };
    }

    getUserCooldown(database, userId, guildId, applicationId) {
        const application = this.getApplication(guildId, applicationId);
        if (!application) {
            return { onCooldown: false };
        }

        // Get user's last ACCEPTED application (any application, not just this one)
        const allApplications = database.getUserApplications(userId, guildId);
        const lastAcceptedApp = allApplications.find(app => app.status === 'accepted');

        if (!lastAcceptedApp) {
            return { onCooldown: false };
        }

        // Use the application's cooldown (for next level progression)
        if (application.cooldownDays === 0) {
            return { onCooldown: false };
        }

        const cooldownMs = application.cooldownDays * 24 * 60 * 60 * 1000;
        const timeSinceLastAccepted = Date.now() - lastAcceptedApp.reviewed_at;

        if (timeSinceLastAccepted < cooldownMs) {
            const timeRemaining = cooldownMs - timeSinceLastAccepted;
            const daysRemaining = Math.ceil(timeRemaining / (24 * 60 * 60 * 1000));
            return { 
                onCooldown: true, 
                daysRemaining,
                canApplyAt: lastAcceptedApp.reviewed_at + cooldownMs
            };
        }

        return { onCooldown: false };
    }

    getPendingApplicationCooldown(database, userId, guildId) {
        // 3 day cooldown for any pending application
        const allApplications = database.getUserApplications(userId, guildId);
        const pendingApp = allApplications.find(app => app.status === 'pending');

        if (!pendingApp) {
            return { onCooldown: false };
        }

        const cooldownMs = 3 * 24 * 60 * 60 * 1000; // 3 days
        const timeSincePending = Date.now() - pendingApp.submitted_at;

        if (timeSincePending < cooldownMs) {
            const timeRemaining = cooldownMs - timeSincePending;
            const daysRemaining = Math.ceil(timeRemaining / (24 * 60 * 60 * 1000));
            return { 
                onCooldown: true, 
                daysRemaining,
                canApplyAt: pendingApp.submitted_at + cooldownMs,
                reason: 'pending'
            };
        }

        return { onCooldown: false };
    }

    getReapplicationCooldown(database, userId, guildId, applicationId) {
        // 3 day cooldown for reapplying to same application after denial
        const lastApplication = database.getLastApplication(userId, guildId, applicationId);
        
        if (!lastApplication || lastApplication.status !== 'denied') {
            return { onCooldown: false };
        }

        const cooldownMs = 3 * 24 * 60 * 60 * 1000; // 3 days
        const timeSinceLastDenied = Date.now() - lastApplication.reviewed_at;

        if (timeSinceLastDenied < cooldownMs) {
            const timeRemaining = cooldownMs - timeSinceLastDenied;
            const daysRemaining = Math.ceil(timeRemaining / (24 * 60 * 60 * 1000));
            return { 
                onCooldown: true, 
                daysRemaining,
                canApplyAt: lastApplication.reviewed_at + cooldownMs,
                reason: 'denied'
            };
        }

        return { onCooldown: false };
    }
}

module.exports = ApplicationManager;