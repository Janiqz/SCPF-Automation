const assert = require('assert');
const { Collection, PermissionFlagsBits } = require('discord.js');
const RankSyncService = require('../src/services/RankSyncService');
const { parseRankSelection, hasBindingPermission } = require('../src/commands/bind');

const mappings = {
    3: { roleName: 'Foundation Personnel' },
    7: { roleName: 'Executive Personnel' },
    8: { roleName: 'Executive Personnel' },
    9: { roleName: 'Site Director' },
    10: { roleName: 'O5 Council' },
    11: { roleName: 'O5 Head' }
};

assert.deepStrictEqual(parseRankSelection('7-11', mappings), [7, 8, 9, 10, 11]);
assert.deepStrictEqual(parseRankSelection('3, 10-11', mappings), [3, 10, 11]);
assert.throws(() => parseRankSelection('6', mappings), /not one of this server's configured default ranks/);
assert.throws(() => parseRankSelection('11-7', mappings), /Invalid rank range/);

const roleCache = new Collection([
    ['o5', { name: 'O5 Council' }]
]);
assert.strictEqual(hasBindingPermission({
    guild: { ownerId: 'owner' },
    user: { id: 'member' },
    member: { roles: { cache: roleCache } }
}), true);
assert.strictEqual(hasBindingPermission({
    guild: { ownerId: 'owner' },
    user: { id: 'member' },
    member: { roles: { cache: new Collection() } }
}), false);

(async () => {
    const managementRole = { id: 'management', name: 'Management', position: 5 };
    const memberRoles = new Collection();
    const changes = [];
    const member = {
        user: { tag: 'TestUser' },
        guild: {
            roles: { cache: new Collection([[managementRole.id, managementRole]]) },
            members: {
                fetchMe: async () => ({
                    permissions: { has: permission => permission === PermissionFlagsBits.ManageRoles },
                    roles: { highest: { position: 10 } }
                })
            }
        },
        roles: {
            cache: memberRoles,
            add: async role => {
                changes.push(`add:${role.id}`);
                memberRoles.set(role.id, role);
            },
            remove: async role => {
                changes.push(`remove:${role.id}`);
                memberRoles.delete(role.id);
            }
        }
    };

    const service = new RankSyncService({}, {}, {});
    const config = {
        roleBindings: [{ roleId: managementRole.id, roleName: managementRole.name, ranks: [7, 8, 9] }]
    };

    let result = await service.syncBoundRoles(member, config, 8);
    assert.strictEqual(result.updated, true);
    assert.deepStrictEqual(changes, ['add:management']);

    result = await service.syncBoundRoles(member, config, 3);
    assert.strictEqual(result.updated, true);
    assert.deepStrictEqual(changes, ['add:management', 'remove:management']);

    console.log('Role binding tests passed.');
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
