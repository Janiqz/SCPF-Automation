const assert = require('assert');
const command = require('../src/commands/globalannounce');

async function run() {
    const sent = [];
    const channels = new Map(['11111111111111111', '22222222222222222'].map(id => [id, {
        isTextBased: () => true,
        guild: { members: { me: {} } },
        permissionsFor: () => ({ has: () => true }),
        send: async payload => sent.push({ id, payload })
    }]));
    let response = '';
    const interaction = {
        guild: { ownerId: 'owner' },
        user: { id: 'owner', tag: 'Owner#0001' },
        client: { channels: { fetch: async id => channels.get(id) } },
        options: {
            getString: name => ({ title: 'Foundation Notice', message: 'Report to your departments.', image: null })[name],
            getBoolean: () => false
        },
        deferReply: async () => {},
        editReply: async value => { response = value; }
    };
    const configManager = {
        getAllServerConfigs: () => [
            { guildId: '1', guildName: 'One', announcementChannelId: '11111111111111111' },
            { guildId: '2', guildName: 'Two', announcementChannelId: '22222222222222222' },
            { guildId: '3', guildName: 'Not configured', announcementChannelId: null }
        ]
    };

    await command.execute(interaction, { configManager });
    assert.strictEqual(sent.length, 2);
    assert.strictEqual(sent[0].payload.content, undefined);
    assert.deepStrictEqual(sent[0].payload.allowedMentions, { parse: [] });
    assert.match(response, /2\/2/);

    let denied = '';
    await command.execute({
        guild: { ownerId: 'owner' },
        user: { id: 'not-owner' },
        reply: async payload => { denied = payload.content; }
    }, { configManager });
    assert.match(denied, /Only the Discord server owner/);

    console.log('global announcement tests passed');
}

run().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
