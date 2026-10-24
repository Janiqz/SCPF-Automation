const assert = require('assert');
const ApplicationPublishingService = require('../src/services/ApplicationPublishingService');

const service = new ApplicationPublishingService({}, {}, {}, {
    apiUrl: 'https://panel.example.test',
    secret: 'a-secure-test-secret',
    notifierRoleId: '999999999999999999'
});

assert.strictEqual(service.isConfigured(), true);
assert.strictEqual(service.endpoint(), 'https://panel.example.test/api/internal/applications/jobs');
assert.strictEqual(service.notifierRoleId, '1544418796679204905');

const application = {
    title: 'Security Department Applications',
    description: 'Applications are now available.',
    departmentName: 'Security Department',
    departmentShortName: 'SD',
    departmentColor: '#4455aa',
    allowedRankNames: ['Junior Officer', 'Officer'],
    questionCount: 4,
    url: 'https://panel.example.test/applications/example'
};

const open = service.buildMessage(application, false);
assert.strictEqual(open.components.length, 1);
assert.strictEqual(open.embeds[0].data.fields.find(field => field.name === 'Status').value, '🟢 Open');

const closed = service.buildMessage(application, true);
assert.strictEqual(closed.components.length, 0);
assert.strictEqual(closed.embeds[0].data.fields.find(field => field.name === 'Status').value, '🔴 Closed');

async function testDurableMessageReuse() {
    let sends = 0;
    let edits = 0;
    let deletes = 0;
    let latest = null;
    const byJob = new Map();
    const message = {
        id: '1666666666666666666',
        edit: async () => { edits += 1; },
        delete: async () => { deletes += 1; }
    };
    const channel = {
        id: '1502347677734535280',
        guild: { id: '1145951510807720006' },
        isTextBased: () => true,
        send: async payload => {
            sends += 1;
            assert.strictEqual(payload.content, '<@&1544418796679204905>');
            assert.deepStrictEqual(payload.allowedMentions.roles, ['1544418796679204905']);
            return message;
        },
        messages: { fetch: async () => message }
    };
    const database = {
        getPortalApplicationDispatch: id => byJob.get(id) || null,
        getLatestPortalApplicationDispatch: () => latest,
        setPortalApplicationDispatch: (jobId, applicationId, guildId, channelId, messageId) => {
            const record = { job_id: jobId, application_id: applicationId, guild_id: guildId, channel_id: channelId, message_id: messageId };
            byJob.set(jobId, record);
            if (guildId !== 'dm') latest = record;
        }
    };
    const publisher = new ApplicationPublishingService(
        { channels: { fetch: async () => channel } },
        database,
        {},
        { apiUrl: 'https://panel.example.test', secret: 'a-secure-test-secret', httpClient: { post: async () => ({}) } }
    );
    const job = action => ({ id: `${action}-${Math.random()}`, action, application: { ...application, id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' } });
    await publisher.deliver(job('post'));
    await publisher.deliver(job('close'));
    await publisher.deliver(job('post'));
    await publisher.deliver(job('delete'));
    assert.strictEqual(sends, 1, 'reopening must not post a second Discord message');
    assert.strictEqual(edits, 2, 'closing and reopening must edit the original message');
    assert.strictEqual(deletes, 1, 'deleting the application must delete the original message');
}

testDurableMessageReuse()
    .then(() => console.log('Application publishing tests passed.'))
    .catch(error => { console.error(error); process.exitCode = 1; });
