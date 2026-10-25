const {
    SlashCommandBuilder,
    EmbedBuilder,
    PermissionFlagsBits
} = require('discord.js');

const AUTHORIZED_ROLE_NAMES = new Set([
    'o5 council',
    'o5 head',
    'overseer',
    'the administrator'
]);

function hasBindingPermission(interaction) {
    if (!interaction.guild || !interaction.member) return false;
    if (interaction.user.id === interaction.guild.ownerId) return true;

    return interaction.member.roles.cache.some(role => {
        const name = role.name.trim().toLowerCase();
        return AUTHORIZED_ROLE_NAMES.has(name) || /^o5(?:\s|-)/i.test(name);
    });
}

function parseRankSelection(value, rankMappings) {
    const configuredRanks = new Set(
        Object.keys(rankMappings || {})
            .map(Number)
            .filter(rank => Number.isInteger(rank) && rank >= 0 && rank <= 255)
    );
    const selected = new Set();

    for (const rawToken of String(value || '').split(',')) {
        const token = rawToken.trim();
        if (!token) continue;

        const range = token.match(/^(\d{1,3})\s*-\s*(\d{1,3})$/);
        if (range) {
            const start = Number(range[1]);
            const end = Number(range[2]);
            if (start > end || start < 0 || end > 255) {
                throw new Error(`Invalid rank range: ${token}`);
            }
            for (let rank = start; rank <= end; rank += 1) {
                if (configuredRanks.has(rank)) selected.add(rank);
            }
            continue;
        }

        if (!/^\d{1,3}$/.test(token)) {
            throw new Error(`Invalid rank value: ${token}`);
        }
        const rank = Number(token);
        if (rank > 255 || !configuredRanks.has(rank)) {
            throw new Error(`Rank ${rank} is not one of this server's configured default ranks.`);
        }
        selected.add(rank);
    }

    const ranks = [...selected].sort((a, b) => a - b);
    if (ranks.length === 0) {
        throw new Error('No configured default ranks were selected.');
    }
    return ranks;
}

function describeRanks(ranks, rankMappings) {
    return ranks.map(rank => {
        const mapping = rankMappings[String(rank)];
        return `**${rank}** (${mapping?.roleName || 'Configured rank'})`;
    }).join(', ');
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('bind')
        .setDescription('Manage additional grouped roles for configured Roblox ranks')
        .addSubcommand(subcommand =>
            subcommand
                .setName('role')
                .setDescription('Bind a grouped Discord role to configured Roblox ranks')
                .addRoleOption(option =>
                    option
                        .setName('role')
                        .setDescription('The grouped Discord role, such as Management')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName('ranks')
                        .setDescription('Configured rank numbers or ranges, such as 7-11,255')
                        .setRequired(true)
                        .setMaxLength(100)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Remove a grouped role binding')
                .addRoleOption(option =>
                    option
                        .setName('role')
                        .setDescription('The grouped Discord role to unbind')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('List grouped role bindings in this server')
        ),

    async execute(interaction, { configManager }) {
        await interaction.deferReply({ flags: 64 });

        if (!interaction.guild || !interaction.guildId) {
            return interaction.editReply('This command can only be used inside a server.');
        }
        if (!hasBindingPermission(interaction)) {
            return interaction.editReply('You must be O5, Overseer, The Administrator, or the server owner to manage role bindings.');
        }

        const serverConfig = configManager.getServerConfig(interaction.guildId);
        if (!serverConfig || !serverConfig.rankMappings) {
            return interaction.editReply('This server does not have rank synchronization configured.');
        }

        const subcommand = interaction.options.getSubcommand();
        const bindings = Array.isArray(serverConfig.roleBindings)
            ? [...serverConfig.roleBindings]
            : [];

        if (subcommand === 'list') {
            const embed = new EmbedBuilder()
                .setColor(0x2b2c30)
                .setTitle('Grouped Role Bindings')
                .setDescription(bindings.length
                    ? 'These roles are applied in addition to each member’s normal rank role.'
                    : 'No grouped role bindings are configured for this server.');

            for (const binding of bindings.slice(0, 25)) {
                embed.addFields({
                    name: binding.roleName || binding.roleId,
                    value: describeRanks(binding.ranks || [], serverConfig.rankMappings),
                    inline: false
                });
            }
            return interaction.editReply({ embeds: [embed] });
        }

        const role = interaction.options.getRole('role', true);

        if (subcommand === 'remove') {
            const updatedBindings = bindings.filter(binding => String(binding.roleId) !== role.id);
            if (updatedBindings.length === bindings.length) {
                return interaction.editReply(`${role} does not have a grouped role binding.`);
            }
            serverConfig.roleBindings = updatedBindings;
            const result = configManager.addOrUpdateServer(serverConfig);
            if (!result.success) throw new Error(result.error);
            return interaction.editReply(`Removed the grouped rank binding for ${role}. It will be removed from ineligible members during their next sync.`);
        }

        if (role.id === interaction.guild.id || role.managed) {
            return interaction.editReply('That role cannot be managed by the bot.');
        }
        if (role.permissions.has(PermissionFlagsBits.Administrator)) {
            return interaction.editReply('Administrator roles cannot be used as automatic grouped roles.');
        }

        const actorIsOwner = interaction.user.id === interaction.guild.ownerId;
        if (!actorIsOwner && role.position >= interaction.member.roles.highest.position) {
            return interaction.editReply('You can only bind roles below your highest Discord role.');
        }

        const botMember = await interaction.guild.members.fetchMe();
        if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)
            || role.position >= botMember.roles.highest.position) {
            return interaction.editReply('Move the bot role above that role and ensure it has Manage Roles permission first.');
        }

        const defaultRoleNames = Object.values(serverConfig.rankMappings)
            .map(mapping => String(mapping.roleName || '').toLowerCase());
        if (defaultRoleNames.includes(role.name.toLowerCase())) {
            return interaction.editReply('That is already a default rank role. Grouped bindings must use an additional role, such as Management.');
        }

        let ranks;
        try {
            ranks = parseRankSelection(
                interaction.options.getString('ranks', true),
                serverConfig.rankMappings
            );
        } catch (error) {
            return interaction.editReply(error.message);
        }

        const existingIndex = bindings.findIndex(binding => String(binding.roleId) === role.id);
        const binding = {
            roleId: role.id,
            roleName: role.name,
            ranks,
            updatedBy: interaction.user.id,
            updatedAt: new Date().toISOString()
        };

        if (existingIndex >= 0) bindings[existingIndex] = binding;
        else {
            if (bindings.length >= 25) {
                return interaction.editReply('This server already has the maximum of 25 grouped role bindings.');
            }
            bindings.push(binding);
        }

        serverConfig.roleBindings = bindings;
        const result = configManager.addOrUpdateServer(serverConfig);
        if (!result.success) throw new Error(result.error);

        const embed = new EmbedBuilder()
            .setColor(0x2fa866)
            .setTitle(existingIndex >= 0 ? 'Role Binding Updated' : 'Role Binding Created')
            .setDescription(`${role} will be applied in addition to the normal rank role.`)
            .addFields({
                name: 'Configured ranks',
                value: describeRanks(ranks, serverConfig.rankMappings)
            })
            .setFooter({ text: 'Takes effect during the next verification or automatic rank sync.' });

        return interaction.editReply({ embeds: [embed] });
    },

    hasBindingPermission,
    parseRankSelection
};
