const assert = require('assert');
const FacilityStateService = require('../src/services/FacilityStateService');
const { summarizeSnapshot, buildMessage, formatAlarmName } = require('../src/services/FacilityStatusPublisher');
const facilityCommand = require('../src/commands/facility');
const SessionAnnouncementService = require('../src/services/SessionAnnouncementService');

function snapshot(overrides = {}) {
    return {
        SchemaVersion: 1,
        Revision: 12,
        UpdatedAt: 1_000,
        PlaceId: 5161073653,
        JobId: 'job-id',
        PlayerCount: 18,
        Components: {
            Lights: { BrokenCount: 2, TotalLights: 389 },
            Cafeteria: { TotalStock: 24, TotalCapacity: 30 },
            Alarms: { ActivePanelId: null },
            Elevators: { BrokenCount: 0, DisabledCount: 0, TotalElevators: 12 },
            'SCP:SCP-173': { Status: 'contained' }
        },
        ...overrides
    };
}

(async () => {
    const degraded = summarizeSnapshot(snapshot(), 1_030);
    assert.strictEqual(degraded.level, 'degraded');
    assert.strictEqual(degraded.scps.tracked.length, 1);
    assert.strictEqual(formatAlarmName('BreachAlarmPanel'), 'Breach Alarm');
    assert.strictEqual(formatAlarmName('CodeYellowAlarmPanel'), 'Code Yellow Alarm');

    const emergencyData = snapshot();
    emergencyData.Components = { ...emergencyData.Components, Alarms: { ActivePanelId: 'BreachAlarm' } };
    assert.strictEqual(summarizeSnapshot(emergencyData, 1_030).level, 'critical');

    const displacedData = snapshot();
    displacedData.Components = { ...displacedData.Components, 'SCP:SCP-173': { Status: 'displaced' } };
    assert.strictEqual(summarizeSnapshot(displacedData, 1_030).level, 'critical');

    assert.strictEqual(summarizeSnapshot(snapshot(), 1_500).level, 'degraded');
    const payload = buildMessage(snapshot(), 1_030);
    assert.strictEqual(payload.components.length, 1);
    assert(payload.components[0].toJSON().components[0].url.includes('gameInstanceId=job-id'));
    const lastKnownPayload = buildMessage(snapshot(), 1_500);
    assert.strictEqual(lastKnownPayload.summary.stale, true);
    assert.strictEqual(lastKnownPayload.summary.level, 'degraded');
    assert(!lastKnownPayload.embeds[0].toJSON().title.includes('Offline'));
    assert(!lastKnownPayload.components[0].toJSON().components[0].url.includes('gameInstanceId'));
    const activityPayload = buildMessage(snapshot(), 1_030, {
        active: true,
        statusLabel: 'Paid Riot Active',
        reason: 'Commissioned event',
        startedAt: 1_020
    });
    const activityField = activityPayload.embeds[0].toJSON().fields.find(field => field.name === 'Active Activity');
    assert(activityField.value.includes('Paid Riot Active'));

    const sessionService = new SessionAnnouncementService({}, {}, {}, {
        configPath: require('path').join(__dirname, '../config/activity.json')
    });
    assert.strictEqual(sessionService.isAuthorized({
        guild: { ownerId: 'owner' },
        user: { id: 'member' },
        member: { roles: { cache: [{ name: 'O5 Council' }] } }
    }), true);
    assert.strictEqual(sessionService.isAuthorized({
        guild: { ownerId: 'owner' },
        user: { id: 'member' },
        member: { roles: { cache: [{ name: 'Foundation Personnel' }] } }
    }), false);
    const paidRiotMention = sessionService.buildMention(sessionService.loadConfig().types['paid-riot']);
    assert.strictEqual(paidRiotMention.content, '@everyone');
    assert(paidRiotMention.allowedMentions.parse.includes('everyone'));

    let request;
    const service = new FacilityStateService({
        apiKey: 'not-a-real-key',
        universeId: '1234',
        httpClient: {
            get: async (url, options) => {
                request = { url, options };
                return { data: { value: snapshot() } };
            }
        }
    });
    const result = await service.fetchSnapshot();
    assert.strictEqual(result.Revision, 12);
    assert(request.url.endsWith('/universes/1234/data-stores/FacilityState_v1/entries/canonical'));
    assert.strictEqual(request.options.headers['x-api-key'], 'not-a-real-key');

    let unauthorizedReply;
    await facilityCommand.execute({
        guild: { ownerId: 'owner' },
        user: { id: 'not-owner' },
        reply: async payload => { unauthorizedReply = payload; }
    }, {});
    assert(unauthorizedReply.content.includes('Only the Discord server owner'));

    let alertsValue = null;
    let authorizedReply;
    await facilityCommand.execute({
        guild: { ownerId: 'owner' },
        guildId: 'guild',
        user: { id: 'owner' },
        deferReply: async () => {},
        editReply: async payload => { authorizedReply = payload; },
        options: {
            getSubcommand: () => 'alerts',
            getBoolean: () => true
        }
    }, {
        facilityState: { isConfigured: () => false },
        facilityStatus: { setAlerts: (_guildId, enabled) => { alertsValue = enabled; } }
    });
    assert.strictEqual(alertsValue, true);
    assert(authorizedReply.includes('enabled'));

    console.log('Facility status tests passed.');
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
