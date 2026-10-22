const assert = require('assert');
const QuotaNotificationService = require('../src/services/QuotaNotificationService');

(async () => {
    const sent = [];
    const acknowledgements = [];
    const jobs = [{
        id: '0c78d0f3-5c2e-4716-b90d-02af0fb9900b',
        notification_type: 'reminder',
        week_start: '2026-10-19',
        departmentName: 'Security Department',
        departmentShortName: 'SD',
        discord_id: '123456789012345678',
        earned_seconds: 1800,
        required_seconds: 7200
    }];
    const httpClient = {
        get: async () => ({ data: { jobs } }),
        post: async (_url, body) => { acknowledgements.push(body); return { data: { success: true } }; }
    };
    const service = new QuotaNotificationService({
        users: { fetch: async id => ({ send: async payload => sent.push({ id, payload }) }) }
    }, {
        apiUrl: 'https://docs.example.com',
        secret: '12345678901234567890123456789012',
        httpClient
    });
    assert.strictEqual(service.isConfigured(), true);
    assert.strictEqual(service.formatDuration(7380), '2h 3m');
    await service.poll();
    assert.strictEqual(sent.length, 1);
    assert.strictEqual(sent[0].id, jobs[0].discord_id);
    assert(sent[0].payload.embeds[0].toJSON().description.includes('Security Department'));
    assert(sent[0].payload.components[0].toJSON().components[0].url.endsWith('/quota'));
    assert.deepStrictEqual(acknowledgements[0], { id: jobs[0].id, delivered: true, error: undefined });
    console.log('Quota notification tests passed.');
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
