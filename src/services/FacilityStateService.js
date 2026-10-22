const axios = require('axios');
const { randomUUID } = require('crypto');

const DEFAULT_DATASTORE = 'FacilityState_v1';
const DEFAULT_ENTRY = 'canonical';

class FacilityStateService {
    constructor(options = {}) {
        this.http = options.httpClient || axios;
        this.apiKey = options.apiKey || process.env.ROBLOX_OPEN_CLOUD_API_KEY;
        this.universeId = options.universeId || process.env.ROBLOX_UNIVERSE_ID;
        this.dataStore = options.dataStore || process.env.FACILITY_DATASTORE_NAME || DEFAULT_DATASTORE;
        this.entry = options.entry || process.env.FACILITY_DATASTORE_KEY || DEFAULT_ENTRY;
    }

    isConfigured() {
        return Boolean(this.apiKey && this.universeId);
    }

    getConfigurationError() {
        if (!this.apiKey && !this.universeId) {
            return 'ROBLOX_OPEN_CLOUD_API_KEY and ROBLOX_UNIVERSE_ID are not configured.';
        }
        if (!this.apiKey) return 'ROBLOX_OPEN_CLOUD_API_KEY is not configured.';
        if (!this.universeId) return 'ROBLOX_UNIVERSE_ID is not configured.';
        return null;
    }

    getEntryUrl() {
        const universe = encodeURIComponent(this.universeId);
        const store = encodeURIComponent(this.dataStore);
        const entry = encodeURIComponent(this.entry);
        return `https://apis.roblox.com/cloud/v2/universes/${universe}/data-stores/${store}/entries/${entry}`;
    }

    getControlUrl() {
        const universe = encodeURIComponent(this.universeId);
        const store = encodeURIComponent(this.dataStore);
        return `https://apis.roblox.com/cloud/v2/universes/${universe}/data-stores/${store}/entries/control`;
    }

    async fetchSnapshot() {
        const configurationError = this.getConfigurationError();
        if (configurationError) throw new Error(configurationError);

        try {
            const response = await this.http.get(this.getEntryUrl(), {
                headers: { 'x-api-key': this.apiKey },
                timeout: 10000
            });
            const snapshot = response && response.data && response.data.value;
            if (!snapshot || snapshot.SchemaVersion !== 1 || typeof snapshot.Components !== 'object') {
                throw new Error('Roblox returned an unsupported facility snapshot.');
            }
            return snapshot;
        } catch (error) {
            if (error.response) {
                throw new Error(`Roblox Open Cloud request failed (${error.response.status}).`);
            }
            throw error;
        }
    }

    async requestReset(requestedBy) {
        const configurationError = this.getConfigurationError();
        if (configurationError) throw new Error(configurationError);

        const command = {
            SchemaVersion: 1,
            Action: 'reset',
            RequestId: randomUUID(),
            RequestedAt: Math.floor(Date.now() / 1000),
            RequestedBy: String(requestedBy || '')
        };
        try {
            await this.http.patch(`${this.getControlUrl()}?allowMissing=true`, {
                value: command
            }, {
                headers: {
                    'x-api-key': this.apiKey,
                    'Content-Type': 'application/json'
                },
                timeout: 10000
            });
            return command;
        } catch (error) {
            if (error.response) {
                if (error.response.status === 403) {
                    throw new Error('The Roblox Open Cloud key needs universe-datastores.objects:update permission.');
                }
                throw new Error(`Roblox Open Cloud reset request failed (${error.response.status}).`);
            }
            throw error;
        }
    }
}

module.exports = FacilityStateService;
