const fs = require('fs');
const path = require('path');

class ConfigManager {
    constructor(configPath) {
        this.configPath = configPath || path.join(__dirname, '../../config/servers.json');
        this.servers = new Map();
        this.loadConfig();
    }

    loadConfig() {
        try {
            if (!fs.existsSync(this.configPath)) {
                console.error('[ConfigManager] Config file not found:', this.configPath);
                console.log('[ConfigManager] Creating default config file...');
                this.createDefaultConfig();
            }

            const configData = fs.readFileSync(this.configPath, 'utf8');
            const config = JSON.parse(configData);

            this.servers.clear();

            if (config.servers && Array.isArray(config.servers)) {
                config.servers.forEach(server => {
                    this.servers.set(server.guildId, server);
                });
                console.log(`[ConfigManager] Loaded ${this.servers.size} server configurations`);
            } else {
                console.warn('[ConfigManager] No servers found in config');
            }
        } catch (error) {
            console.error('[ConfigManager] Error loading config:', error.message);
            throw error;
        }
    }

    createDefaultConfig() {
        const defaultConfig = {
            servers: []
        };

        const dir = path.dirname(this.configPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        fs.writeFileSync(this.configPath, JSON.stringify(defaultConfig, null, 2));
        console.log('[ConfigManager] Created default config file');
    }

    reloadConfig() {
        console.log('[ConfigManager] Reloading configuration...');
        this.loadConfig();
    }

    getServerConfig(guildId) {
        return this.servers.get(guildId);
    }

    getAllServerConfigs() {
        return Array.from(this.servers.values());
    }

    hasServerConfig(guildId) {
        return this.servers.has(guildId);
    }

    /**
     * Get rank mapping for a specific rank in a guild
     */
    getRankMapping(guildId, rank) {
        const config = this.getServerConfig(guildId);
        if (!config || !config.rankMappings) {
            return null;
        }

        // Try exact match first
        if (config.rankMappings[rank.toString()]) {
            return config.rankMappings[rank.toString()];
        }

        // Find the highest rank that's <= user's rank
        const ranks = Object.keys(config.rankMappings)
            .map(r => parseInt(r))
            .filter(r => r <= rank)
            .sort((a, b) => b - a);

        if (ranks.length > 0) {
            return config.rankMappings[ranks[0].toString()];
        }

        return null;
    }

    /**
     * Get nickname prefix based on server config and rank
     */
    getNicknamePrefix(guildId, rank) {
        const config = this.getServerConfig(guildId);
        if (!config) {
            return '';
        }

        // If custom format with static prefix
        if (config.nicknameFormat === 'custom' && config.customNicknamePrefix) {
            return config.customNicknamePrefix;
        }

        // If rank-based format
        const rankMapping = this.getRankMapping(guildId, rank);
        if (rankMapping && rankMapping.nicknamePrefix) {
            return rankMapping.nicknamePrefix;
        }

        return '';
    }

    /**
     * Format nickname according to server rules
     */
    formatNickname(guildId, robloxUsername, rank) {
        const prefix = this.getNicknamePrefix(guildId, rank);
        return `${prefix}${robloxUsername}`;
    }

    /**
     * Get all role names for a guild
     */
    getAllRoleNames(guildId) {
        const config = this.getServerConfig(guildId);
        if (!config || !config.rankMappings) {
            return [];
        }

        return Object.values(config.rankMappings)
            .map(mapping => mapping.roleName)
            .filter((name, index, self) => self.indexOf(name) === index);
    }

    /**
     * Add or update server configuration
     */
    addOrUpdateServer(serverConfig) {
        try {
            const configData = fs.readFileSync(this.configPath, 'utf8');
            const config = JSON.parse(configData);

            if (!config.servers) {
                config.servers = [];
            }

            const index = config.servers.findIndex(s => s.guildId === serverConfig.guildId);
            
            if (index !== -1) {
                config.servers[index] = serverConfig;
            } else {
                config.servers.push(serverConfig);
            }

            fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));
            this.reloadConfig();

            return { success: true };
        } catch (error) {
            console.error('[ConfigManager] Error adding/updating server:', error);
            return { success: false, error: error.message };
        }
    }
}

module.exports = ConfigManager;
