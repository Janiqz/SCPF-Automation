const assert = require('assert');
const FacilityStateService = require('../src/services/FacilityStateService');
const {
    summarizeSnapshot,
    buildMessage,
    formatAlarmName,
    buildConfiguredMention
} = require('../src/services/FacilityStatusPublisher');
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
    const minorDamage = summarizeSnapshot(snapshot(), 1_030);
    assert.strictEqual(minorDamage.level, 'stable');
    assert.strictEqual(minorDamage.scps.tracked.length, 1);
    const severeDamageData = snapshot();
    severeDamageData.Components = { ...severeDamageData.Components, Lights: { BrokenCount: 40, TotalLights: 389 } };
    assert.strictEqual(summarizeSnapshot(severeDamageData, 1_030).level, 'degraded');
    assert.strictEqual(formatAlarmName('BreachAlarmPanel'), 'Breach Alarm');
    assert.strictEqual(formatAlarmName('CodeYellowAlarmPanel'), 'Code Yellow Alarm');

    const emergencyData = snapshot();
    emergencyData.Components = { ...emergencyData.Components, Alarms: { ActivePanelId: 'BreachAlarm' } };
    assert.strictEqual(summarizeSnapshot(emergencyData, 1_030).level, 'critical');

    const displacedData = snapshot();
    displacedData.Components = { ...displacedData.Components, 'SCP:SCP-173': { Status: 'displaced' } };
    assert.strictEqual(summarizeSnapshot(displacedData, 1_030).level, 'critical');

    assert.strictEqual(summarizeSnapshot(snapshot(), 1_500).level, 'stable');
    const payload = buildMessage(snapshot(), 1_030);
    assert.strictEqual(payload.components.length, 1);
    assert(payload.components[0].toJSON().components[0].url.includes('gameInstanceId=job-id'));
    assert(payload.components[0].toJSON().components.some(component =>
        component.custom_id === 'facility_toggle_session_notifications'
        && component.label === 'Toggle Session Notifications'
    ));
    const lastKnownPayload = buildMessage(snapshot(), 1_500);
    assert.strictEqual(lastKnownPayload.summary.stale, true);
    assert.strictEqual(lastKnownPayload.summary.level, 'stable');
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
    const paidRiotMention = sessionService.buildMention(sessionService.loadConfig().paidRiotAlert);
    assert.strictEqual(paidRiotMention.content, '<@&1562905845308592239>');
    assert.deepStrictEqual(paidRiotMention.allowedMentions.roles, ['1562905845308592239']);
    const roleMention = sessionService.buildMention({ notifyMode: 'role', notifyRoleId: '123456789012345678' });
    assert.strictEqual(roleMention.content, '<@&123456789012345678>');
    assert.deepStrictEqual(roleMention.allowedMentions.roles, ['123456789012345678']);
    assert.strictEqual(sessionService.buildMention({ notifyMode: 'none' }).content, '');
    const criticalAlert = sessionService.loadConfig().facilityAlerts.critical;
    assert.strictEqual(buildConfiguredMention(criticalAlert).content, '<@&1562905845308592239>');
    assert.deepStrictEqual(buildConfiguredMention(criticalAlert).allowedMentions.parse, []);

    const subscriberRoleId = sessionService.loadConfig().subscriberRoleId;
    const roleChanges = [];
    let subscribed = false;
    const notificationInteraction = {
        user: { id: 'member' },
        guild: {
            members: {
                fetch: async () => ({
                    roles: {
                        cache: { has: () => subscribed },
                        add: async roleId => {
                            roleChanges.push(['add', roleId]);
                            subscribed = true;
                        },
                        remove: async roleId => {
                            roleChanges.push(['remove', roleId]);
                            subscribed = false;
                        }
                    }
                })
            }
        }
    };
    assert.strictEqual(await sessionService.toggleNotifications(notificationInteraction), true);
    assert.strictEqual(await sessionService.toggleNotifications(notificationInteraction), false);
    assert.deepStrictEqual(roleChanges, [
        ['add', subscriberRoleId],
        ['remove', subscriberRoleId]
    ]);

    let request;
    let resetRequest;
    const service = new FacilityStateService({
        apiKey: 'not-a-real-key',
        universeId: '1234',
        httpClient: {
            get: async (url, options) => {
                request = { url, options };
                return { data: { value: snapshot() } };
            },
            patch: async (url, data, options) => {
                resetRequest = { url, data, options };
                return { data: {} };
            }
        }
    });
    const result = await service.fetchSnapshot();
    assert.strictEqual(result.Revision, 12);
    assert(request.url.endsWith('/universes/1234/data-stores/FacilityState_v1/entries/canonical'));
    assert.strictEqual(request.options.headers['x-api-key'], 'not-a-real-key');
    const resetCommand = await service.requestReset('owner');
    assert.strictEqual(resetCommand.Action, 'reset');
    assert(resetRequest.url.endsWith('/entries/control?allowMissing=true'));
    assert.strictEqual(resetRequest.data.value.RequestedBy, 'owner');

    let editedSession;
    const endedActivity = {
        active: true,
        type: 'standard',
        displayName: 'Facility Session',
        reason: 'Test',
        announcementChannelId: 'channel',
        announcementMessageId: 'message'
    };
    const sessionConfig = {
        guildId: 'guild',
        facilityStatus: { enabled: true, channelId: 'channel', activity: endedActivity }
    };
    const lifecycleService = new SessionAnnouncementService({
        channels: {
            fetch: async () => ({
                isTextBased: () => true,
                messages: {
                    fetch: async () => ({ edit: async payload => { editedSession = payload; } })
                }
            })
        }
    }, {
        getServerConfig: () => sessionConfig,
        getAllServerConfigs: () => [sessionConfig],
        addOrUpdateServer: () => ({ success: true })
    }, {
        refreshGuild: async () => {}
    }, {
        configPath: require('path').join(__dirname, '../config/activity.json')
    });
    await lifecycleService.end({ guildId: 'guild', user: { id: 'owner' } });
    assert.strictEqual(endedActivity.active, false);
    assert(endedActivity.deleteAt - endedActivity.endedAt === 30 * 60);
    assert.strictEqual(editedSession.embeds[0].toJSON().color, 0xffffff);
    assert.strictEqual(editedSession.embeds[0].toJSON().image.url, 'attachment://ThumbnailCoverAnnouncement.png');
    assert.strictEqual(editedSession.files[0].name, 'ThumbnailCoverAnnouncement.png');
    lifecycleService.stopCleanup();

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
