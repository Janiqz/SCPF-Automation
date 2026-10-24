const assert = require('assert');
const ApplicationPublishingService = require('../src/services/ApplicationPublishingService');

const service = new ApplicationPublishingService({}, {}, {}, {
    apiUrl: 'https://panel.example.test',
    secret: 'a-secure-test-secret',
    notifierRoleId: '1544418796679204905'
});

assert.strictEqual(service.isConfigured(), true);
assert.strictEqual(service.endpoint(), 'https://panel.example.test/api/internal/applications/jobs');

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

console.log('Application publishing tests passed.');
